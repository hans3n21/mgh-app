import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
import { ConfigSchema, installedModels, runOllama } from '../ollama';
import type { ModelConfig, Snapshot } from '../contracts';
const config: ModelConfig = { enabled: true, localOnlyConfirmed: true, baseUrl: 'http://127.0.0.1:11434', model: 'qwen3.5:4b', useExamples: false };
const snapshot: Snapshot = { currentId: 'm1', orderType: 'GUITAR', fields: [{ key: 'fretboard_material', label: 'Griffbrett' }], omitted: 0,
  messages: [{ id: 'm1', date: '', role: 'customer', text: 'Bitte Palisander.' }] };
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
  it('blocks a disguised cloud model before sending any mail text', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response({ models: [model] })).mockResolvedValueOnce(response({ remote_host: 'https://remote.invalid', model_info: {}, details: { format: 'gguf' } })); vi.stubGlobal('fetch', fetch);
    await expect(runOllama(config, config.model, snapshot)).rejects.toThrow('Cloud');
    expect(fetch).toHaveBeenCalledTimes(2); expect(JSON.stringify(fetch.mock.calls)).not.toContain('Bitte Palisander');
  });
  it('uses structured output, disables thinking and unloads the model', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response({ models: [model] })).mockResolvedValueOnce(response({ model_info: {}, details: { format: 'gguf' }, capabilities: ['thinking'] }))
      .mockResolvedValueOnce(response({ done: true, done_reason: 'stop', prompt_eval_count: 700, message: { content: JSON.stringify({ findings: [{ kind: 'order', field: 'fretboard_material', value: 'Palisander', intent: 'confirmed', quote: 'Palisander', evidence: [] }] }) } }));
    vi.stubGlobal('fetch', fetch);
    const result = await runOllama(config, config.model, snapshot);
    expect(result.digest).toBe(model.digest); expect(result.findings).toHaveLength(1);
    const [url, options] = fetch.mock.calls[2]; expect(url).toBe('http://127.0.0.1:11434/api/chat'); expect(options.redirect).toBe('error');
    expect(JSON.parse(options.body)).toMatchObject({ think: false, keep_alive: 0, stream: false, options: { temperature: 0 }, format: { type: 'object' } });
  });
  it('does not turn a timeout or malformed result into a cloud fallback', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error('private raw detail')); vi.stubGlobal('fetch', fetch);
    await expect(runOllama(config, config.model, snapshot)).rejects.toThrow('kein Cloud-Ersatz');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('requires local operation confirmation before accessing the service', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    await expect(runOllama({ ...config, localOnlyConfirmed: false }, config.model, snapshot)).rejects.toThrow('bestätigen');
    expect(fetch).not.toHaveBeenCalled();
  });
});
