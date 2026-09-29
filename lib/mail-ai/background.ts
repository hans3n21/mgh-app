// Hintergrundpruefung neuer Mails mit dem lokalen Analysedienst. Laeuft nach
// jedem Sync mit neuen Mails, eine Mail nach der anderen, und blockiert den Sync
// nicht (kein IMAP-Lock, eigener Ablauf). Der Stand haengt an globalThis, weil
// Next diese Datei in mehrere Bundles packt (vgl. Mutex in lib/mail/sync.ts).
import { prisma } from '@/lib/prisma';
import { getPlaintext, mergeModelEntities, type ExtractedEntity } from '@/lib/mail/extraction';
import { isSentFolderName } from '@/lib/mail/folders';
import { stripQuotedContent } from '@/lib/mail/stripQuotedContent';
import { readModelConfig } from '@/lib/ai-training/ollama';
import { detectPiiStrict, readMailAiConfig } from './client';
import { suggestForMail } from './order-suggestions';

const LOOKBACK_MS = 24 * 60 * 60 * 1000;
// Im Hintergrund reicht der Anfang langer Mails; vor einem externen KI-Versand
// prueft anonymizeText ohnehin den ganzen Text, der tatsaechlich rausgeht.
const BACKGROUND_TEXT_LIMIT = 20_000;
const MAX_PRIORITY_PER_CALL = 10;

type QueueState = { running: boolean; pending: boolean; done: Set<string>; suggested: Set<string>; priority: string[]; current: string | null };
const state = (globalThis as unknown as { __mailAiQueue?: QueueState }).__mailAiQueue ??=
  { running: false, pending: false, done: new Set<string>(), suggested: new Set<string>(), priority: [], current: null };
// Bundles, die vor der Vorrangliste geladen wurden, kennen die neuen Felder noch nicht.
state.priority ??= [];
state.current ??= null;
const message = (error: unknown) => (error instanceof Error ? error.message : 'unbekannt');

/**
 * Pruefung anstossen. Ohne Angabe: die Mails der letzten 24 Stunden (nach einem
 * Sync). Mit mailIds: genau diese Mails zuerst und erneut, z. B. nach dem
 * Zuordnen zu einem Auftrag, auch wenn sie aelter als 24 Stunden sind.
 */
export function scheduleMailAnalysis(mailIds: string[] = []) {
  for (const id of mailIds.slice(0, MAX_PRIORITY_PER_CALL)) {
    state.done.delete(id);
    state.suggested.delete(id);
    if (!state.priority.includes(id)) state.priority.push(id);
  }
  if (state.running) { state.pending = true; return; }
  void run().catch(error => console.warn(`[mail-ai] Hintergrundprüfung abgebrochen: ${message(error)}`));
}

/** Wird eine dieser Mails gerade geprueft oder wartet darauf (fuer "KI liest noch" in der Oberflaeche)? */
export function isAnalyzing(mailIds: string[]) {
  return mailIds.some(id => id === state.current || state.priority.includes(id));
}

// Automatische Absender (Newsletter, Benachrichtigungen): keine Kundenmails,
// im Hintergrund nicht pruefen. "info@" bleibt drin, das nutzen auch Kunden.
const BULK_SENDER = /(^|[._+-])(no-?reply|do-?not-?reply|newsletters?|news|mailer(-daemon)?|notifications?|notify|marketing|bounces?)([._+-]|@)/i;
export const isBulkSender = (email: string | null | undefined) => !!email && BULK_SENDER.test(email);

type Candidate = { id: string; folder: string; orderId: string | null; customerId: string | null; fromEmail: string | null };

/** Reihenfolge: angestossene Mails, dann Auftragsmails, dann Kundenmails, dann der Rest. */
export function prioritize(mails: Candidate[], priority: string[]): Candidate[] {
  const rank = (m: Candidate) => {
    const p = priority.indexOf(m.id);
    if (p >= 0) return p;
    return priority.length + (m.orderId ? 0 : m.customerId ? 1 : 2);
  };
  return mails
    .filter(m => !isSentFolderName(m.folder) && (priority.includes(m.id) || m.orderId || m.customerId || !isBulkSender(m.fromEmail)))
    .map((m, index) => ({ m, index, r: rank(m) }))
    .sort((a, b) => a.r - b.r || a.index - b.index)
    .map(x => x.m);
}

async function run() {
  state.running = true;
  try {
    do {
      state.pending = false;
      let pii = (await readMailAiConfig(true)).enabled;
      let suggest = (await readModelConfig()).enabled;
      if (!pii && !suggest) { state.priority = []; return; }
      const priority = state.priority.slice();
      const candidates = await prisma.mail.findMany({
        where: { isDeleted: false, OR: [{ id: { in: priority } }, { createdAt: { gte: new Date(Date.now() - LOOKBACK_MS) } }] },
        select: { id: true, folder: true, orderId: true, customerId: true, fromEmail: true }, orderBy: { createdAt: 'asc' }, take: 300,
      });
      let interrupted = false;
      for (const mail of prioritize(candidates, priority)) {
        // Neu angestossene Mails (Zuordnung zum Auftrag) nicht hinter der
        // 24-Stunden-Pruefung warten lassen: neu einlesen, Erledigtes wird uebersprungen.
        if (state.priority.some(id => !priority.includes(id))) { interrupted = true; break; }
        state.current = mail.id;
        if (pii && !state.done.has(mail.id)) {
          try {
            await analyzeMail(mail.id);
            state.done.add(mail.id);
          } catch (error) {
            // Dienst weg: fuer diesen Lauf aufhoeren, beim naechsten Sync erneut versuchen.
            console.warn(`[mail-ai] Personenerkennung pausiert: ${message(error)}`);
            pii = false;
          }
        }
        if (suggest && !state.suggested.has(mail.id)) {
          try {
            const result = await suggestForMail(mail.id);
            // Nur Kennung und Zahlen, kein Mailinhalt.
            if (result) console.info(`[mail-ai] ${mail.id}: ${result.count} Auftragsvorschläge in ${(result.durationMs / 1000).toFixed(1)} s`);
            state.suggested.add(mail.id);
          } catch (error) {
            // Belegt (Admin-Vergleich) oder nicht erreichbar: spaeter erneut.
            console.warn(`[mail-ai] Auftragsvorschläge pausiert: ${message(error)}`);
            suggest = false;
          }
        }
        state.priority = state.priority.filter(id => id !== mail.id);
        if (!pii && !suggest) break;
      }
      // Angestossene Mails, die es nicht (mehr) gibt oder die nicht passen, nicht ewig als "wird geprueft" melden.
      if (!interrupted) state.priority = state.priority.filter(id => !priority.includes(id));
      if (state.done.size > 5000) state.done.clear();
      if (state.suggested.size > 5000) state.suggested.clear();
    } while (state.pending || state.priority.length);
  } finally {
    state.current = null;
    state.running = false;
  }
}

/**
 * Modellerkennung fuer eine Mail, auf demselben Text wie die Sync-Erkennung
 * (neuer Teil ohne Zitat), damit die Positionen zusammenpassen.
 */
export async function analyzeMail(mailId: string) {
  const mail = await prisma.mail.findUnique({ where: { id: mailId }, select: { text: true, html: true, extraction: { select: { entities: true } } } });
  if (!mail) return;
  const text = getPlaintext(stripQuotedContent(mail.text ?? '').freshContent, mail.html).slice(0, BACKGROUND_TEXT_LIMIT);
  if (text.length < 5) return;
  const ml = await detectPiiStrict(text, 120_000);
  const existing = (mail.extraction?.entities ?? []) as unknown as ExtractedEntity[];
  const entities = mergeModelEntities(Array.isArray(existing) ? existing : [], ml);
  const json = entities as unknown as import('@prisma/client').Prisma.InputJsonValue;
  await prisma.mailExtraction.upsert({ where: { mailId }, create: { mailId, entities: json }, update: { entities: json } });
}
