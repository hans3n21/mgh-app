import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), context: vi.fn(), review: vi.fn(), first: vi.fn(), create: vi.fn(), rows: vi.fn(), count: vi.fn(), transaction: vi.fn(), setting: vi.fn() }));
vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('../context', async importOriginal => ({ ...await importOriginal<typeof import('../context')>(), loadContext: mocks.context }));
vi.mock('@/lib/prisma', () => {
  const tx = { mailTrainingReview: { findUnique: mocks.review }, aiTrainingCase: { findFirst: mocks.first, create: mocks.create, findMany: mocks.rows }, mail: { count: mocks.count }, systemSetting: { findUnique: mocks.setting } };
  return { prisma: { ...tx, $transaction: (fn: (v: unknown) => unknown, options: unknown) => { mocks.transaction(options); return fn(tx); } } };
});
import { createCase, exportTraining, listCases, selectExamples } from '../service';
import { POST, GET } from '@/app/api/admin/ai-training/route';
import type { Snapshot } from '../contracts';
const snapshot: Snapshot = { currentId: 'm1', orderType: 'GUITAR', fields: [{ key: 'fretboard_material', label: 'Griffbrett' }], omitted: 0,
  messages: [{ id: 'm1', date: '2026-01-01', role: 'customer', text: 'Bitte Palisander.' }] };
const body = { mailId: 'm1', title: 'Materialwunsch', partition: 'test' as const, revision: 2, sourceHash: 'x'.repeat(64) };
const expected = [{ kind: 'order', field: 'fretboard_material', value: 'Palisander', intent: 'confirmed', quote: 'Palisander', evidence: [] }];
beforeEach(() => {
  vi.resetAllMocks(); mocks.auth.mockResolvedValue({ user: { id: 'a1', role: 'admin' } });
  mocks.context.mockResolvedValue({ snapshot, sourceHash: body.sourceHash, accountId: 'acc1', groupKeys: ['customer-key', 'order-key'], orderId: 'o1', freshOffset: 0 });
  mocks.review.mockResolvedValue({ revision: 2, sourceHash: body.sourceHash, orderId: 'o1', annotations: [{ id: 'a', start: 6, end: 16, text: 'Palisander', kind: 'order', field: 'fretboard_material', value: 'Palisander', intent: 'confirmed', masked: false, dismissed: false, reviewed: true, origin: 'manual' }] });
  mocks.first.mockResolvedValue(null); mocks.rows.mockResolvedValue([]); mocks.count.mockResolvedValue(1); mocks.setting.mockResolvedValue(null);
});
describe('admin datasets', () => {
  it('rejects unauthenticated users and staff before reading or writing data', async () => {
    for (const session of [null, { user: { role: 'staff' } }]) {
      mocks.auth.mockResolvedValue(session);
      expect((await GET()).status).toBe(session ? 403 : 401);
      expect((await POST(new NextRequest('http://localhost/api/admin/ai-training', { method: 'POST', body: JSON.stringify({ action: 'export' }) }))).status).toBe(session ? 403 : 401);
    }
    expect(mocks.rows).not.toHaveBeenCalled();
  });
  it('freezes reviewed values without accessing or writing current order specs', async () => {
    await createCase(body, 'a1');
    expect(mocks.transaction).toHaveBeenCalledWith(expect.objectContaining({ isolationLevel: 'Serializable' }));
    expect(mocks.create).toHaveBeenCalledWith({ data: expect.objectContaining({ partition: 'test', snapshot, expected: [{ ...expected[0], occurrence: 0 }], createdBy: 'a1' }) });
  });
  it('rejects stale reviews and prevents train/test group contamination', async () => {
    await expect(createCase({ ...body, revision: 1 }, 'a1')).rejects.toThrow('geändert');
    mocks.first.mockResolvedValueOnce(null).mockResolvedValueOnce({ partition: 'train' });
    await expect(createCase(body, 'a1')).rejects.toThrow('überschneiden'); expect(mocks.create).not.toHaveBeenCalled();
  });
  it('supports explicitly reviewed negative cases', async () => {
    mocks.review.mockResolvedValue(null); await createCase({ ...body, revision: 0 }, 'a1');
    expect(mocks.create).toHaveBeenCalledWith({ data: expect.objectContaining({ expected: [] }) });
  });
  it('retrieves only separate training groups and excludes unavailable sources', async () => {
    mocks.rows.mockResolvedValue([{ id: 'same', groupKeys: ['customer-key'], snapshot, expected }, { id: 'good', groupKeys: ['different'], snapshot, expected }]);
    const examples = await selectExamples(snapshot, 'acc1', ['customer-key']);
    expect(examples.map(e => e.id)).toEqual(['good']);
    expect(mocks.rows).toHaveBeenCalledWith(expect.objectContaining({ where: { accountId: 'acc1', partition: 'train', mail: { isDeleted: false } } }));
    mocks.count.mockResolvedValue(0); expect(await selectExamples(snapshot, 'acc1', ['customer-key'])).toEqual([]);
  });
  it('exports only train partition, with the same prompt and no current order state', async () => {
    mocks.rows.mockResolvedValue([{ id: 'train1', fingerprint: 'hash', snapshot, expected }]);
    const line = JSON.parse(await exportTraining());
    expect(mocks.rows).toHaveBeenCalledWith(expect.objectContaining({ where: { partition: 'train', mail: { isDeleted: false } } }));
    expect(line.messages.at(-1)).toEqual({ role: 'assistant', content: JSON.stringify({ findings: expected }) });
    expect(JSON.stringify(line)).not.toContain('currentValues');
  });
  it('keeps unavailable cases removable but hides their stored texts and results', async () => {
    mocks.rows.mockResolvedValue([{ id: 'old', snapshot, expected, results: [{ findings: expected }] }]);
    mocks.count.mockResolvedValue(0);
    expect(await listCases()).toEqual([expect.objectContaining({ id: 'old', unavailable: true, snapshot: { ...snapshot, messages: [] }, expected: [], results: [] })]);
  });
});
