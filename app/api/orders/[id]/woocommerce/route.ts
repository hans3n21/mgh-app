import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createWooOrderForInternal } from '@/lib/woocommerce';
import { z } from 'zod';

const BodySchema = z.object({ mode: z.enum(['full','deposit','balance']).optional(), amountCents: z.number().int().positive().optional(), customLabel: z.string().optional() });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

    let body: any = {};
    try { body = await req.json(); } catch {}
    const parsed = BodySchema.safeParse(body);
    const opts = parsed.success ? { mode: parsed.data.mode, amountCents: parsed.data.amountCents, customLabel: parsed.data.customLabel } : {};

    const { wooOrderId } = await createWooOrderForInternal(id, opts);
    const updated = await prisma.order.update({
      where: { id },
      data: {
        wcOrderId: wooOrderId,
        // setze paymentStatus heuristisch anhand mode
        paymentStatus: opts.mode === 'deposit' ? 'deposit' : (opts.mode === 'balance' ? 'paid' : undefined),
        finalAmountCents: opts.amountCents ?? undefined,
      },
      include: {
        customer: true,
        assignee: true,
        specs: true,
        items: { include: { priceItem: true } },
        images: true,
        messages: { include: { sender: true } },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Woo sync error:', error);
    const details = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: 'Woo sync failed', details }, { status: 500 });
  }
}


