import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { listActiveMailAccounts, pickAccountForOrder } from '@/lib/mail/pick-account';

interface RouteParams { params: Promise<{ id: string }> }

// GET /api/orders/[id]/mail-account
// Welches Postfach wuerde eine Mail zu diesem Auftrag verschicken — und welche
// stehen sonst zur Wahl. Damit der Absender vor dem Senden sichtbar ist.
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const order = await prisma.order.findUnique({
      where: { id },
      select: { type: true, customerId: true },
    });
    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const [selected, accounts] = await Promise.all([
      pickAccountForOrder({ orderId: id, orderType: order.type, customerId: order.customerId }),
      listActiveMailAccounts(),
    ]);

    return NextResponse.json({ selected, accounts });
  } catch (error) {
    console.error('Error resolving mail account for order:', error);
    return NextResponse.json({ error: 'Failed to resolve mail account' }, { status: 500 });
  }
}
