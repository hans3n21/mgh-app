import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { CONFIG_KEY, ConfigSchema, installedModels, readModelConfig } from '@/lib/ai-training/ollama';
import { compareCase, createCase, exportTraining, listCases } from '@/lib/ai-training/service';
import { TrainingError } from '@/lib/ai-training/context';

export const runtime = 'nodejs';
export const maxDuration = 210;
const headers = { 'Cache-Control': 'no-store' };
const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('config'), config: ConfigSchema }).strict(),
  z.object({ action: z.literal('models'), baseUrl: z.string().max(200) }).strict(),
  z.object({ action: z.literal('create'), mailId: z.string().min(1), title: z.string().trim().min(1).max(100), partition: z.enum(['train', 'test']),
    revision: z.number().int().nonnegative(), sourceHash: z.string().length(64), complete: z.literal(true) }).strict(),
  z.object({ action: z.literal('compare'), caseId: z.string().min(1), model: z.string().min(1).max(150), useExamples: z.boolean() }).strict(),
  z.object({ action: z.literal('delete'), caseId: z.string().min(1) }).strict(),
  z.object({ action: z.literal('export') }).strict(),
]);
async function admin() {
  const session = await auth();
  if (!session?.user) return { response: NextResponse.json({ error: 'Nicht eingeloggt.' }, { status: 401, headers }) };
  if (!['admin', 'admin_no_feedback'].includes(session.user.role)) return { response: NextResponse.json({ error: 'KI-Training nur für Admins.' }, { status: 403, headers }) };
  return { user: session.user };
}
function failure(e: unknown) {
  if (e instanceof TrainingError) return NextResponse.json({ error: e.message }, { status: e.status, headers });
  const code = (e as { code?: string })?.code;
  const error = code === 'P2021' ? 'Datenbankmigration für den Adminbereich fehlt.' : ['P2034', 'P2002', 'P2025'].includes(code || '') ? 'Stand wurde gleichzeitig geändert. Bitte neu laden.' : 'KI-Training konnte nicht verarbeitet werden.';
  return NextResponse.json({ error }, { status: code === 'P2021' ? 503 : 409, headers });
}
export async function GET() {
  const access = await admin(); if (access.response) return access.response;
  try { return NextResponse.json({ config: await readModelConfig(), cases: await listCases() }, { headers }); }
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
    if (body.action === 'config') {
      if (body.config.enabled && !(await installedModels(body.config.baseUrl)).some(m => m.name === body.config.model)) throw new TrainingError('Gewähltes Modell ist nicht lokal installiert.');
      await prisma.systemSetting.upsert({ where: { key: CONFIG_KEY }, create: { key: CONFIG_KEY, value: JSON.stringify(body.config) }, update: { value: JSON.stringify(body.config) } });
      return NextResponse.json({ ok: true }, { headers });
    }
    if (body.action === 'create') return NextResponse.json(await createCase(body, access.user!.id), { status: 201, headers });
    if (body.action === 'compare') return NextResponse.json(await compareCase(body.caseId, body.model, body.useExamples), { headers });
    if (body.action === 'delete') {
      await prisma.aiTrainingCase.delete({ where: { id: body.caseId } });
      return NextResponse.json({ ok: true }, { headers });
    }
    return new NextResponse(await exportTraining(), { headers: { ...headers, 'Content-Type': 'application/x-ndjson', 'Content-Disposition': 'attachment; filename="mgh-training-local.jsonl"' } });
  } catch (e) { return failure(e); }
}
