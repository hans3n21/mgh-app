import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), mail: vi.fn(), examples: vi.fn(), create: vi.fn(), update: vi.fn(),
  specs: vi.fn(), newSpec: vi.fn(), order: vi.fn(), extraction: vi.fn(), transaction: vi.fn(), config: vi.fn(), context: vi.fn() }));
vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/local-ai/settings', () => ({ readLocalAiConfig: mocks.config }));
vi.mock('@/lib/ai-training/ollama', () => ({ readModelConfig: mocks.config }));
vi.mock('@/lib/ai-training/context', async original => ({ ...await original<typeof import('@/lib/ai-training/context')>(), loadContext: mocks.context }));
vi.mock('@/lib/prisma', () => {
  const client = { mail: { findUnique: mocks.mail }, mailTrainingReview: { findMany: mocks.examples, create: mocks.create, updateMany: mocks.update },
    orderSpecKV: { updateMany: mocks.specs, create: mocks.newSpec }, order: { update: mocks.order }, mailExtraction: { upsert: mocks.extraction } };
  return { prisma: { ...client, $transaction: (fn: (client: unknown) => unknown, options: unknown) => { mocks.transaction(options); return fn(client); } } };
});
import { GET, POST } from '@/app/api/mails/[id]/training/route';
import { sourceHash } from '../review';
import type { Annotation } from '../contracts';
const text = 'Bitte Palisander statt Ebenholz.';
const a: Annotation = { id: 'a', start: 6, end: 16, text: 'Palisander', kind: 'order', field: 'fretboard_material', value: 'Palisander', intent: 'change', masked: false, dismissed: false, origin: 'rules', reviewed: true };
const params = { params: Promise.resolve({ id: 'm1' }) };
const req = (body: unknown) => new NextRequest('http://localhost/api/mails/m1/training', { method: 'POST', body: JSON.stringify(body) });
const base = { revision: 1, sourceHash: sourceHash(text), orderId: 'o1' };
const mail = () => ({ id: 'm1', text, html: null, orderId: 'o1', accountId: 'acc1', isDeleted: false,
  order: { type: 'GUITAR', deletedAt: null, specs: [{ key: 'fretboard_material', value: 'Ebenholz' }] }, extraction: { entities: [] },
  trainingReview: { sourceHash: sourceHash(text), orderId: 'o1', revision: 1, annotations: [a], history: [] } });
beforeEach(() => {
  vi.resetAllMocks(); mocks.auth.mockResolvedValue({ user: { id: 'admin1', role: 'admin' } });
  mocks.mail.mockResolvedValue(mail()); mocks.examples.mockResolvedValue([]); mocks.update.mockResolvedValue({ count: 1 }); mocks.config.mockResolvedValue({ enabled: false });
  mocks.specs.mockResolvedValue({ count: 1 });
});
describe('training authorization and persistence', () => {
  it('requires admin for both reading and writing', async () => {
    for (const user of [null, { user: { role: 'staff' } }]) {
      mocks.auth.mockResolvedValue(user);
      expect((await GET(req({}), params)).status).toBe(user ? 403 : 401);
      expect((await POST(req({}), params)).status).toBe(user ? 403 : 401);
    }
    expect(mocks.mail).not.toHaveBeenCalled();
  });
  it('stores feedback without changing any order data', async () => {
    expect((await POST(req({ ...base, action: 'review', annotation: a, reason: 'field' }), params)).status).toBe(200);
    expect(mocks.update).toHaveBeenCalled(); expect(mocks.specs).not.toHaveBeenCalled(); expect(mocks.newSpec).not.toHaveBeenCalled();
  });
  it('updates privacy extraction and feedback in the same transaction', async () => {
    const privacy = { ...a, kind: 'privacy', field: 'name', masked: true, id: 'privacy-new' };
    expect((await POST(req({ ...base, action: 'review', annotation: privacy, reason: 'missed' }), params)).status).toBe(200);
    expect(mocks.extraction).toHaveBeenCalled(); expect(mocks.transaction).toHaveBeenCalledWith(expect.objectContaining({ isolationLevel: 'Serializable' }));
  });
  it('rejects stale review revision and changed mail assignment', async () => {
    for (const patch of [{ revision: 0 }, { orderId: 'o2' }, { sourceHash: 'x'.repeat(64) }])
      expect((await POST(req({ ...base, ...patch, action: 'apply', annotationId: 'a', expectedValue: 'Ebenholz' }), params)).status).toBe(409);
    expect(mocks.specs).not.toHaveBeenCalled();
  });
  it('rejects stale order values, and writes with matching current value only', async () => {
    expect((await POST(req({ ...base, action: 'apply', annotationId: 'a', expectedValue: 'Ahorn' }), params)).status).toBe(409);
    expect(mocks.specs).not.toHaveBeenCalled();
    expect((await POST(req({ ...base, action: 'apply', annotationId: 'a', expectedValue: 'Ebenholz' }), params)).status).toBe(200);
    expect(mocks.specs).toHaveBeenCalledWith({ where: { orderId: 'o1', key: 'fretboard_material', value: 'Ebenholz' }, data: { value: 'Palisander' } });
    const written = mocks.update.mock.calls[0][0].data.history;
    expect(written[0]).toMatchObject({ oldValue: 'Ebenholz', newValue: 'Palisander', action: 'apply', userId: 'admin1' });
  });
  it('never applies questions or unreviewed examples', async () => {
    for (const patch of [{ intent: 'question' }, { reviewed: false }]) {
      const m = mail(); m.trainingReview.annotations = [{ ...a, ...patch } as Annotation]; mocks.mail.mockResolvedValue(m);
      expect((await POST(req({ ...base, action: 'apply', annotationId: 'a', expectedValue: 'Ebenholz' }), params)).status).toBe(400);
    }
    expect(mocks.specs).not.toHaveBeenCalled();
  });
  it('rejects quoted old statements even if manually confirmed', async () => {
    const m = mail(); m.text = `Danke.\n> ${text}`;
    const start = m.text.indexOf('Palisander');
    m.trainingReview.sourceHash = sourceHash(m.text); m.trainingReview.annotations = [{ ...a, start, end: start + 10 }];
    mocks.mail.mockResolvedValue(m);
    expect((await POST(req({ ...base, sourceHash: sourceHash(m.text), action: 'apply', annotationId: 'a', expectedValue: 'Ebenholz' }), params)).status).toBe(409);
    expect(mocks.specs).not.toHaveBeenCalled();
  });
  it('scopes example retrieval to the same postbox and excludes deleted mails', async () => {
    await GET(req({}), params);
    expect(mocks.examples).toHaveBeenCalledWith(expect.objectContaining({ where: { mailId: { not: 'm1' }, mail: { accountId: 'acc1', isDeleted: false } } }));
  });
  it('makes outdated context annotations reviewable again after reanalysis, or dismissible', async () => {
    const m = mail(); m.trainingReview.annotations = [{ ...a, origin: 'model', contextHash: 'f'.repeat(64) }]; mocks.mail.mockResolvedValue(m);
    mocks.context.mockResolvedValue({ snapshot: { currentId: 'm1', orderType: 'GUITAR', fields: [], messages: [], omitted: 0 } });
    const data = await (await GET(req({}), params)).json();
    expect(data.annotations.find((item: Annotation) => item.id === a.id).reviewed).toBe(false);
    expect(data.notice).toContain('neu auswerten');
    const discarded = { ...m.trainingReview.annotations[0], dismissed: true };
    expect((await POST(req({ ...base, action: 'review', annotation: discarded, reason: 'field' }), params)).status).toBe(200);
  });
});
