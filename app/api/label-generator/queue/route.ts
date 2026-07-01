import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';

const QUEUE_KEY = 'label-generator:queue';

const labelSchema = z.object({
  id: z.string().optional(),
  dateStamp: z.string(),
  number: z.number().int().positive(),
  pickupType: z.string(),
  model: z.string(),
  magnet: z.string(),
  spacing: z.string(),
  position: z.string(),
  labelSize: z.enum(['small', 'large']).optional(),
  customTitle: z.string().optional(),
  customInfo: z.string().optional(),
});

const queueSchema = z.object({
  labels: z.array(labelSchema),
});

type QueuePayload = z.infer<typeof queueSchema> & { updatedAt?: string };

function parseQueue(value: string | null | undefined): QueuePayload {
  if (!value) {
    return { labels: [] };
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    const result = queueSchema.safeParse(parsed);
    if (result.success) {
      const updatedAt =
        typeof parsed === 'object' &&
        parsed !== null &&
        'updatedAt' in parsed &&
        typeof (parsed as { updatedAt?: unknown }).updatedAt === 'string'
          ? (parsed as { updatedAt: string }).updatedAt
          : undefined;
      return { ...result.data, updatedAt };
    }
  } catch {
    // ignore invalid stored data
  }

  return { labels: [] };
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
    }

    const entry = await prisma.systemSetting.findUnique({
      where: { key: QUEUE_KEY },
    });
    const queue = parseQueue(entry?.value);

    return NextResponse.json({
      labels: queue.labels,
      updatedAt: queue.updatedAt ?? null,
    });
  } catch (error) {
    console.error('Label-Queue GET Fehler:', error);
    return NextResponse.json({ error: 'Fehler beim Laden der Druckliste' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
    }

    const body = await request.json();
    const data = queueSchema.parse(body);
    const updatedAt = new Date().toISOString();
    const value = JSON.stringify({ ...data, updatedAt });

    await prisma.systemSetting.upsert({
      where: { key: QUEUE_KEY },
      update: { value },
      create: { key: QUEUE_KEY, value },
    });

    return NextResponse.json({ ok: true, updatedAt });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Ungültige Daten', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Label-Queue PUT Fehler:', error);
    return NextResponse.json({ error: 'Fehler beim Speichern der Druckliste' }, { status: 500 });
  }
}
