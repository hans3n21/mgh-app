import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DHL_KEYS = [
  'dhl:environment',
  'dhl:clientId',
  'dhl:clientSecret',
  'dhl:portalUsername',
  'dhl:portalPassword',
  'dhl:receiverId',
] as const;

function maskSecret(value: string): string {
  if (!value) return '';
  if (value.length <= 3) return '***';
  return `${value.slice(0, 1)}***${value.slice(-1)}`;
}

export async function GET() {
  try {
    const rows = await prisma.systemSetting.findMany({ where: { key: { in: DHL_KEYS as unknown as string[] } } });
    const map = new Map(rows.map((r) => [r.key, r.value]));

    const clientSecret = map.get('dhl:clientSecret') || '';
    const portalPassword = map.get('dhl:portalPassword') || '';

    return NextResponse.json({
      environment: map.get('dhl:environment') === 'production' ? 'production' : 'sandbox',
      clientId: map.get('dhl:clientId') || '',
      clientSecret: clientSecret ? maskSecret(clientSecret) : '',
      clientSecretSet: !!clientSecret,
      portalUsername: map.get('dhl:portalUsername') || '',
      portalPassword: portalPassword ? maskSecret(portalPassword) : '',
      portalPasswordSet: !!portalPassword,
      receiverId: map.get('dhl:receiverId') || 'deu',
    });
  } catch {
    return NextResponse.json({ error: 'Fehler beim Laden der DHL-Einstellungen' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 });
    }
    if (session.user.role !== 'admin' && session.user.role !== 'admin_no_feedback') {
      return NextResponse.json({ error: 'Nur Admins koennen DHL-Einstellungen aendern' }, { status: 403 });
    }

    const body = await req.json();
    const upserts: Array<{ key: string; value: string }> = [];

    if (body.environment !== undefined) {
      upserts.push({ key: 'dhl:environment', value: body.environment === 'production' ? 'production' : 'sandbox' });
    }
    if (body.clientId !== undefined) upserts.push({ key: 'dhl:clientId', value: String(body.clientId) });
    if (body.portalUsername !== undefined) upserts.push({ key: 'dhl:portalUsername', value: String(body.portalUsername) });
    if (body.receiverId !== undefined) upserts.push({ key: 'dhl:receiverId', value: String(body.receiverId || 'deu') });
    if (body.clientSecret !== undefined && !String(body.clientSecret).includes('***')) {
      upserts.push({ key: 'dhl:clientSecret', value: String(body.clientSecret) });
    }
    if (body.portalPassword !== undefined && !String(body.portalPassword).includes('***')) {
      upserts.push({ key: 'dhl:portalPassword', value: String(body.portalPassword) });
    }

    await Promise.all(
      upserts
        .filter(({ key }) => (DHL_KEYS as readonly string[]).includes(key))
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
    return NextResponse.json({ error: 'Fehler beim Speichern der DHL-Einstellungen' }, { status: 500 });
  }
}
