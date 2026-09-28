import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { MutationSchema } from '@/lib/mail-training/contracts';
import { getTrainingData, mutateTraining, ReviewError } from '@/lib/mail-training/service';
import { LocalAiError } from '@/lib/local-ai/client';
import { TrainingError } from '@/lib/ai-training/context';

export const runtime = 'nodejs';
export const maxDuration = 210;
type Context = { params: Promise<{ id: string }> };
function failure(error: unknown) {
  if (error instanceof ReviewError || error instanceof LocalAiError || error instanceof TrainingError) return NextResponse.json({ error: error.message }, { status: error.status });
  const code = (error as { code?: string })?.code;
  if (code === 'P2034' || code === 'P2002') return NextResponse.json({ error: 'Gleichzeitige Änderung. Bitte neu laden.' }, { status: 409 });
  if (code === 'P2021') return NextResponse.json({ error: 'Die Datenbankmigration für den Trainingsmodus ist noch nicht installiert.' }, { status: 503 });
  return NextResponse.json({ error: 'Trainingsdaten konnten nicht verarbeitet werden.' }, { status: 500 });
}
export async function GET(_request: NextRequest, { params }: Context) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Nicht eingeloggt.' }, { status: 401 });
  if (!['admin', 'admin_no_feedback'].includes(session.user.role)) return NextResponse.json({ error: 'Trainingsmodus nur für Admins.' }, { status: 403 });
  try { return NextResponse.json(await getTrainingData((await params).id), { headers: { 'Cache-Control': 'no-store' } }); }
  catch (e) { return failure(e); }
}
export async function POST(request: NextRequest, { params }: Context) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Nicht eingeloggt.' }, { status: 401 });
  if (!['admin', 'admin_no_feedback'].includes(session.user.role)) return NextResponse.json({ error: 'Trainingsmodus nur für Admins.' }, { status: 403 });
  const raw = await request.text();
  if (raw.length > 12000) return NextResponse.json({ error: 'Anfrage zu groß.' }, { status: 413 });
  let json;
  try { json = JSON.parse(raw); } catch { return NextResponse.json({ error: 'Ungültige Anfrage.' }, { status: 400 }); }
  const body = MutationSchema.safeParse(json);
  if (!body.success) return NextResponse.json({ error: 'Ungültige Markierung.' }, { status: 400 });
  try { return NextResponse.json(await mutateTraining((await params).id, body.data, session.user.id), { headers: { 'Cache-Control': 'no-store' } }); }
  catch (e) { return failure(e); }
}
