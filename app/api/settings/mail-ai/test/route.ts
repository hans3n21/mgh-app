import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { callMailAi, readMailAiConfig, toPiiEntities } from '@/lib/mail-ai/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Erfundener Text: der Test schickt nie echte Mails an den Dienst.
const PROBE = 'Hallo,\nbitte den Korpus aus Erle.\n\nViele Grüße\nAnna Beispiel\nMusterstraße 12, 12345 Musterstadt';

export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 });
  if (!['admin', 'admin_no_feedback'].includes(session.user.role)) return NextResponse.json({ error: 'Nur für Admins' }, { status: 403 });
  const config = await readMailAiConfig(true);
  if (!config.apiKey) return NextResponse.json({ error: 'Bitte zuerst Adresse und Zugriffsschlüssel speichern.' }, { status: 409 });
  try {
    const health = await callMailAi(config, '/health', undefined, 5_000) as { status?: string; fields?: boolean };
    if (health.status !== 'ready') return NextResponse.json({ status: health.status || 'unbekannt', found: [] });
    const started = Date.now();
    const found = toPiiEntities(PROBE, await callMailAi(config, '/pii', { text: PROBE }, 30_000));
    return NextResponse.json({ status: 'ready', fields: !!health.fields, elapsedMs: Date.now() - started,
      found: found.map(e => ({ type: e.type, text: e.text })) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Test fehlgeschlagen.' }, { status: 502 });
  }
}
