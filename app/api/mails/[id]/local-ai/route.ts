import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { analyzeLocally, LocalAiError } from '@/lib/local-ai/client';
import { readLocalAiConfig } from '@/lib/local-ai/settings';
import { prepareCandidates } from '@/lib/local-ai/candidates';
import { z } from 'zod';

export const runtime = 'nodejs';
export const maxDuration = 150;

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 });
  try {
    const { id } = await params;
    const mail = await prisma.mail.findUnique({ where: { id }, select: {
      id: true, text: true, isDeleted: true, orderId: true, order: { select: { type: true, specs: { select: { key: true, value: true } } } },
    } });
    if (!mail || mail.isDeleted) return NextResponse.json({ error: 'Mail nicht gefunden.' }, { status: 404 });
    if (!mail.order || !mail.orderId) return NextResponse.json({ error: 'Bitte die Mail zuerst einem Auftrag zuordnen.' }, { status: 409 });
    if (!mail.text?.trim()) return NextResponse.json({ error: 'Der Pilot benötigt eine Mail mit Klartextinhalt.' }, { status: 422 });
    const analysis = await analyzeLocally(await readLocalAiConfig(), mail.text, mail.order.type);
    const current = Object.fromEntries(mail.order.specs.map(s => [s.key, s.value]));
    return NextResponse.json({ ...analysis, orderId: mail.orderId, mailId: mail.id,
      findings: analysis.findings.map(f => ({ ...f, currentValue: current[f.field] || '' })) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof LocalAiError ? error.message : 'Lokale Prüfung fehlgeschlagen.' },
      { status: error instanceof LocalAiError ? error.status : 500 });
  }
}

const SaveBody = z.object({ orderId: z.string().min(1).max(100), field: z.string().max(100), value: z.string().max(200) }).strict();

// A separate human action only creates a pending suggestion. It never changes a spec.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 });
  const body = SaveBody.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: 'Ungültiger Vorschlag.' }, { status: 400 });
  try {
    if (!(await readLocalAiConfig()).enabled) return NextResponse.json({ error: 'Lokale Prüfung ausgeschaltet.' }, { status: 409 });
    const { id } = await params;
    const mail = await prisma.mail.findUnique({ where: { id }, select: {
      id: true, text: true, isDeleted: true, orderId: true, order: { select: { type: true } },
    } });
    if (!mail || mail.isDeleted) return NextResponse.json({ error: 'Mail nicht gefunden.' }, { status: 404 });
    if (!mail.order || mail.orderId !== body.data.orderId) return NextResponse.json({ error: 'Die Mailzuordnung hat sich geändert. Bitte neu prüfen.' }, { status: 409 });
    let candidates;
    try { candidates = prepareCandidates(mail.text || '', mail.order.type).candidates; }
    catch { return NextResponse.json({ error: 'Die Mail hat sich geändert. Bitte neu prüfen.' }, { status: 409 }); }
    if (!candidates.some(c => c.field === body.data.field && c.value === body.data.value)) {
      return NextResponse.json({ error: 'Diese Angabe wurde in der Mail nicht gefunden.' }, { status: 400 });
    }
    const field = `order.${body.data.field}`;
    const existing = await prisma.orderFieldSuggestion.findFirst({ where: { orderId: body.data.orderId, field, value: body.data.value, mailId: mail.id } });
    if (existing) return NextResponse.json({ ok: true, alreadyProcessed: existing.status !== 'suggested' });
    await prisma.orderFieldSuggestion.create({ data: { orderId: body.data.orderId, field, value: body.data.value, mailId: mail.id, status: 'suggested' } });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch { return NextResponse.json({ error: 'Vorschlag konnte nicht gespeichert werden.' }, { status: 500 }); }
}
