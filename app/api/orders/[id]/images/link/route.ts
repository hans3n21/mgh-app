import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { persistAttachment } from '@/lib/mail/attachments';

const Body = z.object({ attachmentIds: z.array(z.string()).min(1) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: orderId } = await params;
    const bodyRaw = await req.json().catch(() => ({}));
    const { attachmentIds } = Body.parse(bodyRaw);

    const attachments = await prisma.attachment.findMany({ where: { id: { in: attachmentIds } } });
    const existing = await prisma.orderImage.findMany({ where: { orderId } });
    const existingPaths = new Set(existing.map((i) => i.path));

    let linked = 0; let skipped = 0; let unavailable = 0;
    for (const att of attachments) {
      const path = `/api/attachments/${att.id}`;
      if (existingPaths.has(path)) { skipped++; continue; }

      if (!att.isPersisted || !att.path) {
        try {
          await persistAttachment(att.id);
        } catch (error) {
          console.warn('[order-images-link] Could not persist mail attachment before linking', {
            attachmentId: att.id,
            error: error instanceof Error ? error.message : String(error),
          });
          unavailable++;
          continue;
        }
        const refreshed = await prisma.attachment.findUnique({
          where: { id: att.id },
          select: { isPersisted: true, path: true },
        });
        if (!refreshed?.isPersisted || !refreshed.path) {
          unavailable++;
          continue;
        }
      }

      await prisma.orderImage.create({ data: { orderId, path, comment: `Mail-Anhang: ${att.filename}`, attach: true, position: 0 } });
      linked++;
    }

    return NextResponse.json({ linked, skipped, unavailable, missing: attachmentIds.length - attachments.length });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: 'Invalid body', details: e.issues }, { status: 400 });
    console.error('images/link error', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
