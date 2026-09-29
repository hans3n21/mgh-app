// Kontaktdaten eines Kunden aus seiner Mail, zum Bestaetigen beim Anlegen aus der Mail.
// Quelle sind dieselben Funde wie fuer die Anonymisierung: die Regeln (mit dem
// aktuellen Code neu auf den neuen Mailteil angewendet), gespeicherte Funde des
// lokalen Dienstes und menschliche Entscheidungen. Nur eindeutige Angaben: stehen
// zwei verschiedene Telefonnummern oder Adressen im Text (z. B. die Shop-Fusszeile
// eines Kontaktformulars), bleibt das Feld leer.
// Der Mensch bestaetigt oder korrigiert die Felder; das wird je Mail im Verlauf von
// MailTrainingReview vermerkt (action 'contact') und in der Trefferquote gezaehlt.
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { extractEntities, getPlaintext, type ExtractedEntity } from '@/lib/mail/extraction';
import { stripQuotedContent } from '@/lib/mail/stripQuotedContent';
import { sourceHash } from '@/lib/mail-training/review';
import type { ReviewEvent } from '@/lib/mail-training/contracts';
import { CONTACT_FIELDS, type MailContact } from './contact-fields';

export { CONTACT_FIELDS, CONTACT_LABELS, type ContactField, type MailContact } from './contact-fields';

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();
const keyOf = (type: string, text: string) => (type === 'phone' ? text.replace(/\D/g, '') : squash(text).toLowerCase());

/** Genau ein Wert dieses Typs? Verschachtelte Funde ("Beispielweg 7" in "Beispielweg 7, 54321 Ort") zaehlen einmal, der kuerzere gilt. */
function single(entities: ExtractedEntity[], type: string): string | undefined {
  const byKey = new Map<string, string>();
  entities.filter(e => e.type === type).forEach(e => { const k = keyOf(type, e.text); if (k && !byKey.has(k)) byKey.set(k, squash(e.text)); });
  const keys = Array.from(byKey.keys());
  const minimal = keys.filter(k => !keys.some(o => o !== k && k.indexOf(o) >= 0));
  return minimal.length === 1 ? byKey.get(minimal[0]) : undefined;
}

export function contactFromEntities(entities: ExtractedEntity[]): MailContact {
  const dismissed = new Set(entities.filter(e => e.dismissed).map(e => keyOf(e.type, e.text)));
  const active = entities.filter(e => e.pii && !e.dismissed && !dismissed.has(keyOf(e.type, e.text)));
  const out: MailContact = {};
  const phone = single(active, 'phone');
  if (phone) out.phone = phone;
  const street = single(active, 'address');
  if (street) out.addressLine1 = street;
  const place = single(active, 'postalCode');
  const m = place ? /^(\d{4,5})\s+(.+)$/.exec(place) : null;
  if (m) { out.postalCode = m[1]; out.city = m[2]; }
  else if (place && /^\d{4,5}$/.test(place)) out.postalCode = place;
  return out;
}

export async function contactFromMail(mailId: string): Promise<MailContact> {
  const mail = await prisma.mail.findUnique({ where: { id: mailId }, select: { text: true, html: true, extraction: { select: { entities: true } } } });
  if (!mail) return {};
  const fresh = stripQuotedContent(getPlaintext(mail.text, mail.html)).freshContent;
  const raw = mail.extraction?.entities;
  // Gespeicherte Regel-Funde koennen von aelterem Code stammen (z. B. Holz als Ort); die Regeln laufen hier neu.
  const stored = (Array.isArray(raw) ? raw as unknown as ExtractedEntity[] : []).filter(e => e && typeof e.text === 'string' && (e.source !== 'regex' || e.dismissed));
  const rules = await extractEntities(fresh, null, { skipDb: true });
  return contactFromEntities([...stored, ...rules]);
}

const clean = (v: unknown) => (typeof v === 'string' ? squash(v).slice(0, 200) : '');

/**
 * Bestaetigte Kontaktdaten beim Kunden eintragen, nur in leere Felder (vorhandene
 * Angaben bleiben, das Anlegen aus der Mail soll nichts ueberschreiben). Jede
 * Entscheidung (unveraendert, korrigiert, ergaenzt, entfernt) kommt in den Verlauf.
 */
export async function confirmContact(mailId: string, customerId: string, confirmed: MailContact, userId: string) {
  const suggested = await contactFromMail(mailId);
  return prisma.$transaction(async tx => {
    const customer = await tx.customer.findUnique({ where: { id: customerId }, select: { phone: true, addressLine1: true, postalCode: true, city: true } });
    if (!customer) throw new Error('Kunde nicht gefunden.');
    const filled: MailContact = {};
    const kept: MailContact = {};
    const events: ReviewEvent[] = [];
    const at = new Date().toISOString();
    CONTACT_FIELDS.forEach(field => {
      const before = suggested[field] || '';
      const after = clean(confirmed[field]);
      if (before || after) {
        const reason = before === after ? 'correct' : !before ? 'added' : !after ? 'removed' : 'value';
        events.push({ at, userId, action: 'contact', field, oldValue: before, newValue: after, reason });
      }
      if (!after) return;
      if (customer[field]) { if (customer[field] !== after) kept[field] = customer[field] as string; }
      else filled[field] = after;
    });
    if (Object.keys(filled).length) await tx.customer.update({ where: { id: customerId }, data: filled });
    if (events.length) {
      const mail = await tx.mail.findUnique({ where: { id: mailId }, select: { text: true, html: true, orderId: true, trainingReview: { select: { history: true } } } });
      if (mail) {
        const history = [...((mail.trainingReview?.history || []) as unknown as ReviewEvent[]), ...events];
        const json = JSON.parse(JSON.stringify(history)) as Prisma.InputJsonValue;
        if (mail.trainingReview) await tx.mailTrainingReview.update({ where: { mailId }, data: { history: json } });
        else await tx.mailTrainingReview.create({ data: { mailId, sourceHash: sourceHash(getPlaintext(mail.text, mail.html)),
          orderId: mail.orderId, annotations: [], history: json, revision: 1 } });
      }
    }
    return { filled, kept };
  });
}
