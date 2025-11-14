import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import linkMailArtifactsToOrder from '@/lib/mail/linkArtifacts';

const schema = z.object({ messageId: z.string().min(1), orderId: z.string().min(1) });

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messageId, orderId } = schema.parse(body);
    const updated = await prisma.mail.update({
      where: { id: messageId },
      data: { orderId },
      include: { attachments: true },
    });
    await linkMailArtifactsToOrder(updated.id, orderId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
    console.error('assign-order error', error);
    return NextResponse.json({ error: 'Failed to assign' }, { status: 500 });
  }
}


