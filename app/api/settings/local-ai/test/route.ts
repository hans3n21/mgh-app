import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { analyzeLocally, LocalAiError } from '@/lib/local-ai/client';
import { readLocalAiConfig } from '@/lib/local-ai/settings';
import { OrderType } from '@/lib/order-presets';

export const runtime = 'nodejs';
export const maxDuration = 150;
const Body = z.object({ text: z.string().min(1).max(6000), orderType: z.enum(OrderType) }).strict();

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 });
  if (!['admin', 'admin_no_feedback'].includes(session.user.role)) return NextResponse.json({ error: 'Nur für Admins' }, { status: 403 });
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: 'Kurzen Testtext und Auftragstyp angeben.' }, { status: 400 });
  try {
    return NextResponse.json(await analyzeLocally(await readLocalAiConfig(), body.data.text, body.data.orderType));
  } catch (error) {
    return NextResponse.json({ error: error instanceof LocalAiError ? error.message : 'Lokale Prüfung fehlgeschlagen.' },
      { status: error instanceof LocalAiError ? error.status : 500 });
  }
}
