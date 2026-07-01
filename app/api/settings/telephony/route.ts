import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { getTelephonyConfig } from '@/lib/telephony';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TELEPHONY_KEYS = [
  'telephony:enabled',
  'telephony:provider',
  'telephony:fritzHost',
  'telephony:fritzUsername',
  'telephony:fritzPassword',
  'telephony:fritzDialPort',
] as const;

function maskSecret(value: string): string {
  if (!value) return '';
  if (value.length <= 3) return '***';
  return `${value.slice(0, 1)}***${value.slice(-1)}`;
}

export async function GET() {
  try {
    const config = await getTelephonyConfig();
    return NextResponse.json({
      enabled: config.enabled,
      provider: config.provider,
      fritzHost: config.fritzHost,
      fritzUsername: config.fritzUsername,
      fritzPassword: config.fritzPassword ? maskSecret(config.fritzPassword) : '',
      fritzPasswordSet: !!config.fritzPassword,
      fritzDialPort: config.fritzDialPort,
    });
  } catch {
    return NextResponse.json({ error: 'Fehler beim Laden der Telefonie-Einstellungen' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 });
    }
    if (session.user.role !== 'admin' && session.user.role !== 'admin_no_feedback') {
      return NextResponse.json({ error: 'Nur Admins koennen Telefonie-Einstellungen aendern' }, { status: 403 });
    }

    const body = await req.json();
    const upserts: Array<{ key: string; value: string }> = [];

    if (body.enabled !== undefined) upserts.push({ key: 'telephony:enabled', value: body.enabled ? '1' : '0' });
    if (body.provider !== undefined) {
      const provider = body.provider === 'fritzbox' ? 'fritzbox' : 'tel';
      upserts.push({ key: 'telephony:provider', value: provider });
    }
    if (body.fritzHost !== undefined) upserts.push({ key: 'telephony:fritzHost', value: String(body.fritzHost) });
    if (body.fritzUsername !== undefined) upserts.push({ key: 'telephony:fritzUsername', value: String(body.fritzUsername) });
    if (body.fritzDialPort !== undefined) upserts.push({ key: 'telephony:fritzDialPort', value: String(body.fritzDialPort) });
    if (body.fritzPassword !== undefined && !String(body.fritzPassword).includes('***')) {
      upserts.push({ key: 'telephony:fritzPassword', value: String(body.fritzPassword) });
    }

    await Promise.all(
      upserts
        .filter(({ key }) => (TELEPHONY_KEYS as readonly string[]).includes(key))
        .map(({ key, value }) =>
          prisma.systemSetting.upsert({
            where: { key },
            update: { value },
            create: { key, value },
          })
        )
    );

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Fehler beim Speichern der Telefonie-Einstellungen' }, { status: 500 });
  }
}
