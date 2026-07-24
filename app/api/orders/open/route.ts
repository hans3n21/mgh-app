import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';

export async function GET() {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Hole alle Aufträge ohne Assignee (offene Aufträge)
    const openOrders = await prisma.order.findMany({
      where: {
        assigneeId: null,
        status: {
          not: 'complete', // Abgeschlossene Aufträge ausschließen
        },
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
          },
        },
        assignee: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json(openOrders);
  } catch (error) {
    console.error('Error fetching open orders:', error);
    return NextResponse.json(
      { error: 'Failed to fetch open orders' },
      { status: 500 }
    );
  }
}
