import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { BatchSchema, DecisionSchema, decideMany, decideSuggestion, listSuggestions } from '@/lib/mail-ai/decisions';
import { ReviewError } from '@/lib/mail-training/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };
const headers = { 'Cache-Control': 'no-store' };

// Vorschlaege aus der lokalen Mail-Analyse fuer alle angemeldeten Mitarbeitenden.
export async function GET(_req: NextRequest, { params }: Context) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 });
  const started = Date.now();
  try {
    const list = await listSuggestions((await params).id);
    // Messpunkt fuer "Auftragswechsel ist langsam": nur Dauer und Anzahl, keine Inhalte.
    const ms = Date.now() - started;
    if (ms > 1500) console.warn(`[mail-ai] Vorschlagsliste langsam: ${ms} ms (${list.items.length} Vorschläge)`);
    return NextResponse.json(list, { headers });
  } catch (error) {
    console.error('mail-suggestions GET failed:', error instanceof Error ? error.message : 'unbekannt');
    return NextResponse.json({ error: 'Vorschläge konnten nicht geladen werden.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: Context) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 });
  const raw = await req.json().catch(() => null);
  const orderId = (await params).id;
  // Sammel-Entscheidung "Alle Wuensche uebernehmen"
  if (raw?.action === 'accept-all') {
    const batch = BatchSchema.safeParse(raw);
    if (!batch.success) return NextResponse.json({ error: 'Ungültige Auswahl.' }, { status: 400 });
    return NextResponse.json(await decideMany(orderId, batch.data.items, session.user.id), { headers });
  }
  const body = DecisionSchema.safeParse(raw);
  if (!body.success) return NextResponse.json({ error: 'Ungültige Entscheidung.' }, { status: 400 });
  try {
    return NextResponse.json(await decideSuggestion(orderId, body.data, session.user.id), { headers });
  } catch (error) {
    if (error instanceof ReviewError) return NextResponse.json({ error: error.message }, { status: error.status });
    const code = (error as { code?: string })?.code;
    if (code === 'P2034') return NextResponse.json({ error: 'Gleichzeitige Änderung. Bitte neu laden.' }, { status: 409 });
    if (error instanceof Error && /Markierung|Feld|Wert/.test(error.message)) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error('mail-suggestions POST failed:', error instanceof Error ? error.message : 'unbekannt');
    return NextResponse.json({ error: 'Entscheidung konnte nicht gespeichert werden.' }, { status: 500 });
  }
}
