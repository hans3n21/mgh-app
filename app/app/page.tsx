import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import FeedbackDashboard from '@/components/FeedbackDashboard';
import DashboardClient from './DashboardClient';
import { PAGE_PANEL } from '@/lib/ui-classes';



function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-center sm:text-left">
      <div className="text-slate-300 text-sm">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}

export default async function Dashboard() {
  const session = await getServerSession(authOptions);
  const userRole = session?.user?.role;
  const isAdmin = userRole === 'admin' || userRole === 'admin_no_feedback';
  const showFeedback = userRole === 'admin'; // Nur für normale Admins, nicht für admin_no_feedback
  const currentUserId = session?.user?.id;

  // Für Staff: Nur eigene zugewiesene Aufträge, für Admin: alle Aufträge
  const orders = await prisma.order.findMany({
    where: {
      deletedAt: null,
      ...(isAdmin ? {} : { assigneeId: currentUserId }),
      // Fertige gehoeren nicht in die Dashboard-Liste, Entwuerfe auch nicht:
      // die sind noch nicht freigegeben und zaehlen erst nach Freigabe als aktiv.
      status: { notIn: ['complete', 'draft'] },
    },
    include: {
      customer: true,
      assignee: true,
      messages: { select: { createdAt: true }, orderBy: { createdAt: 'desc' }, take: 1 },
      // Siehe app/app/orders/page.tsx: eigene gesendete Mails duerfen den
      // "Neue Nachricht"-Punkt nicht ausloesen.
      mails: {
        where: {
          senderId: null,
          NOT: [
            { folder: { contains: 'sent', mode: 'insensitive' } },
            { folder: { contains: 'gesendet', mode: 'insensitive' } },
          ],
        },
        select: { date: true },
        orderBy: { date: 'desc' },
        take: 1,
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 5,
  });

  // Offene Aufträge (ohne Assignee) — Entwürfe zählen erst nach Freigabe mit
  const openOrders = await prisma.order.count({
    where: {
      deletedAt: null,
      assigneeId: null,
      status: {
        notIn: ['complete', 'draft'],
      },
    },
  });

  // Alle offenen Aufträge für Admin, eigene für Staff
  const totalOpenOrders = await prisma.order.count({
    where: isAdmin ? {
      deletedAt: null,
      status: {
        notIn: ['complete', 'draft'],
      },
    } : {
      deletedAt: null,
      assigneeId: currentUserId,
      status: {
        notIn: ['complete', 'draft'],
      },
    },
  });

  const inProgressOrders = await prisma.order.count({
    where: {
      deletedAt: null,
      status: 'in_progress',
    },
  });

  const myTasks = currentUserId
    ? await prisma.orderTask.findMany({
        where: { assigneeId: currentUserId, status: 'open' },
        include: {
          creator: { select: { id: true, name: true } },
          order: { select: { id: true, title: true } },
        },
        orderBy: { createdAt: 'desc' },
      })
    : [];

  let ackMap = new Map<string, Date | null>();
  if (currentUserId) {
    const orderIds = orders.map(o => o.id);
    const views = await prisma.orderView.findMany({
      where: { userId: currentUserId, orderId: { in: orderIds } },
      select: { orderId: true, acknowledgedAt: true },
    });
    ackMap = new Map(views.map(v => [v.orderId, v.acknowledgedAt]));
  }

  const dashboardOrders = orders.map(order => {
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
      customer: order.customer,
      assignee: order.assignee,
      hasUnread,
    };
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label={isAdmin ? "Alle offenen" : "Meine Aufträge"} value={totalOpenOrders} />
        <Stat label="In Arbeit" value={inProgressOrders} />
        {openOrders > 0 && (
          <Stat label="Unzugewiesen" value={openOrders} />
        )}
      </div>

      <DashboardClient 
        orders={dashboardOrders}
        openOrdersCount={openOrders}
        isAdmin={isAdmin}
        myTasks={myTasks.map(t => ({
          id: t.id,
          title: t.title,
          note: t.note,
          createdAt: t.createdAt.toISOString(),
          creator: t.creator,
          order: t.order,
        }))}
      />

      {/* Feedback Dashboard nur für normale Admins (nicht für admin_no_feedback) */}
      {showFeedback && (
        <section className={PAGE_PANEL}>
          <FeedbackDashboard />
        </section>
      )}
    </div>
  );
}
