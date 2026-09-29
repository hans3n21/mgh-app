import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { localOrigin } from '@/lib/mail-ai/local-origin';
import { ConfigSchema, MAIL_AI_KEY, clearMailAiConfigCache, localKeyFor, readMailAiConfig, readStoredMailAiConfig } from '@/lib/mail-ai/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const isAdmin = (role?: string) => ['admin', 'admin_no_feedback'].includes(role || '');

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 });
  try {
    const config = await readMailAiConfig(true);
    // Der Schluessel verlaesst den Server nie.
    return NextResponse.json(isAdmin(session.user.role)
      ? { enabled: config.enabled, baseUrl: config.baseUrl, apiKeySet: !!config.apiKey, apiKeySource: config.apiKeySource, isAdmin: true }
      : { enabled: config.enabled, isAdmin: false });
  } catch {
    return NextResponse.json({ error: 'Einstellungen konnten nicht geladen werden.' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 });
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: 'Nur für Admins' }, { status: 403 });
  const body = ConfigSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: 'Lokale Dienstadresse und einen Schlüssel mit mindestens 32 Zeichen angeben.' }, { status: 400 });
  try {
    // Nur den gespeicherten Schluessel uebernehmen, nie den aus der lokalen Datei.
    const previous = await readStoredMailAiConfig();
    const config = { enabled: body.data.enabled, baseUrl: localOrigin(body.data.baseUrl), apiKey: body.data.apiKey || previous.apiKey };
    if (config.enabled && !config.apiKey && !localKeyFor(config.baseUrl))
      return NextResponse.json({ error: 'Zugriffsschlüssel fehlt (keine lokale Schlüsseldatei des Dienstes gefunden).' }, { status: 400 });
    const value = JSON.stringify(config);
    await prisma.systemSetting.upsert({ where: { key: MAIL_AI_KEY }, create: { key: MAIL_AI_KEY, value }, update: { value } });
    clearMailAiConfigCache();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Einstellungen konnten nicht gespeichert werden.' }, { status: 500 });
  }
}
