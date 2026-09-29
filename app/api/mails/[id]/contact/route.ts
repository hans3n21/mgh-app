import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { confirmContact, contactFromMail } from '@/lib/mail/contact';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };
const headers = { 'Cache-Control': 'no-store' };

const value = z.string().max(200).optional();
const BodySchema = z.object({
  customerId: z.string().min(1).max(100),
  contact: z.object({ phone: value, addressLine1: value, postalCode: value, city: value }).strict(),
}).strict();

// Kontaktdaten aus dem neuen Mailteil, zum Bestaetigen beim Anlegen aus der Mail.
export async function GET(_req: NextRequest, { params }: Context) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Nicht eingeloggt.' }, { status: 401 });
  try { return NextResponse.json({ suggested: await contactFromMail((await params).id) }, { headers }); }
  catch { return NextResponse.json({ error: 'Kontaktdaten konnten nicht gelesen werden.' }, { status: 500 }); }
}

// Bestaetigte bzw. korrigierte Werte: nur leere Kundenfelder werden gefuellt, die Entscheidung kommt in den Verlauf.
export async function POST(req: NextRequest, { params }: Context) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Nicht eingeloggt.' }, { status: 401 });
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Ungültige Angaben.' }, { status: 400 });
  try {
    return NextResponse.json(await confirmContact((await params).id, parsed.data.customerId, parsed.data.contact, session.user.id), { headers });
  } catch (e) {
    if (e instanceof Error && e.message === 'Kunde nicht gefunden.') return NextResponse.json({ error: e.message }, { status: 404 });
    return NextResponse.json({ error: 'Kontaktdaten konnten nicht gespeichert werden.' }, { status: 500 });
  }
}
