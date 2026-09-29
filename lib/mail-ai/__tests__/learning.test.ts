import { describe, expect, it } from 'vitest';
import { computeContactStats, computeStats, pickExamples } from '@/lib/mail-ai/learning';
import { buildSuggestionMessages } from '@/lib/mail-ai/order-suggestions';
import type { Annotation } from '@/lib/mail-training/contracts';

const text = 'Hallo,\nden Hals bitte als Slim Taper. Keine Inlays, nur Side Dots.\nGrüße';
const a = (value: string, field: string, extra: Partial<Annotation> = {}): Annotation => {
  const start = text.indexOf(value);
  return { id: `${field}-${start}`, start, end: start + value.length, text: value, kind: 'order', field, value, intent: 'confirmed',
    masked: false, dismissed: false, origin: 'model', reviewed: true, reason: 'correct', ...extra };
};

describe('pickExamples', () => {
  it('bevorzugt Korrekturen, ein Beispiel je Feld, Wert immer woertlich', () => {
    const annotations = [
      a('Slim Taper', 'neck_shape'),
      a('Inlays', 'inlays', { intent: 'rejected', reason: 'intent' }),
      a('Side Dots', 'side_dots', { value: 'Luminlay', reason: 'value' }),
    ];
    const examples = pickExamples([{ text, annotations }]);
    expect(examples).toHaveLength(2);
    expect(examples.map(e => e.findings[0].field)).toEqual(['inlays', 'side_dots']);
    // Korrigierter Wert "Luminlay" wird NICHT als Wert gelehrt, sondern die Stelle aus der Mail.
    expect(examples[1].findings[0]).toMatchObject({ value: 'Side Dots', quote: 'Keine Inlays, nur Side Dots.' });
  });

  it('nutzt keine ungeprueften, verworfenen oder verschobenen Markierungen', () => {
    const annotations = [a('Slim Taper', 'neck_shape', { reviewed: false }), a('Inlays', 'inlays', { dismissed: true }),
      { ...a('Side Dots', 'side_dots'), start: 0, end: 9 }];
    expect(pickExamples([{ text, annotations }])).toEqual([]);
  });
});

describe('computeStats', () => {
  it('zaehlt richtig, korrigiert und falsch je Feld und trennt Laeufe mit Lernbeispielen', () => {
    const stats = computeStats([[
      a('Slim Taper', 'neck_shape'),
      a('Inlays', 'inlays', { reason: 'intent', modelRevision: 'gemma4:e4b@abc+ex' }),
      a('Side Dots', 'side_dots', { dismissed: true, reason: 'wrong' }),
      a('Slim Taper', 'neck_shape', { reviewed: false }),
      a('Slim Taper', 'neck_shape', { origin: 'manual' }),
    ]]);
    expect(stats.fields.find(f => f.field === 'neck_shape')).toMatchObject({ total: 1, correct: 1 });
    expect(stats.fields.find(f => f.field === 'inlays')).toMatchObject({ total: 1, corrected: 1 });
    expect(stats.fields.find(f => f.field === 'side_dots')).toMatchObject({ total: 1, wrong: 1 });
    expect(stats.variants).toEqual(expect.arrayContaining([{ withExamples: true, total: 1, correct: 0 }, { withExamples: false, total: 2, correct: 1 }]));
  });
});

describe('computeContactStats', () => {
  it('zaehlt unveraendert bestaetigte und vom Menschen geaenderte Kontaktfelder', () => {
    const ev = (field: string, reason: string) => ({ at: '', userId: 'u', action: 'contact' as const, field, reason });
    expect(computeContactStats([[ev('phone', 'correct'), ev('addressLine1', 'value')], [ev('phone', 'removed'), { at: '', userId: 'u', action: 'apply' as const }]]))
      .toEqual([{ field: 'phone', label: 'Telefon', total: 2, correct: 1, corrected: 1 }, { field: 'addressLine1', label: 'Straße', total: 1, correct: 0, corrected: 1 }]);
  });
});

describe('Prompt', () => {
  it('erklaert Beispiele nur, wenn welche dabei sind', () => {
    const base = { fresh: 'Hals aus Ahorn.', fields: [{ key: 'neck_wood', label: 'Hals-Holz' }], current: {} };
    expect(buildSuggestionMessages(base)[0].content).not.toMatch(/examples/);
    const withEx = buildSuggestionMessages({ ...base, examples: [{ text: 'Hals aus Erle.', findings: [{ field: 'neck_wood', value: 'Erle', intent: 'confirmed', quote: 'Hals aus Erle.' }] }] });
    expect(withEx[0].content).toMatch(/"examples" sind von Menschen geprüfte Stellen/);
    expect(JSON.parse(withEx[1].content).examples).toHaveLength(1);
  });
});
