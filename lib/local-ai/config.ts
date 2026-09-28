import { z } from 'zod';

// IP literals avoid DNS rebinding and accidental transmission to a cloud endpoint.
export function localOrigin(value: string): string {
  const url = new URL(value);
  const octets = url.hostname.split('.');
  const numbers = octets.map(Number);
  const privateAddress = octets.length === 4 && octets.every(p => /^\d{1,3}$/.test(p)) &&
    numbers.every(n => n >= 0 && n <= 255) &&
    (numbers[0] === 10 || (numbers[0] === 172 && numbers[1] >= 16 && numbers[1] <= 31) ||
      (numbers[0] === 192 && numbers[1] === 168));
  if (!(privateAddress || url.hostname === '127.0.0.1') || !['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
    url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Bitte eine private IPv4-Adresse ohne Pfad angeben, z. B. http://192.168.1.20:8765.');
  }
  return url.origin;
}

export const ConfigSchema = z.object({
  enabled: z.boolean(),
  baseUrl: z.string().max(200).refine(value => {
    try { localOrigin(value); return true; } catch { return false; }
  }, 'Private IPv4-Adresse erforderlich, z. B. http://192.168.1.20:8765.'),
  apiKey: z.string().min(32).max(200).regex(/^[A-Za-z0-9_-]+$/).optional(),
}).strict();

export type LocalAiConfig = { enabled: boolean; baseUrl: string; apiKey: string };
