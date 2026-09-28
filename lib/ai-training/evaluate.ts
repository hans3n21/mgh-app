import { PRIVACY_FIELDS } from '@/lib/mail-training/contracts';
import type { Finding, Metrics, Snapshot } from './contracts';
import { TrainingError } from './context';

const normalize = (s: string) => s.trim().toLocaleLowerCase('de-DE').replace(/\s+/g, ' ');
export function quoteOffset(text: string, f: Pick<Finding, 'quote' | 'occurrence'>) {
  let index = -1;
  for (let n = 0; n <= (f.occurrence || 0); n++) { index = text.indexOf(f.quote, index + 1); if (index < 0) return -1; }
  return index;
}
export function validateFindings(findings: Finding[], snapshot: Snapshot) {
  const current = snapshot.messages.find(m => m.id === snapshot.currentId)!;
  for (const f of findings) {
    const index = quoteOffset(current.text, f);
    if (index < 0 || (f.occurrence === undefined && current.text.indexOf(f.quote, index + 1) >= 0))
      throw new TrainingError('Modellantwort enthält keinen eindeutigen Beleg in der aktuellen Mail.', 422);
    if (f.kind === 'privacy' ? !Object.prototype.hasOwnProperty.call(PRIVACY_FIELDS, f.field) : !snapshot.fields.some(x => x.key === f.field))
      throw new TrainingError('Modellantwort enthält ein unbekanntes Feld.', 422);
    for (const e of f.evidence) if (!snapshot.messages.some(m => m.id === e.mailId && m.text.includes(e.quote)))
      throw new TrainingError('Ein Gesprächsbeleg ist nicht im übergebenen Verlauf enthalten.', 422);
    if (f.kind === 'privacy' && f.value !== f.quote)
      throw new TrainingError('Datenschutzmarkierung muss dem Originaltext entsprechen.', 422);
    if (f.kind === 'order' && ![f.quote, ...f.evidence.map(e => e.quote)].some(q => normalize(q).includes(normalize(f.value))))
      throw new TrainingError('Der erkannte Wert ist nicht wörtlich durch eine Belegstelle gestützt.', 422);
  }
  const keys = findings.map(f => JSON.stringify([f.kind, f.field, f.quote, f.occurrence || 0]));
  if (new Set(keys).size !== keys.length) throw new TrainingError('Doppelte Modellvorschläge für dieselbe Stelle.', 422);
  return findings;
}
const key = (f: Finding) => JSON.stringify([f.kind, f.field, normalize(f.value), f.kind === 'privacy' ? '' : f.intent, f.kind === 'privacy' ? [f.quote, f.occurrence || 0] : '']);
export function evaluate(expected: Finding[], predicted: Finding[]): Metrics {
  const remaining = [...predicted]; let correct = 0; let privacyMissed = 0;
  for (const e of expected) {
    const index = remaining.findIndex(p => key(p) === key(e));
    if (index >= 0) { correct++; remaining.splice(index, 1); }
    else if (e.kind === 'privacy') privacyMissed++;
  }
  const unsafeConfirmations = remaining.filter(p => p.kind === 'order' && ['confirmed', 'change'].includes(p.intent)).length;
  return { expected: expected.length, predicted: predicted.length, correct, missed: expected.length - correct,
    extra: remaining.length, unsafeConfirmations, privacyMissed, exact: correct === expected.length && remaining.length === 0 };
}
export function groupsOverlap(a: string[], b: string[]) { return a.some(k => b.includes(k)); }
