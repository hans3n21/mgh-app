import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), config: vi.fn(), mail: vi.fn(), analyze: vi.fn(), existing: vi.fn(), create: vi.fn(), upsert: vi.fn() }));
vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/local-ai/settings', () => ({ CONFIG_KEY: 'local-ai:pilot', readLocalAiConfig: mocks.config }));
vi.mock('@/lib/prisma', () => ({ prisma: { mail: { findUnique: mocks.mail }, orderFieldSuggestion: { findFirst: mocks.existing, create: mocks.create }, systemSetting: { upsert: mocks.upsert } } }));
vi.mock('@/lib/local-ai/client', () => ({ analyzeLocally: mocks.analyze, LocalAiError: class extends Error {} }));
import { POST, PUT } from '@/app/api/mails/[id]/local-ai/route';
import { GET as getConfig, PUT as putConfig } from '@/app/api/settings/local-ai/route';

const params = { params: Promise.resolve({ id: 'mail-1' }) };
const request = (body: unknown) => new NextRequest('http://localhost/api/test', { method: 'PUT', body: JSON.stringify(body) });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ user: { role: 'staff', id: 'staff-1' } });
  mocks.config.mockResolvedValue({ enabled: true, baseUrl: 'http://192.168.1.20:8765', apiKey: 'secret' });
  mocks.mail.mockResolvedValue({ id: 'mail-1', orderId: 'order-1', text: 'Bitte Ahorn.', isDeleted: false, order: { type: 'BODY', specs: [{ key: 'body_material', value: 'Erle' }] } });
  mocks.analyze.mockResolvedValue({ findings: [{ id: 'c0', field: 'body_material', value: 'Ahorn', decision: 'confirmed' }] });
});

describe('manual mail pilot routes', () => {
  it('requires a session before accessing mail', async () => {
    mocks.auth.mockResolvedValue(null);
    expect((await POST(request({}), params)).status).toBe(401);
    expect((await PUT(request({}), params)).status).toBe(401);
    expect(mocks.mail).not.toHaveBeenCalled();
  });
  it('analysis returns current values and never writes suggestions', async () => {
    const result = await POST(request({}), params);
    expect((await result.json()).findings[0].currentValue).toBe('Erle');
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('rejects a changed order association before saving', async () => {
    const result = await PUT(request({ orderId: 'other-order', field: 'body_material', value: 'Ahorn' }), params);
    expect(result.status).toBe(409);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('rejects fields and values without source evidence', async () => {
    expect((await PUT(request({ orderId: 'order-1', field: 'customer.email', value: 'Ahorn' }), params)).status).toBe(400);
    expect((await PUT(request({ orderId: 'order-1', field: 'body_material', value: 'Mahagoni' }), params)).status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('only creates a pending suggestion after the manual action', async () => {
    const result = await PUT(request({ orderId: 'order-1', field: 'body_material', value: 'Ahorn' }), params);
    expect(result.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith({ data: { orderId: 'order-1', field: 'order.body_material', value: 'Ahorn', mailId: 'mail-1', status: 'suggested' } });
  });
  it('does not reintroduce an already rejected suggestion', async () => {
    mocks.existing.mockResolvedValue({ status: 'rejected' });
    const response = await PUT(request({ orderId: 'order-1', field: 'body_material', value: 'Ahorn' }), params);
    expect((await response.json()).alreadyProcessed).toBe(true);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('does not reveal keys or addresses to staff and forbids config changes', async () => {
    expect(await (await getConfig()).json()).toEqual({ enabled: true, isAdmin: false });
    expect((await putConfig(request({}))).status).toBe(403);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it('does not reveal the key to admins either', async () => {
    mocks.auth.mockResolvedValue({ user: { role: 'admin' } });
    const data = await (await getConfig()).json();
    expect(data.apiKeySet).toBe(true);
    expect(data.apiKey).toBeUndefined();
  });
});
