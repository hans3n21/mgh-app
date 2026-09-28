import { describe, expect, it } from 'vitest';
import { extractEntities, mergeManualDecisions, type ExtractedEntity } from '@/lib/mail/extraction';

const addresses = async (text: string) =>
  (await extractEntities(text, null, { skipDb: true })).filter(e => e.type === 'address').map(e => e.text);

describe('Ortserkennung', () => {
  it('haelt Holz- und Materialangaben nicht fuer Orte', async () => {
    expect(await addresses('Korpus aus Erle, Hals aus Ahorn mit Griffbrett aus Palisander.')).toEqual([]);
    expect(await addresses('Die Kappen bitte aus Messing, das Pickguard aus Kunststoff.')).toEqual([]);
    expect(await addresses('I would like the body from Alder.')).toEqual([]);
  });

  it('erkennt Material auch ohne Vokabeleintrag am Bauteil davor', async () => {
    expect(await addresses('Den Hals komplett aus Paulownia, den Korpus aus Sipo.')).toEqual([]);
  });

  it('erkennt echte Herkunftsorte weiterhin', async () => {
    expect(await addresses('Viele Grüße aus Erlangen')).toEqual(['Erlangen']);
  });
});

describe('mergeManualDecisions', () => {
  const e = (text: string, extra: Partial<ExtractedEntity> = {}): ExtractedEntity => ({
    type: 'name', text, start: 0, end: text.length, confidence: 0.8, source: 'regex', pii: true, ...extra,
  });

  it('behaelt manuelle Markierungen und Verwerfungen bei einer Neuerkennung', () => {
    const previous = [
      e('Erlangen', { type: 'address', pii: false, dismissed: true }),
      e('Lena', { source: 'manual', start: 40, end: 44 }),
    ];
    const fresh = [e('Erlangen', { type: 'address' }), e('Thomas Beispiel')];
    const merged = mergeManualDecisions(fresh, previous);
    expect(merged.filter(x => x.pii).map(x => x.text).sort()).toEqual(['Lena', 'Thomas Beispiel']);
    expect(merged.some(x => x.dismissed && x.text === 'Erlangen')).toBe(true);
  });

  it('aendert nichts ohne fruehere Entscheidungen', () => {
    const fresh = [e('Thomas Beispiel')];
    expect(mergeManualDecisions(fresh, [e('Alt')])).toBe(fresh);
    expect(mergeManualDecisions(fresh, null)).toBe(fresh);
  });
});
