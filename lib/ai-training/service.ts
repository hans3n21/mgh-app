import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getPlaintext, extractEntities } from '@/lib/mail/extraction';
import { initialAnnotations, readAnnotations, sourceHash } from '@/lib/mail-training/review';
import { analyzeLocally } from '@/lib/local-ai/client';
import { readLocalAiConfig } from '@/lib/local-ai/settings';
import { OutputSchema, SnapshotSchema, type Finding, type Snapshot } from './contracts';
import { contextHash, loadContext, TrainingError } from './context';
import { evaluate, groupsOverlap, quoteOffset, validateFindings } from './evaluate';
import { buildMessages, PROTOCOL, readModelConfig, runOllama } from './ollama';

const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
export async function createCase(input: { mailId: string; title: string; partition: 'train' | 'test'; revision: number; sourceHash: string }, userId: string) {
  return prisma.$transaction(async tx => {
    const context = await loadContext(input.mailId, tx);
    const review = await tx.mailTrainingReview.findUnique({ where: { mailId: input.mailId } });
    if ((review?.revision || 0) !== input.revision || context.sourceHash !== input.sourceHash || (review && (review.sourceHash !== input.sourceHash || review.orderId !== context.orderId)))
      throw new TrainingError('Markierungen oder Zuordnung haben sich geändert. Mail neu laden und prüfen.', 409);
    if (await tx.aiTrainingCase.findFirst({ where: { mailId: input.mailId } })) throw new TrainingError('Für diese Mail gibt es bereits einen eingefrorenen Fall. Zum Ersetzen den alten Fall im Adminbereich löschen.', 409);
    const conflicting = await tx.aiTrainingCase.findFirst({ where: { groupKeys: { hasSome: context.groupKeys }, partition: { not: input.partition } } });
    if (conflicting) throw new TrainingError('Kunde, Auftrag oder Gespräch ist bereits der anderen Gruppe zugeordnet. Lern- und Testfälle dürfen sich nicht überschneiden.', 409);
    const current = context.snapshot.messages.find(m => m.id === input.mailId)!;
    const marks = readAnnotations(review?.annotations || []).filter(a => a.reviewed && !a.dismissed && (a.kind !== 'privacy' || a.masked));
    if (marks.some(a => a.contextHash && a.contextHash !== contextHash(context.snapshot))) throw new TrainingError('Gespräch hat sich seit der Modellprüfung geändert. Markierungen erneut prüfen.', 409);
    const expected: Finding[] = marks.filter(a => a.start >= context.freshOffset && a.end <= context.freshOffset + current.text.length).map(a => ({ kind: a.kind, field: a.field,
      value: a.kind === 'privacy' ? a.text : a.value, intent: a.kind === 'privacy' ? 'unclear' : a.intent, quote: a.text,
      occurrence: current.text.slice(0, a.start - context.freshOffset).split(a.text).length - 1,
      evidence: a.evidence || (a.kind === 'order' && !a.text.includes(a.value) ? context.snapshot.messages.filter(m => m.text.includes(a.value)).slice(0, 1).map(m => ({ mailId: m.id, quote: a.value })) : []),
    }));
    validateFindings(expected, context.snapshot);
    const fingerprint = sourceHash(JSON.stringify({ snapshot: context.snapshot, expected }));
    return tx.aiTrainingCase.create({ data: { mailId: input.mailId, title: input.title, partition: input.partition, accountId: context.accountId,
      groupKeys: context.groupKeys, snapshot: json(context.snapshot), expected: json(expected), fingerprint, createdBy: userId } });
  }, { isolationLevel: 'Serializable', timeout: 15000 });
}
// Snapshots remain fixed for fair comparisons; erased/deleted source messages must not be reused.
async function available(snapshot: Snapshot) {
  const count = await prisma.mail.count({ where: { id: { in: snapshot.messages.map(m => m.id) }, isDeleted: false } });
  return count === snapshot.messages.length;
}
export async function listCases() {
  const rows = await prisma.aiTrainingCase.findMany({ where: { mail: { isDeleted: false } }, orderBy: { createdAt: 'desc' }, take: 100,
    include: { results: { orderBy: { createdAt: 'desc' }, take: 12 } } });
  return Promise.all(rows.map(async row => {
    const snapshot = SnapshotSchema.parse(row.snapshot);
    if (await available(snapshot)) return { ...row, unavailable: false };
    // Keep a removable shell so a missing context mail does not trap an immutable case.
    return { ...row, unavailable: true, snapshot: { ...snapshot, messages: [] }, expected: [], results: [] };
  }));
}
export async function selectExamples(snapshot: Snapshot, accountId: string, groupKeys: string[]) {
  const rows = await prisma.aiTrainingCase.findMany({ where: { accountId, partition: 'train', mail: { isDeleted: false } }, orderBy: { createdAt: 'desc' }, take: 100 });
  const words = new Set(snapshot.messages.map(m => m.text.toLowerCase()).join(' ').match(new RegExp('[\\p{L}]{4,}', 'gu')) || []);
  const ranked = rows.filter(r => !groupsOverlap(r.groupKeys, groupKeys)).map(r => ({ ...r, snapshot: SnapshotSchema.parse(r.snapshot), expected: OutputSchema.parse({ findings: r.expected }).findings }))
    .filter(r => r.snapshot.orderType === snapshot.orderType && JSON.stringify(r.snapshot).length < 6000)
    .map(r => ({ ...r, score: (r.snapshot.messages.map(m => m.text.toLowerCase()).join(' ').match(new RegExp('[\\p{L}]{4,}', 'gu')) || []).filter(w => words.has(w)).length }))
    .sort((a, b) => b.score - a.score);
  const result = [];
  for (const row of ranked) {
    if (row.score > 0 && await available(row.snapshot)) result.push(row);
    if (result.length === 2) break;
  }
  return result;
}
export async function compareCase(caseId: string, model: string, useExamples: boolean) {
  const row = await prisma.aiTrainingCase.findUnique({ where: { id: caseId }, include: { mail: { select: { isDeleted: true } } } });
  if (!row || row.mail.isDeleted) throw new TrainingError('Prüffall nicht gefunden.', 404);
  const snapshot = SnapshotSchema.parse(row.snapshot);
  if (!await available(snapshot)) throw new TrainingError('Eine Quellmail wurde gelöscht. Prüffall bitte neu erstellen.', 409);
  const expected = OutputSchema.parse({ findings: row.expected }).findings;
  const examples = useExamples && !['rules', 'laya'].includes(model) ? await selectExamples(snapshot, row.accountId, row.groupKeys) : [];
  const started = Date.now(); let findings: Finding[] = []; let digest = ''; let error: string | null = null;
  try {
    const text = snapshot.messages.find(m => m.id === snapshot.currentId)!.text;
    if (model === 'rules') {
      // Fresh rules only; no manually corrected extraction cache or customer DB lookup.
      const marks = initialAnnotations(text, await extractEntities(text, null, { skipDb: true }), snapshot.orderType);
      findings = marks.map(a => ({ kind: a.kind, field: a.field, value: a.value, intent: a.intent, quote: a.text,
        occurrence: text.slice(0, a.start).split(a.text).length - 1, evidence: [] })); digest = 'rules-v1';
    } else if (model === 'laya') {
      const result = await analyzeLocally(await readLocalAiConfig(), text, snapshot.orderType);
      findings = result.findings.map(f => ({ kind: 'order' as const, field: f.field, value: f.value, intent: f.decision === 'tentative' ? 'question' as const : f.decision, quote: f.value, evidence: [] }));
      digest = result.revision;
    } else {
      const result = await runOllama(await readModelConfig(), model, snapshot, examples);
      findings = result.findings; digest = result.digest;
    }
  } catch (e) { error = e instanceof TrainingError ? e.message : 'Lokale Auswertung fehlgeschlagen. Dienst und Konfiguration prüfen.'; }
  return prisma.aiTrainingResult.create({ data: { caseId, model, digest, protocol: PROTOCOL, examples: json(examples.map(e => `${e.id}:${e.fingerprint}`)),
    findings: json(findings), metrics: json(evaluate(expected, findings)), durationMs: Date.now() - started, error } });
}
export async function exportTraining() {
  const candidates = await prisma.aiTrainingCase.findMany({ where: { partition: 'train', mail: { isDeleted: false } }, orderBy: { createdAt: 'asc' } });
  const rows = [];
  for (const row of candidates) if (await available(SnapshotSchema.parse(row.snapshot))) rows.push(row);
  return rows.map(r => JSON.stringify({ messages: [...buildMessages(SnapshotSchema.parse(r.snapshot)),
    { role: 'assistant', content: JSON.stringify({ findings: r.expected }) }], metadata: { caseId: r.id, fingerprint: r.fingerprint, protocol: PROTOCOL } })).join('\n');
}
export async function analyzeConversation(id: string) {
  const context = await loadContext(id);
  const config = await readModelConfig();
  if (!config.enabled) throw new TrainingError('Lokale Gesprächsanalyse ist noch nicht aktiviert.', 409);
  const examples = config.useExamples ? await selectExamples(context.snapshot, context.accountId, context.groupKeys) : [];
  const result = await runOllama(config, config.model, context.snapshot, examples);
  const mail = await prisma.mail.findUniqueOrThrow({ where: { id }, select: { text: true, html: true } });
  const text = getPlaintext(mail.text, mail.html);
  const fresh = context.snapshot.messages.find(m => m.id === id)!.text;
  const offset = text.indexOf(fresh);
  if (offset < 0 || sourceHash(text) !== context.sourceHash) throw new TrainingError('Mail hat sich während des Modelllaufs geändert.', 409);
  return { annotations: result.findings.map((f, i) => {
    const start = offset + quoteOffset(fresh, f);
    return { id: `context-${start}-${i}`, start, end: start + f.quote.length, text: f.quote, kind: f.kind, field: f.field, value: f.value,
      intent: f.intent, masked: f.kind === 'privacy', dismissed: false, origin: 'model' as const, reviewed: false,
      modelRevision: result.digest.slice(0, 100), evidence: f.evidence, contextHash: contextHash(context.snapshot) };
  }), context: context.snapshot };
}
