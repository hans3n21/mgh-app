import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { taskId } = await params;
  const body = await request.json();

  const { status } = body as { status: string };

  if (!status || !['open', 'done'].includes(status)) {
    return Response.json(
      { error: 'status must be "open" or "done"' },
      { status: 400 }
    );
  }

  const task = await prisma.orderTask.update({
    where: { id: taskId },
    data: {
      status,
      completedAt: status === 'done' ? new Date() : null,
    },
    include: {
      assignee: { select: { id: true, name: true } },
      creator: { select: { id: true, name: true } },
    },
  });

  return Response.json(task);
}
