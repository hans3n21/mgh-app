import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: orderId } = await params;

  const view = await prisma.orderView.upsert({
    where: { orderId_userId: { orderId, userId: session.user.id } },
    update: { acknowledgedAt: new Date(), lastSeenAt: new Date() },
    create: { orderId, userId: session.user.id, acknowledgedAt: new Date() },
  });

  return Response.json({ ok: true, acknowledgedAt: view.acknowledgedAt });
}
