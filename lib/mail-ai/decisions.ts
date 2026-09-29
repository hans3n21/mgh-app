// Vorschlaege aus der Mail-Analyse im Auftrag anzeigen und entscheiden.
// Jede Entscheidung (uebernehmen, geaendert uebernehmen, erledigt, verwerfen)
// wird an der Markierung in MailTrainingReview vermerkt und ist damit ein
// Lernbeispiel: Stelle in der Mail + was der Mensch daraus gemacht hat.
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getPlaintext } from '@/lib/mail/extraction';
import { stripQuotedContent } from '@/lib/mail/stripQuotedContent';
import { orderFields, readAnnotations, sourceHash, validateAnnotation } from '@/lib/mail-training/review';
import { ReviewError, writeOrderSpec } from '@/lib/mail-training/service';
import type { Annotation, ReviewEvent } from '@/lib/mail-training/contracts';
import { isAnalyzing } from './background';

export type MailSuggestion = {
  mailId: string; annotationId: string; revision: number; sourceHash: string;
  field: string; value: string; intent: Annotation['intent']; currentValue: string;
  snippet: { before: string; match: string; after: string }; mailDate: string; mailSubject: string;
};

/** Satz um die Stelle herum, damit man ohne Mail oeffnen sieht, worauf sich der Vorschlag stuetzt. */
export function snippetAround(text: string, start: number, end: number) {
  const headStart = Math.max(0, start - 120);
  const head = text.slice(headStart, start);
  const cut = Math.max(head.lastIndexOf('.'), head.lastIndexOf('!'), head.lastIndexOf('?'), head.lastIndexOf('\n'));
  const from = headStart + (cut >= 0 ? cut + 1 : 0);
  const rest = text.slice(end).search(/[.!?\n]/);
  const to = Math.min(text.length, end + 120, rest < 0 ? text.length : end + rest + 1);
  return { before: text.slice(from, start).trimStart(), match: text.slice(start, end), after: text.slice(end, to).trimEnd() };
}

const pending = (a: Annotation) => a.kind === 'order' && a.origin === 'model' && !a.reviewed && !a.dismissed;

export type SuggestionList = { fields: { key: string; label: string }[]; current: Record<string, string>; items: MailSuggestion[]; analyzing: boolean };

export async function listSuggestions(orderId: string): Promise<SuggestionList> {
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { type: true, deletedAt: true, specs: { select: { key: true, value: true } },
    mails: { where: { isDeleted: false }, select: { id: true } } } });
  if (!order || order.deletedAt) return { fields: [], current: {}, items: [], analyzing: false };
  // Liest die KI gerade Mails dieses Auftrags? Dann zeigt die Oberflaeche das an und fragt nach.
  const analyzing = isAnalyzing(order.mails.map(m => m.id));
  const fields = orderFields(order.type);
  const current = new Map(order.specs.map(s => [s.key, s.value || '']));
  const reviews = await prisma.mailTrainingReview.findMany({
    where: { orderId, mail: { isDeleted: false, orderId } },
    select: { mailId: true, revision: true, sourceHash: true, annotations: true,
      mail: { select: { text: true, html: true, date: true, subject: true } } },
  });
  const items: MailSuggestion[] = [];
  for (const review of reviews) {
    const open = readAnnotations(review.annotations).filter(pending);
    if (!open.length) continue;
    // Nur den Mailtext laden, wenn es ueberhaupt offene Vorschlaege gibt; Stand pruefen.
    const text = getPlaintext(review.mail.text, review.mail.html);
    if (sourceHash(text) !== review.sourceHash) continue;
    for (const a of open) {
      if (!fields.some(f => f.key === a.field)) continue;
      items.push({ mailId: review.mailId, annotationId: a.id, revision: review.revision, sourceHash: review.sourceHash,
        field: a.field, value: a.value, intent: a.intent, currentValue: current.get(a.field) || '',
        snippet: snippetAround(text, a.start, a.end), mailDate: review.mail.date.toISOString(), mailSubject: review.mail.subject || '' });
    }
  }
  items.sort((a, b) => a.mailDate.localeCompare(b.mailDate));
  // Aktuelle Werte aller Felder: beim Aendern des Feldes braucht die Oberflaeche den Altwert des Zielfelds.
  return { fields, current: Object.fromEntries(current), items, analyzing };
}

export const DecisionSchema = z.object({
  mailId: z.string().min(1).max(100), annotationId: z.string().min(1).max(100),
  revision: z.number().int().nonnegative(), sourceHash: z.string().length(64),
  action: z.enum(['accept', 'acknowledge', 'reject']),
  // Beim Aendern: korrigierte Werte. Ohne Angabe gilt der Vorschlag.
  field: z.string().min(1).max(100).optional(), value: z.string().trim().min(1).max(1000).optional(),
  intent: z.enum(['confirmed', 'question', 'change', 'rejected', 'unclear']).optional(),
  expectedValue: z.string().max(10000).default(''),
}).strict();
export type Decision = z.infer<typeof DecisionSchema>;

export const BatchSchema = z.object({
  action: z.literal('accept-all'),
  items: z.array(z.object({
    mailId: z.string().min(1).max(100), annotationId: z.string().min(1).max(100),
    revision: z.number().int().nonnegative(), sourceHash: z.string().length(64), expectedValue: z.string().max(10000).default(''),
  }).strict()).min(1).max(50),
}).strict();

/**
 * Mehrere Wuensche auf einmal uebernehmen. Pro Mail zaehlt die Version nach jeder
 * Entscheidung dieses Stapels mit; aendert jemand anderes zwischendurch etwas,
 * scheitert nur der betroffene Vorschlag und bleibt offen.
 */
export async function decideMany(orderId: string, items: z.infer<typeof BatchSchema>['items'], userId: string) {
  const revisions = new Map<string, number>();
  const results: ({ annotationId: string; ok: true } & DecisionResult | { annotationId: string; ok: false; error: string })[] = [];
  for (const item of items) {
    const revision = revisions.get(item.mailId) ?? item.revision;
    try {
      const result = await decideSuggestion(orderId, { ...item, revision, action: 'accept' }, userId);
      revisions.set(item.mailId, revision + 1);
      results.push({ annotationId: item.annotationId, ok: true, ...result });
    } catch (error) {
      results.push({ annotationId: item.annotationId, ok: false, error: error instanceof Error ? error.message : 'Fehler' });
    }
  }
  return { results, applied: results.filter(r => r.ok && r.applied).length, failed: results.filter(r => !r.ok).length };
}

/** Ergebnis der Entscheidung fuer die Oberflaeche. */
export type DecisionResult = { applied: boolean; field: string; oldValue?: string; newValue?: string };

export async function decideSuggestion(orderId: string, input: Decision, userId: string): Promise<DecisionResult> {
  return prisma.$transaction(async tx => {
    const mail = await tx.mail.findUnique({ where: { id: input.mailId }, select: { text: true, html: true, orderId: true, isDeleted: true,
      trainingReview: true, order: { select: { type: true, deletedAt: true, specs: { select: { key: true, value: true } } } } } });
    if (!mail || mail.isDeleted || mail.orderId !== orderId || !mail.order || mail.order.deletedAt)
      throw new ReviewError('Die Mail gehört nicht (mehr) zu diesem Auftrag. Bitte neu laden.', 409);
    const review = mail.trainingReview;
    const text = getPlaintext(mail.text, mail.html);
    const hash = sourceHash(text);
    if (!review || review.revision !== input.revision || review.sourceHash !== input.sourceHash || hash !== review.sourceHash || review.orderId !== orderId)
      throw new ReviewError('Der Vorschlag hat sich inzwischen geändert. Bitte neu laden.', 409);
    const annotations = readAnnotations(review.annotations);
    const before = annotations.find(a => a.id === input.annotationId);
    if (!before || !pending(before)) throw new ReviewError('Dieser Vorschlag wurde bereits entschieden.', 409);

    const fields = orderFields(mail.order.type);
    const edited = { field: input.field ?? before.field, value: input.value ?? before.value, intent: input.intent ?? before.intent };
    const reason: Annotation['reason'] = input.action === 'reject' ? 'wrong'
      : edited.field !== before.field ? 'field' : edited.value !== before.value ? 'value' : edited.intent !== before.intent ? 'intent' : 'correct';
    const after: Annotation = { ...before, ...edited, reviewed: true, reason, dismissed: input.action === 'reject' };
    validateAnnotation(after, text, fields);

    const event: ReviewEvent = { at: new Date().toISOString(), userId, action: 'review', annotationId: after.id, reason, before, after };
    const result: DecisionResult = { applied: false, field: after.field };
    // Uebernommen wird nur ein verbindlicher Wunsch oder eine Aenderung aus dem neuen Mailteil.
    if (input.action === 'accept' && (after.intent === 'confirmed' || after.intent === 'change')) {
      const fresh = stripQuotedContent(text).freshContent.trim();
      const offset = text.indexOf(fresh);
      if (!fresh || offset < 0 || after.start < offset || after.end > offset + fresh.length)
        throw new ReviewError('Diese Stelle gehört zum zitierten Verlauf und wird nicht übernommen.', 400);
      const oldValue = await writeOrderSpec(tx, orderId, mail.order.specs, after.field, input.expectedValue, after.value);
      Object.assign(event, { action: 'apply', orderId, field: after.field, oldValue, newValue: after.value });
      Object.assign(result, { applied: true, oldValue, newValue: after.value });
    }

    const next = annotations.map(a => (a.id === after.id ? after : a));
    const history = [...((review.history || []) as unknown as ReviewEvent[]), event];
    const changed = await tx.mailTrainingReview.updateMany({ where: { mailId: input.mailId, revision: input.revision },
      data: { annotations: JSON.parse(JSON.stringify(next)) as Prisma.InputJsonValue,
        history: JSON.parse(JSON.stringify(history)) as Prisma.InputJsonValue, revision: { increment: 1 } } });
    if (changed.count !== 1) throw new ReviewError('Gleichzeitige Änderung. Bitte neu laden.', 409);
    return result;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 });
}
