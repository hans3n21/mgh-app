import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ConfigSchema, localOrigin } from '@/lib/local-ai/config';
import { CONFIG_KEY, readLocalAiConfig } from '@/lib/local-ai/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 });
  const isAdmin = ['admin', 'admin_no_feedback'].includes(session.user.role);
  try {
    const config = await readLocalAiConfig();
    return NextResponse.json(isAdmin ? { enabled: config.enabled, baseUrl: config.baseUrl, apiKeySet: !!config.apiKey, isAdmin }
      : { enabled: config.enabled, isAdmin });
  } catch { return NextResponse.json({ error: 'Einstellungen konnten nicht geladen werden.' }, { status: 500 }); }
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 });
  if (!['admin', 'admin_no_feedback'].includes(session.user.role)) return NextResponse.json({ error: 'Nur für Admins' }, { status: 403 });
  const body = ConfigSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: 'Lokale Dienstadresse und einen Schlüssel mit mindestens 32 Zeichen (Buchstaben, Ziffern, _ oder -) angeben.' }, { status: 400 });
  try {
    const previous = await readLocalAiConfig();
    const config = { ...body.data, baseUrl: localOrigin(body.data.baseUrl), apiKey: body.data.apiKey || previous.apiKey };
    if (config.enabled && !config.apiKey) return NextResponse.json({ error: 'Zugriffsschlüssel fehlt.' }, { status: 400 });
    const value = JSON.stringify(config);
    await prisma.systemSetting.upsert({ where: { key: CONFIG_KEY }, create: { key: CONFIG_KEY, value }, update: { value } });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: 'Einstellungen konnten nicht gespeichert werden.' }, { status: 500 }); }
}
