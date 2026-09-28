import { describe, expect, it } from 'vitest';
import { extractEntities, type ExtractedEntity } from '@/lib/mail/extraction';
import { locatePiiEntities } from '@/lib/pii/anonymize';
import { tokenizePII } from '@/lib/pii/tokenizer';

const entity = (text: string, extra: Partial<ExtractedEntity> = {}): ExtractedEntity => ({
  type: 'name', text, start: 0, end: text.length, confidence: 1, source: 'regex', pii: true, ...extra,
});

async function anonymize(text: string, stored: ExtractedEntity[]) {
  const fresh = await extractEntities(text, null, { skipDb: true });
  return tokenizePII(text, locatePiiEntities(text, [...stored, ...fresh])).tokenizedText;
}

describe('locatePiiEntities', () => {
  it('schwaerzt auch den zitierten Verlauf, den die Sync-Erkennung nie gesehen hat', async () => {
    const text = 'Hallo, bitte den Korpus aus Erle.\nViele Grüße\nAnna Beispiel\n\n' +
      '> Am 01.09. schrieb Anna Beispiel:\n> Lieferung an Musterstraße 12, 12345 Musterstadt\n> Tel. 0171 2345678';
    // Beim Sync nur auf dem neuen Teil erkannt, Positionen dort:
    const stored = [entity('Anna Beispiel', { start: 47, end: 60 })];
    const out = await anonymize(text, stored);
    expect(out).not.toContain('Anna Beispiel');
    expect(out).not.toContain('Musterstraße 12');
    expect(out).not.toContain('0171 2345678');
    expect(out).toContain('Korpus aus Erle');
  });

  it('laesst bei ueberlappenden Treffern keinen Namensteil stehen', () => {
    const text = 'Grüße, Anna Beispiel';
    const located = locatePiiEntities(text, [entity('Anna'), entity('Anna Beispiel', { source: 'db' })]);
    expect(tokenizePII(text, located).tokenizedText).toBe('Grüße, {{NAME_1}}');
  });

  it('findet Namen trotz anderem Zeilenumbruch und anderer Schreibung', () => {
    const text = 'Viele Grüße\nANNA\n  Beispiel';
    const out = tokenizePII(text, locatePiiEntities(text, [entity('Anna Beispiel')])).tokenizedText;
    expect(out).not.toMatch(/beispiel/i);
  });

  it('respektiert menschliche Verwerfungen, aber eine spaetere manuelle Markierung gewinnt', () => {
    const text = 'Grüße aus Erlangen';
    const dismissed = entity('Erlangen', { type: 'address', pii: false, dismissed: true });
    expect(locatePiiEntities(text, [dismissed, entity('Erlangen', { type: 'address' })])).toHaveLength(0);
    const remarked = entity('Erlangen', { type: 'address', source: 'manual' });
    expect(locatePiiEntities(text, [dismissed, remarked])).toHaveLength(1);
  });

  it('trifft keine Teilwoerter', () => {
    const text = 'Magdalena schreibt, Lena antwortet';
    const located = locatePiiEntities(text, [entity('Lena')]);
    expect(located.map(e => e.start)).toEqual([text.indexOf('Lena ')]);
  });
});
