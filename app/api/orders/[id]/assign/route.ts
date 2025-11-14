import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const assignOrderSchema = z.object({
  assigneeId: z.string(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { assigneeId } = assignOrderSchema.parse(body);

    // Überprüfe ob der User existiert
    const user = await prisma.user.findUnique({
      where: { id: assigneeId },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Überprüfe ob der Auftrag existiert und noch nicht zugewiesen ist
    const existingOrder = await prisma.order.findUnique({
      where: { id },
    });

    if (!existingOrder) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      );
    }

    if (existingOrder.assigneeId) {
      return NextResponse.json(
        { error: 'Order is already assigned' },
        { status: 400 }
      );
    }

    // Weise den Auftrag zu
    const updatedOrder = await prisma.order.update({
      where: { id },
      data: { assigneeId },
      include: {
        customer: true,
        assignee: true,
      },
    });

    return NextResponse.json(updatedOrder);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid data', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Error assigning order:', error);
    return NextResponse.json(
      { error: 'Failed to assign order' },
      { status: 500 }
    );
  }
}
