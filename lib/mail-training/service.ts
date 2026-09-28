import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { extractEntities, getPlaintext, type ExtractedEntity } from '@/lib/mail/extraction';
import { readLocalAiConfig } from '@/lib/local-ai/settings';
import { analyzeLocally } from '@/lib/local-ai/client';
import { type TrainingData, type ReviewEvent, type Annotation, MutationSchema } from './contracts';
import { applyPrivacyReview, canApply, initialAnnotations, mergeReviewed, orderFields, readAnnotations, reuseExamples, sourceHash, validateAnnotation } from './review';
import type { z } from 'zod';
import { stripQuotedContent } from '@/lib/mail/stripQuotedContent';
import { readModelConfig } from '@/lib/ai-training/ollama';
import { contextHash, loadContext, TrainingError } from '@/lib/ai-training/context';
import { analyzeConversation } from '@/lib/ai-training/service';

export class ReviewError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}
const mailSelect = { id: true, text: true, html: true, orderId: true, accountId: true, isDeleted: true,
  extraction: true, trainingReview: true,
  order: { select: { type: true, deletedAt: true, specs: { select: { key: true, value: true } } } } } as const;
type Client = Prisma.TransactionClient;
const asJson = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

/**
 * Auftragsfeld nur setzen, wenn es noch den Wert hat, den der Mensch beim
 * Entscheiden gesehen hat. Liefert den Altwert fuer den Verlauf.
 */
export async function writeOrderSpec(tx: Client, orderId: string, specs: { key: string; value: string | null }[],
  field: string, expectedValue: string, newValue: string) {
  const current = specs.filter(s => s.key === field);
  if (current.length > 1) throw new ReviewError('Das Auftragsfeld ist mehrfach vorhanden. Bitte zuerst im Auftrag bereinigen.');
  const value = current[0]?.value || '';
  if (value !== expectedValue) throw new ReviewError('Das Auftragsfeld wurde inzwischen geändert. Bitte neu laden und vergleichen.');
  if (current.length) {
    const changed = await tx.orderSpecKV.updateMany({ where: { orderId, key: field, value }, data: { value: newValue } });
    if (changed.count !== 1) throw new ReviewError('Das Auftragsfeld hat sich geändert. Bitte neu laden.');
  }
  else await tx.orderSpecKV.create({ data: { orderId, key: field, value: newValue } });
  await tx.order.update({ where: { id: orderId }, data: { lastActivityAt: new Date() } });
  return value;
}

async function load(client: Client, id: string) {
  const mail = await client.mail.findUnique({ where: { id }, select: mailSelect });
  if (!mail || mail.isDeleted) throw new ReviewError('Mail nicht gefunden.', 404);
  const text = getPlaintext(mail.text, mail.html);
  if ((mail.text || mail.html || '').length > 200_000) throw new ReviewError('Diese Mail ist für den Trainingsmodus zu lang.', 422);
  return { mail, text, hash: sourceHash(text) };
}

export async function getTrainingData(id: string): Promise<TrainingData> {
  const { mail, text, hash } = await load(prisma, id);
  const fields = orderFields(mail.order?.deletedAt ? undefined : mail.order?.type);
  const entities = mail.extraction ? mail.extraction.entities as unknown as ExtractedEntity[] : await extractEntities(text);
  const review = mail.trainingReview;
  const validReview = review?.sourceHash === hash && review.orderId === mail.orderId;
  const saved = validReview ? readAnnotations(review.annotations) : [];
  const examples = await prisma.mailTrainingReview.findMany({ where: {
    mailId: { not: id }, mail: { accountId: mail.accountId, isDeleted: false },
  }, orderBy: { updatedAt: 'desc' }, take: 200,
    select: { sourceHash: true, annotations: true, orderId: true, mail: { select: { text: true, html: true, orderId: true, order: { select: { type: true } } } } },
  });
  const eligible = examples.filter(e => e.mail.orderId === e.orderId && e.mail.order?.type === mail.order?.type)
    .map(e => ({ text: getPlaintext(e.mail.text, e.mail.html), hash: e.sourceHash, annotations: readAnnotations(e.annotations) }))
    .filter(e => sourceHash(e.text) === e.hash);
  const reused = reuseExamples(text, eligible, fields);
  let initial = initialAnnotations(text, entities, mail.order?.deletedAt ? undefined : mail.order?.type);
  // A reviewed example replaces the same candidate, never unrelated privacy marks.
  initial = initial.filter(a => !reused.some(r => r.id === a.id || (r.kind === a.kind && r.field === a.field && r.start === a.start)));
  let annotations = mergeReviewed([...initial, ...reused], saved);
  const modelConfig = await readModelConfig();
  let context: TrainingData['context'];
  let contextNotice: string | undefined;
  if ((modelConfig.enabled || saved.some(a => a.contextHash)) && mail.order && !mail.order.deletedAt) {
    try {
      context = (await loadContext(id)).snapshot;
      const currentHash = contextHash(context);
      if (annotations.some(a => a.contextHash && a.contextHash !== currentHash && !a.dismissed)) {
        annotations = annotations.map(a => a.contextHash && a.contextHash !== currentHash && !a.dismissed ? { ...a, reviewed: false } : a);
        contextNotice = 'Gesprächsverlauf hat sich geändert. Frühere Modellmarkierungen bitte neu auswerten oder verwerfen.';
      }
    }
    catch (e) { contextNotice = e instanceof TrainingError ? e.message : 'Gesprächsverlauf konnte nicht geladen werden.'; }
  }
  return { mailId: id, sourceHash: hash, revision: review?.revision || 0, orderId: mail.orderId,
    plaintext: text, annotations, fields,
    currentValues: Object.fromEntries((mail.order?.specs || []).map(s => [s.key, s.value])),
    history: (review?.history || []) as unknown as ReviewEvent[],
    exampleCount: eligible.reduce((n, e) => n + e.annotations.filter(a => a.reviewed).length, 0),
    modelEnabled: modelConfig.enabled || (await readLocalAiConfig()).enabled, context,
    notice: review && !validReview ? 'Mail oder Zuordnung geändert. Frühere Markierungen werden nicht angewendet; der Verlauf bleibt erhalten.' : contextNotice,
  };
}

export async function mutateTraining(id: string, body: z.infer<typeof MutationSchema>, userId: string) {
  if (body.action === 'model') {
    const { mail, hash, text } = await load(prisma, id);
    if (hash !== body.sourceHash || mail.orderId !== body.orderId || (mail.trainingReview?.revision || 0) !== body.revision)
      throw new ReviewError('Der Stand hat sich geändert. Bitte neu laden.');
    if (!mail.order || mail.order.deletedAt) throw new ReviewError('Bitte einen aktiven Auftrag zuordnen.');
    if ((await readModelConfig()).enabled) return analyzeConversation(id);
    const result = await analyzeLocally(await readLocalAiConfig(), text, mail.order.type);
    const baseline = initialAnnotations(text, [], mail.order.type);
    const annotations = result.findings.flatMap(f => {
      const a = baseline.find(a => a.field === f.field && a.value === f.value);
      return a ? [{ ...a, origin: 'model' as const, modelRevision: result.revision,
        intent: f.decision === 'tentative' ? 'question' as const : f.decision }] : [];
    });
    return { annotations };
  }
  await prisma.$transaction(async tx => {
    const { mail, text, hash } = await load(tx, id);
    const old = mail.trainingReview;
    if (hash !== body.sourceHash || mail.orderId !== body.orderId || (old?.revision || 0) !== body.revision)
      throw new ReviewError('Ein anderer Bearbeiter, die Mail oder die Zuordnung hat den Stand geändert. Bitte neu laden.');
    const valid = old?.sourceHash === hash && old.orderId === mail.orderId;
    let annotations = valid ? readAnnotations(old.annotations) : [];
    const history = (old?.history || []) as unknown as ReviewEvent[];
    const event: ReviewEvent = { at: new Date().toISOString(), userId, action: body.action };
    if (body.action === 'review') {
      const a: Annotation = { ...body.annotation, reviewed: true, reason: body.reason };
      validateAnnotation(a, text, orderFields(mail.order?.deletedAt ? undefined : mail.order?.type));
      if (a.contextHash && !a.dismissed) {
        const context = await loadContext(id, tx);
        if (contextHash(context.snapshot) !== a.contextHash) throw new TrainingError('Gesprächsverlauf hat sich geändert. Modellprüfung bitte wiederholen.', 409);
        if (a.evidence?.some(e => !context.snapshot.messages.some(m => m.id === e.mailId && m.text.includes(e.quote))))
          throw new TrainingError('Gesprächsbeleg passt nicht zur Mail.', 409);
      }
      const before = annotations.find(p => p.id === a.id);
      // Category changes require a new annotation so old masking cannot disappear silently.
      if (before && before.kind !== a.kind) throw new ReviewError('Für eine andere Kategorie bitte eine neue Markierung anlegen.', 400);
      if (body.previous) validateAnnotation(body.previous, text, orderFields(mail.order?.type));
      Object.assign(event, { annotationId: a.id, reason: body.reason, before: before || body.previous, after: a });
      annotations = [...annotations.filter(p => p.id !== a.id), a];
      if (annotations.length > 500) throw new ReviewError('Maximal 500 Markierungen pro Mail.', 422);
      if (a.kind === 'privacy') {
        // Extraction is written atomically with the feedback used by the existing anonymizer.
        const entities = mail.extraction ? mail.extraction.entities as unknown as ExtractedEntity[] : await extractEntities(text);
        const updated = applyPrivacyReview(entities, a);
        await tx.mailExtraction.upsert({ where: { mailId: id }, create: { mailId: id, entities: asJson(updated) }, update: { entities: asJson(updated) } });
      }
    } else {
      if (!valid) throw new ReviewError('Bitte die Markierung erneut prüfen.');
      const a = annotations.find(a => a.id === body.annotationId);
      if (!a || !canApply(a)) throw new ReviewError('Nur bestätigte Wünsche oder Kundenänderungen können übernommen werden.', 400);
      if (!mail.order || mail.order.deletedAt || !mail.orderId) throw new ReviewError('Kein aktiver Auftrag zugeordnet.');
      validateAnnotation(a, text, orderFields(mail.order.type));
      if (a.contextHash && contextHash((await loadContext(id, tx)).snapshot) !== a.contextHash)
        throw new TrainingError('Gesprächsverlauf wurde geändert. Entscheidung bitte erneut prüfen.', 409);
      const fresh = stripQuotedContent(text).freshContent.trim();
      const offset = text.indexOf(fresh);
      if (!fresh || offset < 0 || a.start < offset || a.end > offset + fresh.length)
        throw new ReviewError('Diese Stelle gehört zum zitierten Verlauf. Bitte die aktuelle Kundenaussage markieren.');
      if (history.some(e => e.action === 'apply' && e.annotationId === a.id && e.newValue === a.value && e.orderId === mail.orderId))
        throw new ReviewError('Diese Entscheidung wurde bereits übernommen. Eine erneute Änderung bitte neu prüfen.');
      const value = await writeOrderSpec(tx, mail.orderId, mail.order.specs, a.field, body.expectedValue, a.value);
      Object.assign(event, { annotationId: a.id, orderId: mail.orderId, field: a.field, oldValue: value, newValue: a.value });
    }
    const data = { sourceHash: hash, orderId: mail.orderId, annotations: asJson(annotations), history: asJson([...history, event]) };
    if (old) {
      const changed = await tx.mailTrainingReview.updateMany({ where: { mailId: id, revision: body.revision }, data: { ...data, revision: { increment: 1 } } });
      if (changed.count !== 1) throw new ReviewError('Gleichzeitige Änderung. Bitte neu laden.');
    } else await tx.mailTrainingReview.create({ data: { ...data, mailId: id, revision: 1 } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 });
  return getTrainingData(id);
}
