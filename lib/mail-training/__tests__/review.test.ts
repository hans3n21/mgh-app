import { describe, expect, it } from 'vitest';
import { applyPrivacyReview, canApply, initialAnnotations, mergeReviewed, orderFields, reuseExamples, validateAnnotation } from '../review';
import { highlightSegments } from '../highlight';
import { type Annotation, MutationSchema } from '../contracts';

const text = 'Bitte Palisander statt Ebenholz für das Griffbrett.';
const a: Annotation = { id: 'order-6-neck_wood', start: 6, end: 16, text: 'Palisander', kind: 'order', field: 'fretboard_material',
  value: 'Palisander', intent: 'change', masked: false, dismissed: false, reviewed: true, origin: 'rules', reason: 'field' };
const fields = orderFields('GUITAR');
describe('human review and conservative local learning', () => {
  it('validates exact evidence and order type fields', () => {
    expect(() => validateAnnotation(a, text, fields)).not.toThrow();
    expect(() => validateAnnotation({ ...a, start: 0 }, text, fields)).toThrow();
    expect(() => validateAnnotation(a, text, orderFields('BODY'))).toThrow();
  });
  it('creates no rule candidates for order fields (these come from the local model)', () => {
    expect(initialAnnotations('Bitte Ahorn.\n> Früher Ebenholz.', [])).toEqual([]);
  });
  it('reuses a field correction for the entire same fresh text, as an unreviewed example', () => {
    const result = reuseExamples(`${text}\n> Alte Mail`, [{ text, annotations: [a] }], fields);
    expect(result[0]).toMatchObject({ id: a.id, field: 'fretboard_material', reviewed: false, origin: 'example' });
    expect(canApply(result[0])).toBe(false);
  });
  it('does not transfer examples when a later sentence contradicts the decision', () => {
    expect(reuseExamples(`${text} Aber bitte noch nicht umsetzen.`, [{ text, annotations: [a] }], fields)).toEqual([]);
  });
  it('keeps reviewed corrections and does not resurrect rejected candidates', () => {
    expect(mergeReviewed([{ ...a, reviewed: false }], [{ ...a, dismissed: true }])).toEqual([{ ...a, dismissed: true }]);
  });
  it('cannot apply questions, unreviewed values, rejections, or privacy marks', () => {
    expect(canApply(a)).toBe(true);
    for (const patch of [{ reviewed: false }, { dismissed: true }, { intent: 'question' as const }, { kind: 'privacy' as const }])
      expect(canApply({ ...a, ...patch })).toBe(false);
  });
  it('does not learn an unmasking permission', () => {
    expect(reuseExamples(text, [{ text, annotations: [{ ...a, kind: 'privacy', field: 'name', masked: false }] }], fields)).toEqual([]);
  });
  it('keeps overlapping text intact in highlight segments', () => {
    const spans = highlightSegments(text, [a, { ...a, id: 'other', start: 10, end: 20 }]);
    expect(spans.map(s => text.slice(s.start, s.end)).join('')).toBe(text);
    expect(spans.find(s => s.start === 10)?.ids).toEqual([a.id, 'other']);
  });
  it('does not remove protection outside a partial correction', () => {
    const entity = { type: 'name' as const, text: 'Anna Beispiel', start: 0, end: 13, confidence: 1, pii: true, source: 'regex' as const };
    const result = applyPrivacyReview([entity], { ...a, kind: 'privacy', field: 'name', text: 'Anna', start: 0, end: 4, masked: false });
    expect(result).toEqual([{ ...entity, start: 4, text: ' Beispiel' }]);
  });
  it('rejects forged payload categories and unbounded positions', () => {
    expect(MutationSchema.safeParse({ action: 'review', revision: 0, sourceHash: 'a'.repeat(64), orderId: null, annotation: { ...a, start: -1 }, reason: 'correct' }).success).toBe(false);
  });
});
