import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AI_KEYS = ['ai:provider', 'ai:apiKey', 'ai:model', 'ai:baseUrl'] as const;

function maskApiKey(key: string): string {
  if (!key || key.length < 8) return '***';
  return `${key.slice(0, 6)}***${key.slice(-4)}`;
}

export async function GET() {
  try {
    const settings = await prisma.systemSetting.findMany({
      where: { key: { in: [...AI_KEYS] } },
    });
    const map = Object.fromEntries(settings.map(s => [s.key, s.value]));
    return NextResponse.json({
      provider: map['ai:provider'] || 'openai',
      apiKey: map['ai:apiKey'] ? maskApiKey(map['ai:apiKey']) : '',
      apiKeySet: !!map['ai:apiKey'],
      model: map['ai:model'] || 'gpt-4o-mini',
      baseUrl: map['ai:baseUrl'] || '',
    });
  } catch (error) {
    return NextResponse.json({ error: 'Fehler beim Laden der KI-Einstellungen' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 });
    }
    if (session.user.role !== 'admin' && session.user.role !== 'admin_no_feedback') {
      return NextResponse.json({ error: 'Nur Admins können KI-Einstellungen ändern' }, { status: 403 });
    }

    const body = await req.json();
    const { provider, apiKey, model, baseUrl } = body;

    const upserts: Array<{ key: string; value: string }> = [];
    if (provider !== undefined) upserts.push({ key: 'ai:provider', value: String(provider) });
    if (model !== undefined) upserts.push({ key: 'ai:model', value: String(model) });
    if (baseUrl !== undefined) upserts.push({ key: 'ai:baseUrl', value: String(baseUrl) });
    // Only update apiKey if a non-masked value was sent
    if (apiKey !== undefined && !apiKey.includes('***')) {
      upserts.push({ key: 'ai:apiKey', value: String(apiKey) });
    }

    await Promise.all(
      upserts.map(({ key, value }) =>
        prisma.systemSetting.upsert({
          where: { key },
          update: { value },
          create: { key, value },
        })
      )
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Fehler beim Speichern der KI-Einstellungen' }, { status: 500 });
  }
}
