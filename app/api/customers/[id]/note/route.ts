import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';

interface RouteParams {
  params: Promise<{ id: string }>;
}

function noteKey(customerId: string): string {
  return `customer:note:${customerId}`;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { id } = await params;
    const entry = await prisma.systemSetting.findUnique({
      where: { key: noteKey(id) },
    });
    return NextResponse.json({ note: entry?.value || '' });
  } catch {
    return NextResponse.json({ error: 'Fehler beim Laden der Notiz' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { id } = await params;
    const body = await req.json();
    const note = String(body?.note || '');
    await prisma.systemSetting.upsert({
      where: { key: noteKey(id) },
      update: { value: note },
      create: { key: noteKey(id), value: note },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Fehler beim Speichern der Notiz' }, { status: 500 });
  }
}
