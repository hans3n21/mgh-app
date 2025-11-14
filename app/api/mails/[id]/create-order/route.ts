import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import ensureOrderFromMail from '@/lib/mail/ensureOrderFromMail';
import linkMailArtifactsToOrder from '@/lib/mail/linkArtifacts';

const BodySchema = z.object({
  orderType: z.enum(['GUITAR','BODY','NECK','REPAIR','PICKGUARD','PICKUPS','ENGRAVING','FINISH_ONLY']),
  spec: z.record(z.string(), z.any()).optional(),
  customer: z.record(z.string(), z.any()).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: mailId } = await params;
    const mail = await prisma.mail.findUnique({ where: { id: mailId } });
    if (!mail) return NextResponse.json({ error: 'Mail not found' }, { status: 404 });

    const bodyRaw = await req.json().catch(() => ({}));
    const body = BodySchema.parse(bodyRaw);

    const { order } = await ensureOrderFromMail(mailId);
    
    // Update order type if provided
    if (body.orderType) {
      await prisma.order.update({
        where: { id: order.id },
        data: { type: body.orderType },
      });
    }

    // Speichere Spec KV, falls vorhanden
    if (body.spec && typeof body.spec === 'object') {
      const entries = Object.entries(body.spec).filter(([k, v]) => typeof k === 'string' && typeof (v as any) === 'string');
      if (entries.length > 0) {
        // upsert je Key
        await Promise.all(entries.map(async ([key, value]) => {
          const existing = await prisma.orderSpecKV.findFirst({ where: { orderId: order.id, key } });
          if (existing) {
            await prisma.orderSpecKV.update({ where: { id: existing.id }, data: { value: String(value) } });
          } else {
            await prisma.orderSpecKV.create({ data: { orderId: order.id, key, value: String(value) } });
          }
        }));
      }
    }

    // Artefakte verlinken (idempotent)
    await linkMailArtifactsToOrder(mailId, order.id);

    return NextResponse.json({ orderId: order.id });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid body', details: err.issues }, { status: 400 });
    }
    console.error('create-order error', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}


