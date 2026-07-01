import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { assignMailToOrder } from '@/lib/mail/actions';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { mailId, orderId, customerId } = body;

        if (!mailId) {
            return NextResponse.json({ error: 'Missing mailId' }, { status: 400 });
        }

        let resolvedCustomerId = customerId || null;
        if (orderId) {
            const order = await prisma.order.findUnique({
                where: { id: String(orderId) },
                select: { customerId: true },
            });
            if (!order) {
                return NextResponse.json({ error: 'Order not found' }, { status: 404 });
            }
            resolvedCustomerId = order.customerId;
        }

        const result = await assignMailToOrder(mailId, orderId || null, resolvedCustomerId);

        return NextResponse.json(result);
    } catch (error) {
        console.error('Assign mail error:', error);
        return NextResponse.json({ error: 'Failed to assign mail' }, { status: 500 });
    }
}
