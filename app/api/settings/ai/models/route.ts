import { NextResponse } from 'next/server';
import { loadAiConfig } from '@/lib/ai/chat';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const config = await loadAiConfig();
  if (!config) {
    return NextResponse.json({ error: 'Kein API-Key konfiguriert' }, { status: 400 });
  }

  try {
    if (config.provider === 'anthropic') {
      const res = await fetch('https://api.anthropic.com/v1/models', {
        headers: {
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
        },
      });
      if (!res.ok) {
        const err = await res.text().catch(() => '');
        return NextResponse.json({ error: `Anthropic API Fehler ${res.status}: ${err.slice(0, 200)}` }, { status: res.status });
      }
      const data = await res.json();
      // Anthropic gibt { data: [{ id, display_name, ... }] }
      const models: string[] = (data.data ?? [])
        .map((m: { id: string }) => m.id)
        .filter((id: string) => id.startsWith('claude-'));
      return NextResponse.json({ models });
    }

    // OpenAI / Custom: GET /v1/models
    const baseUrl = config.baseUrl.replace(/\/$/, '');
    const res = await fetch(`${baseUrl}/v1/models`, {
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
      },
    });
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      return NextResponse.json({ error: `API Fehler ${res.status}: ${err.slice(0, 200)}` }, { status: res.status });
    }
    const data = await res.json();
    // OpenAI gibt { data: [{ id, ... }] }
    const allModels: string[] = (data.data ?? []).map((m: { id: string }) => m.id);
    // Für OpenAI nur Chat-Modelle zeigen
    const models = config.provider === 'openai'
      ? allModels.filter(id => id.startsWith('gpt-') || id.startsWith('o1') || id.startsWith('o3')).sort()
      : allModels.sort();

    return NextResponse.json({ models });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Unbekannter Fehler' },
      { status: 500 }
    );
  }
}
