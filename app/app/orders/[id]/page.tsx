import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import Link from 'next/link';
import OrderDetailClient from './OrderDetailClient';
import OrderHeader from './OrderHeader';

const STATUS_LABEL: Record<string, string> = {
  intake: 'Eingang',
  quote: 'Angebot',
  in_progress: 'In Arbeit',
  finishing: 'Finish',
  setup: 'Setup',
  awaiting_customer: 'Warten auf Kunde',
  complete: 'Fertig',
  design_review: 'Designprüfung',
};

const TYPE_LABEL: Record<string, string> = {
  GUITAR: 'Gitarrenbau',
  BODY: 'Body',
  NECK: 'Hals',
  PICKGUARD: 'Pickguard',
  PICKUPS: 'Tonabnehmer',
  REPAIR: 'Reparatur',
  FINISH_ONLY: 'Oberflächenbehandlung',
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function OrderDetailPage({ params }: PageProps) {
  const { id } = await params;
  const [order, users, session, tasks] = await Promise.all([
    prisma.order.findUnique({
      where: { id },
      include: {
        customer: true,
        assignee: true,
        specs: true,
        items: { include: { priceItem: true } },
        images: true,
        messages: { include: { sender: true } },
        mails: { include: { attachments: true } },
      },
    }),
    prisma.user.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    getServerSession(authOptions),
    prisma.orderTask.findMany({
      where: { orderId: id },
      include: {
        assignee: { select: { id: true, name: true } },
        creator: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  const currentUserId = session?.user?.id;

  let hasUnreadComm = false;
  if (order && currentUserId) {
    const view = await prisma.orderView.findUnique({
      where: { orderId_userId: { orderId: id, userId: currentUserId } },
      select: { acknowledgedAt: true },
    });
    const acked = view?.acknowledgedAt;

    const lastMsg = order.messages[order.messages.length - 1]?.createdAt;
    const lastMail = order.mails?.[order.mails.length - 1]?.date;
    const latestActivity = lastMsg && lastMail
      ? (new Date(lastMsg) > new Date(lastMail) ? new Date(lastMsg) : new Date(lastMail))
      : lastMsg ? new Date(lastMsg) : lastMail ? new Date(lastMail) : null;
    hasUnreadComm = latestActivity != null && (!acked || new Date(latestActivity) > acked);

    prisma.orderView.upsert({
      where: { orderId_userId: { orderId: id, userId: currentUserId } },
      update: { lastSeenAt: new Date() },
      create: { orderId: id, userId: currentUserId },
    }).catch(() => {});
  }

  if (!order) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="text-slate-300">Auftrag nicht gefunden.</div>
          <Link href="/app/orders" className="text-sky-400 hover:text-sky-300 text-sm">Zurück zur Übersicht</Link>
        </div>
      </div>
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60 sm:rounded-2xl">
      <OrderHeader
        orderId={order.id}
        orderTitle={order.title}
        orderType={order.type}
        typeLabel={TYPE_LABEL[order.type]}
        customer={order.customer}
      />

      <div className="p-3 sm:p-4">
        <OrderDetailClient 
          order={order} 
          users={users} 
          currentUserId={session?.user?.id || ''}
          hasUnreadComm={hasUnreadComm}
          initialTasks={tasks.map(t => ({
            ...t,
            createdAt: t.createdAt.toISOString(),
            completedAt: t.completedAt?.toISOString() ?? null,
          }))}
        />
      </div>
    </section>
  );
}
