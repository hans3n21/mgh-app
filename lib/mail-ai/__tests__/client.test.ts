import { describe, expect, it } from 'vitest';
import { toPiiEntities } from '@/lib/mail-ai/client';
import { mergeManualDecisions, mergeModelEntities, type ExtractedEntity } from '@/lib/mail/extraction';

const TEXT = 'Was würden 22 Edelstahlbünde kosten?\nViele Grüße\nKatrin Probe\nBeispielweg 7a, 54321 Probstadt';
const at = (text: string) => ({ start: TEXT.indexOf(text), end: TEXT.indexOf(text) + text.length, text });

describe('toPiiEntities', () => {
  it('uebernimmt belegte Funde als Quelle ml', () => {
    const out = toPiiEntities(TEXT, { entities: [{ type: 'name', confidence: 0.64, ...at('Katrin') }, { type: 'address', confidence: 0.98, ...at('Beispielweg 7a') }] });
    expect(out.map(e => [e.type, e.text, e.source])).toEqual([['name', 'Katrin', 'ml'], ['address', 'Beispielweg 7a', 'ml']]);
  });

  it('verwirft unsichere Adressen und Werkstattbegriffe', () => {
    expect(toPiiEntities(TEXT, { entities: [{ type: 'address', confidence: 0.85, ...at('22 Edelstahlbünde') }] })).toEqual([]);
    const text = 'Korpus aus Erle';
    expect(toPiiEntities(text, { entities: [{ type: 'postalCode', text: 'Erle', start: 11, end: 15, confidence: 0.99 }] })).toEqual([]);
  });

  it('verwirft Funde, deren Position nicht zum Text passt', () => {
    expect(toPiiEntities(TEXT, { entities: [{ type: 'name', text: 'Erfunden', start: 0, end: 8, confidence: 0.99 }] })).toEqual([]);
  });

  it('lehnt eine unerwartete Antwortform ab', () => {
    expect(() => toPiiEntities(TEXT, { entities: [{ type: 'shell', text: 'x', start: 0, end: 1, confidence: 1 }] })).toThrow();
  });
});

describe('mergeModelEntities', () => {
  const e = (text: string, extra: Partial<ExtractedEntity> = {}): ExtractedEntity => ({
    type: 'name', ...at(text), confidence: 0.8, source: 'regex', pii: true, ...extra,
  });

  it('ersetzt fruehere Modellfunde und respektiert Verwerfungen', () => {
    const existing = [e('Katrin Probe'), e('Probstadt', { source: 'ml', type: 'postalCode' }), e('Beispielweg 7a', { source: 'ml', type: 'address', pii: false, dismissed: true })];
    const model = [e('Katrin', { source: 'ml' }), e('Beispielweg 7a', { source: 'ml', type: 'address' }), e('54321 Probstadt', { source: 'ml', type: 'postalCode' })];
    const merged = mergeModelEntities(existing, model);
    const active = merged.filter(x => x.pii).map(x => `${x.source}:${x.text}`);
    // "Katrin" ueberlappt die Regelmarkierung, "Beispielweg 7a" wurde verworfen, alter ml-Fund "Probstadt" ersetzt.
    expect(active).toEqual(['regex:Katrin Probe', 'ml:54321 Probstadt']);
    expect(merged.some(x => x.dismissed && x.text === 'Beispielweg 7a')).toBe(true);
  });

  it('Neuerkennung beim Einlesen behaelt Modellfunde', () => {
    const previous = [e('54321 Probstadt', { source: 'ml', type: 'postalCode' })];
    const merged = mergeManualDecisions([e('Katrin Probe')], previous);
    expect(merged.map(x => x.text)).toEqual(['Katrin Probe', '54321 Probstadt']);
  });
});
