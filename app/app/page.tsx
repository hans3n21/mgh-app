import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import FeedbackDashboard from '@/components/FeedbackDashboard';
import DashboardClient from './DashboardClient';



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
  const isAdmin = session?.user?.role === 'admin';
  const currentUserId = session?.user?.id;

  // Für Staff: Nur eigene zugewiesene Aufträge, für Admin: alle Aufträge
  const orders = await prisma.order.findMany({
    where: isAdmin ? {} : {
      assigneeId: currentUserId,
    },
    include: {
      customer: true,
      assignee: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 5,
  });

  // Offene Aufträge (ohne Assignee)
  const openOrders = await prisma.order.count({
    where: {
      assigneeId: null,
      status: {
        not: 'complete',
      },
    },
  });

  // Alle offenen Aufträge für Admin, eigene für Staff
  const totalOpenOrders = await prisma.order.count({
    where: isAdmin ? {
      status: {
        not: 'complete',
      },
    } : {
      assigneeId: currentUserId,
      status: {
        not: 'complete',
      },
    },
  });

  const inProgressOrders = await prisma.order.count({
    where: {
      status: 'in_progress',
    },
  });

  // Feedback-Statistiken für Admins
  let feedbackStats = null;
  if (isAdmin) {
    try {
      feedbackStats = {
        open: await prisma.feedback.count({ where: { resolved: false } }),
        total: await prisma.feedback.count(),
      };
    } catch (error) {
      console.warn('Feedback-Modell noch nicht verfügbar:', error);
      feedbackStats = {
        open: 0,
        total: 0,
      };
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label={isAdmin ? "Alle offenen" : "Meine Aufträge"} value={totalOpenOrders} />
        <Stat label="In Arbeit" value={inProgressOrders} />
        {openOrders > 0 && (
          <Stat label="Unzugewiesen" value={openOrders} />
        )}
        {isAdmin && feedbackStats && (
          <>
            <Stat label="Offenes Feedback" value={feedbackStats.open} />
            <Stat label="Feedback gesamt" value={feedbackStats.total} />
          </>
        )}
      </div>

      <DashboardClient 
        orders={orders}
        openOrdersCount={openOrders}
        isAdmin={isAdmin}
      />

      {/* Feedback Dashboard nur für Admins */}
      {isAdmin && (
        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <FeedbackDashboard />
        </section>
      )}
    </div>
  );
}
