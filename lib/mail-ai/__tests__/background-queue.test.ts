import { beforeEach, describe, expect, it, vi } from 'vitest';

// Warteschlange der Hintergrundpruefung ohne Datenbank und Modell: nur die Reihenfolge der Aufrufe.
const mocks = vi.hoisted(() => ({ calls: [] as string[], onSuggest: null as null | ((id: string) => void) }));
vi.mock('@/lib/prisma', () => ({
  prisma: { mail: { findMany: vi.fn(async ({ where }: { where: { OR: [{ id: { in: string[] } }] } }) =>
    Array.from(new Set(['a', 'b', 'c', ...where.OR[0].id.in])).map(id =>
      ({ id, folder: 'INBOX', orderId: 'ORD-2026-001', customerId: null, fromEmail: 'kunde@example.org' }))) } },
}));
vi.mock('@/lib/ai-training/ollama', () => ({ readModelConfig: async () => ({ enabled: true }) }));
vi.mock('@/lib/mail-ai/client', () => ({ readMailAiConfig: async () => ({ enabled: false }), detectPiiStrict: vi.fn(), localSuggestionsOff: () => false }));
vi.mock('@/lib/mail-ai/order-suggestions', () => ({
  suggestForMail: vi.fn(async (id: string) => { mocks.calls.push(id); mocks.onSuggest?.(id); return null; }),
}));

describe('scheduleMailAnalysis', () => {
  beforeEach(() => {
    delete (globalThis as { __mailAiQueue?: unknown }).__mailAiQueue;
    vi.resetModules();
    mocks.calls.length = 0;
    mocks.onSuggest = null;
  });

  it('zieht eine waehrend der 24-Stunden-Pruefung zugeordnete Mail vor', async () => {
    const { scheduleMailAnalysis } = await import('@/lib/mail-ai/background');
    mocks.onSuggest = id => { if (id === 'a') scheduleMailAnalysis(['neu']); };
    scheduleMailAnalysis();
    await vi.waitFor(() => expect(mocks.calls).toHaveLength(4));
    expect(mocks.calls).toEqual(['a', 'neu', 'b', 'c']);
  });
});
