import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { extractAndStore, getPlaintext, type ExtractedEntity } from '@/lib/mail/extraction';

interface RouteParams { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const mail = await prisma.mail.findUnique({
      where: { id },
      select: { id: true, text: true, html: true, extraction: true },
    });

    if (!mail) {
      return NextResponse.json({ error: 'Mail not found' }, { status: 404 });
    }

    if (mail.extraction) {
      const raw = mail.extraction.entities as unknown as ExtractedEntity[];
      const needsReExtract = raw.length > 0 && raw[0].pii === undefined;

      if (!needsReExtract) {
        const plaintext = getPlaintext(mail.text, mail.html);
        return NextResponse.json({
          mailId: id,
          entities: raw,
          plaintext,
          createdAt: mail.extraction.createdAt,
        });
      }
    }

    const entities = await extractAndStore(mail.id, mail.text, mail.html);
    const plaintext = getPlaintext(mail.text, mail.html);

    return NextResponse.json({
      mailId: id,
      entities,
      plaintext,
      createdAt: new Date(),
    });
  } catch (error) {
    console.error('Error fetching extraction:', error);
    return NextResponse.json({ error: 'Failed to fetch extraction' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    const mail = await prisma.mail.findUnique({
      where: { id },
      select: { id: true, extraction: true },
    });

    if (!mail) {
      return NextResponse.json({ error: 'Mail not found' }, { status: 404 });
    }

    const existing = (mail.extraction?.entities as unknown as ExtractedEntity[]) || [];

    if (body.add) {
      const PII_TYPES = new Set(['email', 'phone', 'iban', 'address', 'postalCode', 'name', 'customerNumber']);
      const newEntity: ExtractedEntity = {
        type: body.add.type,
        text: body.add.text,
        start: body.add.start ?? 0,
        end: body.add.end ?? body.add.text.length,
        confidence: 1.0,
        source: 'manual',
        pii: PII_TYPES.has(body.add.type),
      };
      existing.push(newEntity);
    }

    if (body.remove !== undefined) {
      const idx = typeof body.remove === 'number' ? body.remove : -1;
      if (idx >= 0 && idx < existing.length) {
        existing.splice(idx, 1);
      }
    }

    const updated = await prisma.mailExtraction.upsert({
      where: { mailId: id },
      create: { mailId: id, entities: existing as unknown as import('@prisma/client').Prisma.InputJsonValue },
      update: { entities: existing as unknown as import('@prisma/client').Prisma.InputJsonValue },
    });

    return NextResponse.json({
      mailId: id,
      entities: updated.entities,
    });
  } catch (error) {
    console.error('Error updating extraction:', error);
    return NextResponse.json({ error: 'Failed to update extraction' }, { status: 500 });
  }
}
