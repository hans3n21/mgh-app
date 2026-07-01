import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { mapToDatasheet } from '@/lib/mail/mapToDatasheet';
import linkMailArtifactsToOrder from '@/lib/mail/linkArtifacts';
import { parseMail } from '@/lib/mail/parseMail';
import { auth } from '@/lib/auth';
import ensureOrderFromMail from '@/lib/mail/ensureOrderFromMail';

const bodySchema = z.object({
  mailId: z.string().min(1),
  overrides: z.record(z.string(), z.any()).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const json = await req.json();
    const { mailId, overrides } = bodySchema.parse(json);

    const { order, mail } = await ensureOrderFromMail(mailId);

    // Compute parsedData dynamically from mail content
    const parsedBase = parseMail(mail.text || '', mail.html || '');
    const merged = { ...parsedBase, ...(overrides || {}) };
    const normalized = mapToDatasheet(merged);
    if (!normalized) return NextResponse.json({ error: 'Mapping fehlgeschlagen' }, { status: 400 });

    // Bestimme nächste Version je Auftrag+Typ
    const datasheet = await prisma.datasheet.create({
      data: {
        orderId: order.id,
        type: normalized.type,
        fields: normalized.fields as any,
      },
    });

    // Link attachments + message into order (idempotent)
    await linkMailArtifactsToOrder(mail.id, order.id);

    return NextResponse.json({
      ok: true,
      orderId: order.id,
      datasheetId: datasheet.id,
      updatedAt: datasheet.updatedAt,
      createdAt: datasheet.createdAt,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid body', details: error.issues }, { status: 400 });
    }
    console.error('Datasheet create failed', error);
    return NextResponse.json({ error: 'Failed to create datasheet' }, { status: 500 });
  }
}
