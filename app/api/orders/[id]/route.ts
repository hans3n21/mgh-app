import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const updateOrderSchema = z.object({
  status: z.enum(['intake', 'quote', 'in_progress', 'finishing', 'setup', 'awaiting_customer', 'complete', 'design_review']).optional(),
  assigneeId: z.string().nullable().optional(),
  title: z.string().optional(),
  finalAmountCents: z.number().int().nonnegative().nullable().optional(),
  paymentStatus: z.enum(['open','deposit','paid']).optional(),
});

interface RouteParams { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        customer: true,
        assignee: true,
        specs: true,
        items: { include: { priceItem: true } },
        images: true,
        messages: { include: { sender: true } },
      },
    });

    if (!order) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      );
    }

    // Entferne Duplikate in Specs: behalte den "besten" Wert pro Key
    // Strategie: längerer Wert bevorzugt (vollständiger), sonst neuerer (spätere CUID)
    if (order.specs && Array.isArray(order.specs)) {
      const uniqueSpecsMap = new Map<string, typeof order.specs[0]>();
      for (const spec of order.specs) {
        const existing = uniqueSpecsMap.get(spec.key);
        if (!existing) {
          uniqueSpecsMap.set(spec.key, spec);
        } else {
          const existingLength = existing.value.length;
          const currentLength = spec.value.length;
          if (currentLength > existingLength) {
            uniqueSpecsMap.set(spec.key, spec);
          } else if (currentLength === existingLength && spec.id > existing.id) {
            uniqueSpecsMap.set(spec.key, spec);
          }
        }
      }
      order.specs = Array.from(uniqueSpecsMap.values());
    }

    return NextResponse.json(order);
  } catch (error) {
    console.error('Error fetching order:', error);
    return NextResponse.json(
      { error: 'Failed to fetch order' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const body = await request.json();
    const validatedData = updateOrderSchema.parse(body);

    const { id } = await params;
    const order = await prisma.order.update({
      where: { id },
      data: validatedData,
      include: {
        customer: true,
        assignee: true,
        specs: true,
        items: { include: { priceItem: true } },
        images: true,
        messages: { include: { sender: true } },
      },
    });

    // Entferne Duplikate in Specs: behalte den "besten" Wert pro Key
    if (order.specs && Array.isArray(order.specs)) {
      const uniqueSpecsMap = new Map<string, typeof order.specs[0]>();
      for (const spec of order.specs) {
        const existing = uniqueSpecsMap.get(spec.key);
        if (!existing) {
          uniqueSpecsMap.set(spec.key, spec);
        } else {
          const existingLength = existing.value.length;
          const currentLength = spec.value.length;
          if (currentLength > existingLength) {
            uniqueSpecsMap.set(spec.key, spec);
          } else if (currentLength === existingLength && spec.id > existing.id) {
            uniqueSpecsMap.set(spec.key, spec);
          }
        }
      }
      order.specs = Array.from(uniqueSpecsMap.values());
    }

    return NextResponse.json(order);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid data', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Error updating order:', error);
    return NextResponse.json(
      { error: 'Failed to update order' },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Prüfen, ob der Auftrag existiert
    const existing = await prisma.order.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      );
    }

    // Löschen; verknüpfte Entitäten folgen den onDelete-Regeln im Prisma-Schema
    await prisma.order.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error deleting order:', error);
    return NextResponse.json(
      { error: 'Failed to delete order' },
      { status: 500 }
    );
  }
}
