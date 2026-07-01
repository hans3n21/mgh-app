import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: orderId } = await params;

  const tasks = await prisma.orderTask.findMany({
    where: { orderId },
    include: {
      assignee: { select: { id: true, name: true } },
      creator: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  return Response.json(tasks);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: orderId } = await params;
  const body = await request.json();

  const { title, note, assigneeId } = body as {
    title: string;
    note?: string;
    assigneeId: string;
  };

  if (!title || !assigneeId) {
    return Response.json(
      { error: 'title and assigneeId are required' },
      { status: 400 }
    );
  }

  const task = await prisma.orderTask.create({
    data: {
      orderId,
      creatorId: session.user.id,
      assigneeId,
      title,
      note: note || null,
    },
    include: {
      assignee: { select: { id: true, name: true } },
      creator: { select: { id: true, name: true } },
    },
  });

  return Response.json(task, { status: 201 });
}
