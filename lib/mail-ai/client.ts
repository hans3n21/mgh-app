// Anbindung an den lokalen Analysedienst (services/mail-ai). Der Dienst laeuft
// auf demselben Rechner bzw. im LAN; Mailtexte gehen nie an einen Cloud-Dienst.
// Faellt er aus, arbeitet die App mit den Regeln weiter (kein Fehler nach aussen).
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { localOrigin } from '@/lib/local-ai/config';
import { isWorkshopTerm } from '@/lib/mail/workshop-terms';
import type { EntityType, ExtractedEntity } from '@/lib/mail/extraction';

export const MAIL_AI_KEY = 'mail-ai:service';
export const DEFAULT_BASE_URL = 'http://127.0.0.1:8766';
const MAX_TEXT = 60_000;

export type MailAiConfig = { enabled: boolean; baseUrl: string; apiKey: string };

export const ConfigSchema = z.object({
  enabled: z.boolean(),
  baseUrl: z.string().max(200).refine(value => {
    try { localOrigin(value); return true; } catch { return false; }
  }, 'Lokale oder private IPv4-Adresse erforderlich, z. B. http://127.0.0.1:8766.'),
  apiKey: z.string().min(32).max(200).regex(/^[A-Za-z0-9_-]+$/).optional(),
}).strict();

const globalCache = globalThis as unknown as { __mailAiConfig?: { at: number; config: MailAiConfig } };

export async function readMailAiConfig(fresh = false): Promise<MailAiConfig> {
  const cached = globalCache.__mailAiConfig;
  if (!fresh && cached && Date.now() - cached.at < 30_000) return cached.config;
  const row = await prisma.systemSetting.findUnique({ where: { key: MAIL_AI_KEY } });
  const stored = row ? (JSON.parse(row.value) as Partial<MailAiConfig>) : {};
  const config: MailAiConfig = { enabled: !!stored.enabled, baseUrl: stored.baseUrl || DEFAULT_BASE_URL, apiKey: stored.apiKey || '' };
  globalCache.__mailAiConfig = { at: Date.now(), config };
  return config;
}

export function clearMailAiConfigCache() {
  globalCache.__mailAiConfig = undefined;
}

export class MailAiError extends Error {}

export async function callMailAi(config: MailAiConfig, path: '/health' | '/pii' | '/fields', body: unknown, timeoutMs: number): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${localOrigin(config.baseUrl)}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new MailAiError('Lokaler Analysedienst nicht erreichbar.');
  }
  const raw = await response.text();
  if (raw.length > 2_000_000) throw new MailAiError('Antwort des Analysedienstes zu gross.');
  if (!response.ok) throw new MailAiError(response.status === 401 ? 'Zugriffsschlüssel passt nicht zum Analysedienst.' : `Analysedienst meldet ${response.status}.`);
  try { return JSON.parse(raw); } catch { throw new MailAiError('Ungültige Antwort des Analysedienstes.'); }
}

const PiiResponse = z.object({ entities: z.array(z.object({
  type: z.enum(['name', 'address', 'postalCode', 'email', 'phone', 'iban', 'customerNumber']),
  text: z.string().min(1).max(500), start: z.number().int().nonnegative(), end: z.number().int().positive(),
  confidence: z.number().min(0).max(1),
})).max(2000) });

// Modellfunde unterhalb dieser Sicherheit verwerfen. Adressen hoeher: das Modell
// haelt sonst Werkstattangaben wie "22 Edelstahlbünde" fuer eine Anschrift.
const MIN_CONFIDENCE: Record<string, number> = { name: 0.5, address: 0.9, postalCode: 0.9, email: 0.5, phone: 0.8, iban: 0.8, customerNumber: 0.85 };

/** Antwort des Dienstes pruefen und in Entities der App umwandeln (Quelle "ml"). */
export function toPiiEntities(text: string, raw: unknown): ExtractedEntity[] {
  const parsed = PiiResponse.parse(raw);
  return parsed.entities.filter(e => {
    if (e.end <= e.start || text.slice(e.start, e.end) !== e.text) return false; // Dienst ist nicht vertrauenswuerdig
    if (e.confidence < (MIN_CONFIDENCE[e.type] ?? 0.8)) return false;
    if ((e.type === 'address' || e.type === 'postalCode') && e.text.split(/[\s,]+/).some(isWorkshopTerm)) return false;
    return true;
  }).map(e => ({ type: e.type as EntityType, text: e.text, start: e.start, end: e.end,
    confidence: e.confidence, source: 'ml' as const, pii: true }));
}

/** Wirft bei Ausfall; fuer die Hintergrundpruefung, die spaeter erneut versuchen soll. */
export async function detectPiiStrict(text: string, timeoutMs: number): Promise<ExtractedEntity[]> {
  const config = await readMailAiConfig();
  if (!config.enabled || !config.apiKey) throw new MailAiError('Analysedienst ist nicht aktiviert.');
  const input = text.slice(0, MAX_TEXT);
  return toPiiEntities(input, await callMailAi(config, '/pii', { text: input }, timeoutMs));
}

/** Nie werfend: Ohne Dienst bleibt es bei der Regelerkennung. */
export async function detectPii(text: string, timeoutMs = 20_000): Promise<ExtractedEntity[]> {
  if (!text.trim()) return [];
  try {
    const config = await readMailAiConfig();
    if (!config.enabled || !config.apiKey) return [];
    return await detectPiiStrict(text, timeoutMs);
  } catch (error) {
    // Keine Mailinhalte protokollieren.
    console.warn(`[mail-ai] Modellerkennung übersprungen: ${error instanceof Error ? error.message : 'unbekannt'}`);
    return [];
  }
}
