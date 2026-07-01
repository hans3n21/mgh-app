import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';

const CONFIG_KEY = 'label-generator:config';

const optionsSchema = z.object({
  pickupTypes: z.array(z.string()),
  models: z.array(z.string()),
  magnets: z.array(z.string()),
  spacings: z.array(z.string()),
});

const windingItemSchema = z.object({
  name: z.string(),
  category: z.string().optional(),
  magnet: z.string().optional(),
  wire: z.string().optional(),
  coil1: z.string().optional(),
  coil2: z.string().optional(),
  coil3: z.string().optional(),
  coil4: z.string().optional(),
  note: z.string().optional(),
});

const removedOptionsSchema = z.object({
  pickupTypes: z.array(z.string()).optional(),
  models: z.array(z.string()).optional(),
  magnets: z.array(z.string()).optional(),
  spacings: z.array(z.string()).optional(),
});

const configSchema = z.object({
  options: optionsSchema.optional(),
  windingData: z.array(windingItemSchema).optional(),
  removedOptions: removedOptionsSchema.optional(),
});

type ConfigPayload = z.infer<typeof configSchema> & { updatedAt?: string };

function parseConfig(value: string | null | undefined): ConfigPayload {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    const result = configSchema.safeParse(parsed);
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

  return {};
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
    }

    const entry = await prisma.systemSetting.findUnique({
      where: { key: CONFIG_KEY },
    });
    const config = parseConfig(entry?.value);

    return NextResponse.json({
      options: config.options ?? null,
      windingData: config.windingData ?? null,
      removedOptions: config.removedOptions ?? null,
      updatedAt: config.updatedAt ?? null,
    });
  } catch (error) {
    console.error('Label-Config GET Fehler:', error);
    return NextResponse.json({ error: 'Fehler beim Laden der Einstellungen' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
    }

    const body = await request.json();
    const data = configSchema.parse(body);
    const updatedAt = new Date().toISOString();
    const value = JSON.stringify({ ...data, updatedAt });

    await prisma.systemSetting.upsert({
      where: { key: CONFIG_KEY },
      update: { value },
      create: { key: CONFIG_KEY, value },
    });

    return NextResponse.json({ ok: true, updatedAt });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Ungültige Daten', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Label-Config PUT Fehler:', error);
    return NextResponse.json({ error: 'Fehler beim Speichern der Einstellungen' }, { status: 500 });
  }
}
