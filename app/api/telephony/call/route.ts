import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getTelephonyConfig, triggerFritzCall } from '@/lib/telephony';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 });
    }

    const body = await req.json();
    const phone = String(body?.phone || '').trim();
    if (!phone) {
      return NextResponse.json({ error: 'Telefonnummer fehlt' }, { status: 400 });
    }

    const config = await getTelephonyConfig();
    const fritzReady = !!config.fritzHost && !!config.fritzPassword;
    if (!(config.enabled && config.provider === 'fritzbox' && fritzReady)) {
      return NextResponse.json({ error: 'FritzBox-Telefonie ist deaktiviert' }, { status: 400 });
    }

    await triggerFritzCall(phone, config);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Anruf konnte nicht gestartet werden' }, { status: 500 });
  }
}
