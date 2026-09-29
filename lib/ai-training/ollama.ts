// Anbindung an Ollama: Einstellung (KI-Training -> Lokale Modelle), nur lokale
// Adressen und nur lokal installierte GGUF-Modelle, ein Lauf gleichzeitig.
// Genutzt von den Auftragsvorschlaegen (lib/mail-ai/order-suggestions.ts).
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { localOrigin } from '@/lib/mail-ai/local-origin';
import type { ModelConfig } from './contracts';
import { TrainingError } from './context';

export const CONFIG_KEY = 'local-ai:ollama';
export const ConfigSchema = z.object({ enabled: z.boolean(), baseUrl: z.string().max(200).refine(v => {
  try { localOrigin(v); return true; } catch { return false; }
}), model: z.string().max(150), useExamples: z.boolean(), localOnlyConfirmed: z.boolean() }).strict()
  .refine(c => !c.enabled || (c.localOnlyConfirmed && !!c.model), 'Lokalen Betrieb und Modell bestätigen.');
export async function readModelConfig(): Promise<ModelConfig> {
  const row = await prisma.systemSetting.findUnique({ where: { key: CONFIG_KEY } });
  return row ? ConfigSchema.parse(JSON.parse(row.value)) : { enabled: false, baseUrl: 'http://127.0.0.1:11434', model: '', useExamples: false, localOnlyConfirmed: false };
}
export async function localRequest(baseUrl: string, path: string, body?: unknown, timeoutMs = path === '/api/chat' ? 180000 : 10000) {
  try {
    const res = await fetch(`${localOrigin(baseUrl)}${path}`, { method: body ? 'POST' : 'GET', redirect: 'error', cache: 'no-store',
      headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok || !res.body) throw new Error('request');
    const reader = res.body.getReader(); const chunks: Uint8Array[] = []; let length = 0;
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.length; if (length > 2_000_000) { await reader.cancel(); throw new Error('size'); }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch { throw new TrainingError('Lokaler Modelldienst nicht erreichbar, zu langsam oder Antwort ungültig. Es wurde kein Cloud-Ersatz aufgerufen.', 502); }
}
const InstalledSchema = z.object({ models: z.array(z.object({ name: z.string(), digest: z.string(), size: z.number(),
  details: z.object({ format: z.string().optional(), parameter_size: z.string().optional(), quantization_level: z.string().optional() }).optional(),
  remote_host: z.string().optional(), remote_model: z.string().optional(),
})) });
export async function installedModels(baseUrl: string) {
  const parsed = InstalledSchema.safeParse(await localRequest(baseUrl, '/api/tags'));
  if (!parsed.success) throw new TrainingError('Der Dienst liefert keine gültige lokale Modellliste.', 502);
  return parsed.data.models.filter(m => m.size > 1_000_000 && m.details?.format === 'gguf' && !m.remote_host && !m.remote_model && !/cloud/i.test(m.name));
}
/** Nur lokal installierte GGUF-Modelle ohne Cloud-Weiterleitung. Vor jeder Uebertragung von Mailtext pruefen. */
export async function assertLocalModel(baseUrl: string, model: string) {
  const installed = (await installedModels(baseUrl)).find(m => m.name === model);
  if (!installed) throw new TrainingError('Bitte ein installiertes lokales GGUF-Modell wählen.');
  const show = await localRequest(baseUrl, '/api/show', { model });
  if (show.remote_host || show.remote_model || !show.model_info || !show.details || show.details.format !== 'gguf')
    throw new TrainingError('Cloud-Modelle oder nicht überprüfbare Modelle sind gesperrt.');
  return { digest: installed.digest, thinking: !!show.capabilities?.includes('thinking') };
}

// Ein Modelllauf gleichzeitig pro Serverprozess. An globalThis, weil Next diese
// Datei in mehrere Bundles packt (Admin-Route und Hintergrundpruefung).
const ollamaState = globalThis as unknown as { __ollamaBusy?: boolean };
export async function withOllamaLock<T>(fn: () => Promise<T>): Promise<T> {
  if (ollamaState.__ollamaBusy) throw new TrainingError('Ein lokaler Modelllauf läuft bereits. Bitte danach erneut versuchen.', 409);
  ollamaState.__ollamaBusy = true;
  try { return await fn(); } finally { ollamaState.__ollamaBusy = false; }
}
