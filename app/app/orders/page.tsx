import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import OrderList from '@/components/OrderList';

export default async function OrdersPage() {
  const [orders, session] = await Promise.all([
    prisma.order.findMany({
      include: {
        customer: true,
        assignee: true,
        messages: { select: { createdAt: true }, orderBy: { createdAt: 'desc' }, take: 1 },
        mails: { select: { date: true }, orderBy: { date: 'desc' }, take: 1 },
      },
      orderBy: {
        createdAt: 'desc',
      },
    }),
    getServerSession(authOptions),
  ]);

  const userId = session?.user?.id;

  let ackMap = new Map<string, Date | null>();
  if (userId) {
    const views = await prisma.orderView.findMany({
      where: { userId },
      select: { orderId: true, acknowledgedAt: true },
    });
    ackMap = new Map(views.map(v => [v.orderId, v.acknowledgedAt]));
  }

  const ordersWithUnread = orders.map(order => {
    const lastMsg = order.messages[0]?.createdAt;
    const lastMail = order.mails[0]?.date;
    const latestActivity = lastMsg && lastMail
      ? (new Date(lastMsg) > new Date(lastMail) ? new Date(lastMsg) : new Date(lastMail))
      : lastMsg ? new Date(lastMsg) : lastMail ? new Date(lastMail) : null;

    const acked = ackMap.get(order.id);
    const hasUnread = latestActivity != null && (!acked || latestActivity > acked);

    return {
      id: order.id,
      title: order.title,
      type: order.type,
      status: order.status,
      paymentStatus: order.paymentStatus,
      createdAt: order.createdAt,
      lastActivityAt: order.lastActivityAt,
      nextStep: order.nextStep,
      customer: order.customer,
      assignee: order.assignee,
      hasUnread,
    };
  });

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <h2 className="text-lg font-semibold">Aufträge</h2>
      </div>

      <OrderList orders={ordersWithUnread} />
    </section>
  );
}
