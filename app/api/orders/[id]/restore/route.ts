import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';

interface RouteParams { params: Promise<{ id: string }> }

// Auftrag aus dem Papierkorb zurueckholen: deletedAt wieder auf null.
export async function POST(_request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const existing = await prisma.order.findUnique({
      where: { id },
      select: { id: true, deletedAt: true },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (!existing.deletedAt) {
      return NextResponse.json({ ok: true, alreadyActive: true });
    }

    const order = await prisma.order.update({
      where: { id },
      data: { deletedAt: null },
      include: { customer: true, assignee: true },
    });

    return NextResponse.json(order);
  } catch (error) {
    console.error('Error restoring order:', error);
    return NextResponse.json({ error: 'Failed to restore order' }, { status: 500 });
  }
}
