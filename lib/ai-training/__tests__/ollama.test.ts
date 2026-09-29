import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
import { ConfigSchema, assertLocalModel, installedModels, localRequest } from '../ollama';
import type { ModelConfig } from '../contracts';
const config: ModelConfig = { enabled: true, localOnlyConfirmed: true, baseUrl: 'http://127.0.0.1:11434', model: 'qwen3.5:4b', useExamples: false };
const model = { name: config.model, size: 2000000000, digest: 'sha256:fixture', details: { format: 'gguf' } };
const response = (v: unknown) => new Response(JSON.stringify(v), { headers: { 'Content-Type': 'application/json' } });
afterEach(() => vi.unstubAllGlobals());
describe('local model boundary', () => {
  it('rejects public URLs, hostnames and unconfirmed local operation', () => {
    for (const baseUrl of ['https://ollama.com', 'http://8.8.8.8', 'http://127.0.0.1:11434/proxy']) expect(ConfigSchema.safeParse({ ...config, baseUrl }).success).toBe(false);
    expect(ConfigSchema.safeParse({ ...config, localOnlyConfirmed: false }).success).toBe(false);
  });
  it('only lists installed local weights, omitting cloud stubs', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ models: [model, { ...model, name: 'remote:cloud' }, { ...model, name: 'remote', remote_host: 'https://remote.invalid' }, { ...model, name: 'stub', size: 100 }] })));
    expect((await installedModels(config.baseUrl)).map(m => m.name)).toEqual([config.model]);
  });
  it('blocks a disguised cloud model before any mail text is sent', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response({ models: [model] })).mockResolvedValueOnce(response({ remote_host: 'https://remote.invalid', model_info: {}, details: { format: 'gguf' } }));
    vi.stubGlobal('fetch', fetch);
    await expect(assertLocalModel(config.baseUrl, config.model)).rejects.toThrow('Cloud');
    // Nur Modellliste und Modellinfo, kein /api/chat.
    expect(fetch.mock.calls.map(c => String(c[0]))).toEqual(['http://127.0.0.1:11434/api/tags', 'http://127.0.0.1:11434/api/show']);
  });
  it('accepts a local model and reports whether thinking must be disabled', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response({ models: [model] })).mockResolvedValueOnce(response({ model_info: {}, details: { format: 'gguf' }, capabilities: ['thinking'] })));
    expect(await assertLocalModel(config.baseUrl, config.model)).toEqual({ digest: model.digest, thinking: true });
  });
  it('does not turn a timeout or malformed result into a cloud fallback', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error('private raw detail')); vi.stubGlobal('fetch', fetch);
    await expect(localRequest(config.baseUrl, '/api/chat', { model: config.model })).rejects.toThrow('kein Cloud-Ersatz');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('refuses non-local addresses before any request', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    await expect(localRequest('https://ollama.com', '/api/chat', {})).rejects.toThrow('kein Cloud-Ersatz');
    expect(fetch).not.toHaveBeenCalled();
  });
});
