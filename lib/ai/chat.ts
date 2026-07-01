import { prisma } from '@/lib/prisma';

export interface AiConfig {
  provider: string;  // 'openai' | 'anthropic' | 'custom'
  apiKey: string;
  model: string;
  baseUrl: string;
}

export interface AiOptions {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
}

export type AiResult =
  | { configured: true; text: string }
  | { configured: false; reason: string };

const DEFAULT_BASE_URLS: Record<string, string> = {
  openai: 'https://api.openai.com',
  anthropic: 'https://api.anthropic.com',
  custom: '',
};

/**
 * Loads the AI configuration from SystemSetting.
 * Returns null if no API key is configured.
 */
export async function loadAiConfig(): Promise<AiConfig | null> {
  try {
    const keys = ['ai:provider', 'ai:apiKey', 'ai:model', 'ai:baseUrl'];
    const settings = await prisma.systemSetting.findMany({
      where: { key: { in: keys } },
    });

    const map = Object.fromEntries(settings.map(s => [s.key, s.value]));
    const apiKey = map['ai:apiKey'];
    if (!apiKey) return null;

    const provider = map['ai:provider'] || 'openai';
    const model = map['ai:model'] || 'gpt-4o-mini';
    const baseUrl = map['ai:baseUrl'] || DEFAULT_BASE_URLS[provider] || 'https://api.openai.com';

    return { provider, apiKey, model, baseUrl };
  } catch {
    return null;
  }
}

/**
 * Calls the configured AI (OpenAI-compatible) with anonymized text.
 * Falls back gracefully if not configured.
 */
export async function callAI(options: AiOptions): Promise<AiResult> {
  const config = await loadAiConfig();

  if (!config) {
    return { configured: false, reason: 'Kein KI-API-Key konfiguriert. Bitte in Einstellungen → KI-Integration hinterlegen.' };
  }

  const baseUrl = config.baseUrl.replace(/\/$/, '');

  // Anthropic nutzt ein eigenes API-Format
  if (config.provider === 'anthropic') {
    const url = `${baseUrl}/v1/messages`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: 2000,
        system: options.systemPrompt || undefined,
        messages: [{ role: 'user', content: options.userPrompt }],
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(`Anthropic API Fehler ${response.status}: ${errorBody.slice(0, 200)}`);
    }

    const data = await response.json();
    const text = data.content?.[0]?.text;
    if (!text) throw new Error('Anthropic API hat keine Antwort zurückgegeben');
    return { configured: true, text: text.trim() };
  }

  // OpenAI-kompatibles Format (OpenAI, Custom)
  const url = `${baseUrl}/v1/chat/completions`;
  const messages: Array<{ role: string; content: string }> = [];
  if (options.systemPrompt) {
    messages.push({ role: 'system', content: options.systemPrompt });
  }
  messages.push({ role: 'user', content: options.userPrompt });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: options.temperature ?? 0.3,
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`KI-API Fehler ${response.status}: ${errorBody.slice(0, 200)}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;

  if (!text) {
    throw new Error('KI-API hat keine Antwort zurückgegeben');
  }

  return { configured: true, text: text.trim() };
}
