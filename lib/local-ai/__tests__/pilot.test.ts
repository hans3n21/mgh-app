import { afterEach, describe, expect, it, vi } from 'vitest';
import { prepareCandidates } from '../candidates';
import { localOrigin } from '../config';
import { analyzeLocally } from '../client';

const config = { enabled: true, baseUrl: 'http://192.168.1.20:8765', apiKey: 'test-key'.repeat(5) };
afterEach(() => vi.unstubAllGlobals());

describe('local destination', () => {
  it.each(['http://192.168.1.20:8765', 'http://10.1.2.3', 'https://172.16.0.1', 'http://127.0.0.1:8765'])('accepts %s', url => {
    expect(localOrigin(url)).toBe(new URL(url).origin);
  });
  it.each(['https://example.com', 'http://8.8.8.8', 'http://169.254.169.254', 'http://172.32.0.1',
    'http://192.168.1.1/secret', 'http://user:pass@192.168.1.1', 'ftp://10.1.2.3', 'http://192.168.1.1?redirect=cloud'])('rejects %s', url => {
    expect(() => localOrigin(url)).toThrow();
  });
});

describe('grounded pilot candidates', () => {
  it('removes old quoted requests before deriving values', () => {
    const result = prepareCandidates('Bitte Ahorn.\r\n\r\nAm Montag schrieb Kunde:\r\nBitte Ebenholz.', 'NECK');
    expect(result.hadQuotes).toBe(true);
    expect(result.text).not.toContain('Ebenholz');
    expect(result.candidates.map(c => c.value)).toEqual(['Ahorn', 'Ahorn']);
    expect(result.candidates.every(c => c.evidence.includes(c.value))).toBe(true);
  });
  it('only uses fields in the order preset', () => {
    expect(prepareCandidates('Bitte Ahorn und 22 Edelstahlbünde.', 'BODY').candidates.map(c => c.field)).toEqual(['body_material']);
    expect(prepareCandidates('Bitte Ahorn.', 'PICKGUARD').candidates).toEqual([]);
  });
  it('keeps negatives as candidates for the decision model, without claiming they are wishes', () => {
    expect(prepareCandidates('Kein Ebenholz. Wäre Ahorn möglich?', 'NECK').candidates).toHaveLength(4);
  });
  it('recognizes labelled dimensions and preserves the exact source value', () => {
    const { candidates } = prepareCandidates('Mensur: 648 mm, Radius von 12 Zoll, 22 Edelstahlbünde.', 'NECK');
    expect(candidates.map(c => c.value)).toEqual(['22 Edelstahlbünde', 'Radius von 12 Zoll', 'Mensur: 648 mm']);
  });
  it('rejects unknown types and excessive input rather than silently truncating', () => {
    expect(() => prepareCandidates('Ahorn', '__proto__')).toThrow();
    expect(() => prepareCandidates('x'.repeat(6001), 'NECK')).toThrow();
  });
});

describe('local model boundary', () => {
  it('does not call a service when disabled or when there are no candidates', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await expect(analyzeLocally({ ...config, enabled: false }, 'Ahorn', 'NECK')).rejects.toThrow('ausgeschaltet');
    await expect(analyzeLocally(config, 'Guten Tag', 'NECK')).rejects.toThrow('Keine unterstützten');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('validates answers, uses local candidate values and rejects redirects', async () => {
    const probabilities = { confirmed: 0.85, tentative: 0.05, rejected: 0.05, unclear: 0.05 };
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ model: 'convaiinnovations/laya-multilingual', revision: 'test-revision',
      answers: { c0: { choice: 'confirmed', probabilities, field: 'customer.email', value: 'invented' } } })));
    vi.stubGlobal('fetch', fetcher);
    const result = await analyzeLocally(config, 'Bitte den Body aus Ahorn.', 'BODY');
    expect(result.findings[0]).toMatchObject({ field: 'body_material', value: 'Ahorn', probability: 0.85 });
    expect(fetcher.mock.calls[0][0]).toBe('http://192.168.1.20:8765/analyze');
    expect(fetcher.mock.calls[0][1].redirect).toBe('error');
  });
  it.each([
    {},
    { c0: { choice: 'confirmed', probabilities: { confirmed: 1, tentative: 1, rejected: 1, unclear: 1 } } },
    { c0: { choice: 'confirmed', probabilities: { confirmed: 0.1, tentative: 0.7, rejected: 0.1, unclear: 0.1 } } },
  ])('rejects missing or inconsistent decisions', async answers => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ model: 'convaiinnovations/laya-multilingual', revision: 'test', answers }))));
    await expect(analyzeLocally(config, 'Ahorn', 'BODY')).rejects.toThrow();
  });
  it('does not leak arbitrary service error text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('private customer content', { status: 500 })));
    await expect(analyzeLocally(config, 'Ahorn', 'BODY')).rejects.toThrow('KI-Dienst konnte');
  });
});
