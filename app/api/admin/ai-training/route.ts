import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { CONFIG_KEY, ConfigSchema, installedModels, readModelConfig } from '@/lib/ai-training/ollama';
import { TrainingError } from '@/lib/ai-training/context';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store' };
const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('config'), config: ConfigSchema }).strict(),
  z.object({ action: z.literal('models'), baseUrl: z.string().max(200) }).strict(),
]);
async function admin() {
  const session = await auth();
  if (!session?.user) return { response: NextResponse.json({ error: 'Nicht eingeloggt.' }, { status: 401, headers }) };
  if (!['admin', 'admin_no_feedback'].includes(session.user.role)) return { response: NextResponse.json({ error: 'KI-Training nur für Admins.' }, { status: 403, headers }) };
  return { user: session.user };
}
function failure(e: unknown) {
  if (e instanceof TrainingError) return NextResponse.json({ error: e.message }, { status: e.status, headers });
  return NextResponse.json({ error: 'KI-Einstellungen konnten nicht verarbeitet werden.' }, { status: 500, headers });
}
// Einstellung des lokalen Sprachmodells fuer die Auftragsvorschlaege (nur Admins).
export async function GET() {
  const access = await admin(); if (access.response) return access.response;
  try { return NextResponse.json({ config: await readModelConfig() }, { headers }); }
  catch (e) { return failure(e); }
}
export async function POST(req: NextRequest) {
  const access = await admin(); if (access.response) return access.response;
  const raw = await req.text();
  if (raw.length > 12000) return NextResponse.json({ error: 'Anfrage zu groß.' }, { status: 413, headers });
  let value; try { value = JSON.parse(raw); } catch { return NextResponse.json({ error: 'Ungültige Anfrage.' }, { status: 400, headers }); }
  const parsed = schema.safeParse(value);
  if (!parsed.success) return NextResponse.json({ error: 'Angaben prüfen: private IPv4-Adresse, Modell und lokalen Betrieb bestätigen.' }, { status: 400, headers });
  const body = parsed.data;
  try {
    if (body.action === 'models') return NextResponse.json({ models: await installedModels(body.baseUrl) }, { headers });
    if (body.config.enabled && !(await installedModels(body.config.baseUrl)).some(m => m.name === body.config.model)) throw new TrainingError('Gewähltes Modell ist nicht lokal installiert.');
    await prisma.systemSetting.upsert({ where: { key: CONFIG_KEY }, create: { key: CONFIG_KEY, value: JSON.stringify(body.config) }, update: { value: JSON.stringify(body.config) } });
    return NextResponse.json({ ok: true }, { headers });
  } catch (e) { return failure(e); }
}
