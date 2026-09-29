import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { loadStats } from '@/lib/mail-ai/learning';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Trefferquote der Vorschlaege je Feld (nur Zahlen, keine Mailinhalte).
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 });
  if (!['admin', 'admin_no_feedback'].includes(session.user.role)) return NextResponse.json({ error: 'Nur für Admins' }, { status: 403 });
  try {
    return NextResponse.json(await loadStats(), { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Auswertung konnte nicht geladen werden.' }, { status: 500 });
  }
}
