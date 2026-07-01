import { NextResponse } from 'next/server';
import { getTelephonyConfig } from '@/lib/telephony';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const config = await getTelephonyConfig();
    const fritzReady = !!config.fritzHost && !!config.fritzPassword;
    return NextResponse.json({
      enabled: config.enabled && config.provider === 'fritzbox' && fritzReady,
      provider: config.provider,
    });
  } catch {
    return NextResponse.json({ enabled: false, provider: 'tel' });
  }
}
