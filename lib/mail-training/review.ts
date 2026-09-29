import { createHash } from 'node:crypto';
import { FIELD_LABELS, SPEC_PRESETS, OrderType } from '@/lib/order-presets';
import { stripQuotedContent } from '@/lib/mail/stripQuotedContent';
import type { ExtractedEntity, EntityType } from '@/lib/mail/extraction';
import { AnnotationSchema, PRIVACY_FIELDS, type Annotation } from './contracts';

export const sourceHash = (text: string) => createHash('sha256').update(text).digest('hex');
export function orderFields(type?: string) {
  const preset = type && Object.prototype.hasOwnProperty.call(SPEC_PRESETS, type) ? SPEC_PRESETS[type as OrderType] : null;
  return preset ? Array.from(new Set(Object.values(preset.fields).flat())).map(key => ({ key, label: FIELD_LABELS[key] || key })) : [];
}
export function readAnnotations(json: unknown): Annotation[] {
  const parsed = AnnotationSchema.array().safeParse(json);
  return parsed.success ? parsed.data : [];
}
export function validateAnnotation(a: Annotation, text: string, fields: { key: string }[]) {
  if (a.end <= a.start || text.slice(a.start, a.end) !== a.text) throw new Error('Die Markierung passt nicht mehr zur Mail. Bitte neu laden.');
  if (a.kind === 'privacy' && !Object.prototype.hasOwnProperty.call(PRIVACY_FIELDS, a.field)) throw new Error('Unbekannte Datenschutzkategorie.');
  if (a.kind === 'order' && !fields.some(f => f.key === a.field)) throw new Error('Dieses Feld gehört nicht zum Auftragstyp.');
  if (a.kind === 'order' && !a.dismissed && !a.value.trim()) throw new Error('Bitte einen Wert angeben.');
}

// Nur Datenschutzstellen. Auftragsangaben kommen als Vorschlaege des lokalen
// Sprachmodells (lib/mail-ai/order-suggestions.ts); die frueheren Regel-Kandidaten
// (jedes Holz zugleich fuer Hals, Griffbrett und Korpus) waren reines Rauschen.
export function initialAnnotations(text: string, entities: ExtractedEntity[]): Annotation[] {
  const result: Annotation[] = [];
  for (const e of entities) {
    if (!e.pii || !Object.prototype.hasOwnProperty.call(PRIVACY_FIELDS, e.type)) continue;
    // Old extraction offsets may predate normalization. Never highlight unrelated text.
    const start = text.slice(e.start, e.end) === e.text ? e.start : text.indexOf(e.text);
    if (start < 0 || e.text.length > 1000) continue;
    result.push({ id: `privacy-${start}-${e.type}`, start, end: start + e.text.length, text: e.text,
      kind: 'privacy', field: e.type, value: e.text, intent: 'unclear', masked: true, dismissed: false,
      origin: e.source === 'manual' ? 'manual' : 'rules', reviewed: false });
  }
  return result;
}

export function mergeReviewed(initial: Annotation[], saved: Annotation[]) {
  const ids = new Set(saved.map(a => a.id));
  return [...initial.filter(a => !ids.has(a.id) && !saved.some(s => s.reviewed && s.kind === a.kind &&
    (s.kind === 'privacy' || s.field === a.field) && s.start < a.end && s.end > a.start)), ...saved];
}

// Conservative reuse: entire fresh message must match. A matching sentence alone
// can be contradicted later in the message. Examples always remain unreviewed proposals.
export function reuseExamples(text: string, examples: { text: string; annotations: Annotation[] }[], fields: { key: string }[]): Annotation[] {
  const fresh = stripQuotedContent(text).freshContent.trim();
  const freshOffset = text.indexOf(fresh);
  if (!fresh || freshOffset < 0) return [];
  const result: Annotation[] = [];
  for (const example of examples) {
    const oldFresh = stripQuotedContent(example.text).freshContent.trim();
    if (oldFresh !== fresh) continue;
    const oldOffset = example.text.indexOf(oldFresh);
    for (const old of example.annotations) {
      if (!old.reviewed || old.contextHash || old.evidence?.length || old.start < oldOffset || old.end > oldOffset + oldFresh.length) continue;
      if (old.kind === 'order' && !old.text.toLowerCase().includes(old.value.toLowerCase())) continue;
      // Never learn automatic unmasking or reuse privacy false positives as permissions.
      if (old.kind === 'privacy' && (!old.masked || old.dismissed)) continue;
      const start = freshOffset + old.start - oldOffset;
      const priorField = old.id.match(/^(?:order|privacy)-\d+-(.+)$/)?.[1];
      const id = priorField ? `${old.kind}-${start}-${priorField}` : `example-${start}-${old.kind}-${old.field}`;
      const a: Annotation = { ...old, id, start,
        end: start + old.text.length, origin: 'example', reviewed: false, reason: undefined };
      try { validateAnnotation(a, text, fields); } catch { continue; }
      if (!result.some(r => r.start === a.start && r.kind === a.kind && r.field === a.field)) result.push(a);
    }
    // Most recent matching review wins; don't merge conflicting older judgments.
    break;
  }
  return result;
}

export function applyPrivacyReview(entities: ExtractedEntity[], a: Annotation): ExtractedEntity[] {
  const result = entities.flatMap(e => {
    if (!(e.pii && e.start < a.end && e.end > a.start)) return [e];
    // Keep protected text outside the selected range when correcting a partial match.
    const parts: ExtractedEntity[] = [];
    if (e.start < a.start) parts.push({ ...e, end: a.start, text: e.text.slice(0, a.start - e.start) });
    if (e.end > a.end) parts.push({ ...e, start: a.end, text: e.text.slice(a.end - e.start) });
    return parts;
  });
  if (a.masked && !a.dismissed) result.push({ type: a.field as EntityType, text: a.text, start: a.start, end: a.end,
    source: 'manual', confidence: 1, pii: true });
  return result.sort((a, b) => a.start - b.start);
}

export function canApply(a: Annotation) {
  return a.kind === 'order' && a.reviewed && !a.dismissed && (a.intent === 'confirmed' || a.intent === 'change');
}
