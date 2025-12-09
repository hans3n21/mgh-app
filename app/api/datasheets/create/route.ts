import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { mapToDatasheet } from '@/lib/mail/mapToDatasheet';
import linkMailArtifactsToOrder from '@/lib/mail/linkArtifacts';
import { parseMail } from '@/lib/mail/parseMail';

const bodySchema = z.object({
  mailId: z.string().min(1),
  overrides: z.record(z.string(), z.any()).optional(),
});

async function ensureOrderFromMail(mailId: string) {
  const mail = await prisma.mail.findUnique({ where: { id: mailId } });
  if (!mail) throw new Error('Mail not found');

  if (mail.orderId) {
    const order = await prisma.order.findUnique({ where: { id: mail.orderId } });
    if (!order) throw new Error('Order not found');
    return { order, mail } as const;
  }

  // Create minimal customer if necessary
  let customer = await prisma.customer.findFirst({ where: { email: mail.fromEmail || undefined } });
  if (!customer) {
    customer = await prisma.customer.create({
      data: {
        name: mail.fromName || mail.fromEmail || 'Unbekannt',
        email: mail.fromEmail || undefined,
      },
    });
  }

  // Create order id similar to /api/orders POST
  const lastOrder = await prisma.order.findFirst({ orderBy: { id: 'desc' } });
  let orderNumber = 1;
  if (lastOrder) {
    const match = lastOrder.id.match(/ORD-(\d{4})-(\d{3})/);
    if (match) orderNumber = parseInt(match[2]) + 1;
  }
  const currentYear = new Date().getFullYear();
  const orderId = `ORD-${currentYear}-${orderNumber.toString().padStart(3, '0')}`;

  const createdOrder = await prisma.order.create({
    data: {
      id: orderId,
      title: mail.subject || 'Neuer Auftrag aus Mail',
      type: 'GUITAR',
      customerId: customer.id,
    },
  });

  // link mail to order
  await prisma.mail.update({ where: { id: mail.id }, data: { orderId: createdOrder.id } });

  return { order: createdOrder, mail } as const;
}

export async function POST(req: NextRequest) {
  try {
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


