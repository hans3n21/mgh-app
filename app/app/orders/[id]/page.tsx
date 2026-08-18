import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import Link from 'next/link';
import OrderDetailClient from './OrderDetailClient';
import OrderHeader from './OrderHeader';

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

  // Wie viele weitere Auftraege haengen an diesem Kunden? Grundlage fuer die
  // Warnung in der Kunde-Karte: Aenderungen am Kunden wirken auf alle davon.
  const customerOtherOrdersCount = await prisma.order.count({
    where: { customerId: order.customerId, deletedAt: null, NOT: { id: order.id } },
  });

  // Geloeschte Auftraege nicht normal anzeigen: sonst arbeitet jemand ueber einen
  // alten Link weiter an einem Auftrag, den fuer alle anderen niemand mehr sieht.
  if (order.deletedAt) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-2">
          <div className="text-slate-100 font-semibold">
            {order.title} liegt im Papierkorb
          </div>
          <div className="text-sm text-slate-400">
            Gelöscht am {order.deletedAt.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}
            {' '}um {order.deletedAt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr.
            Alle Daten sind erhalten und lassen sich zurückholen.
          </div>
          <div className="flex gap-3 pt-1 text-sm">
            <Link href="/app/orders/trash" className="text-sky-400 hover:text-sky-300">Zum Papierkorb</Link>
            <Link href="/app/orders" className="text-slate-400 hover:text-slate-300">Zurück zur Übersicht</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    // Ohne eigenen Rahmen: der Reiter-Inhalt darunter bringt seinen eigenen
    // Kasten mit — zwei Rahmen desselben Stils ineinander schlossen dasselbe
    // zweimal ein und kosteten dabei je Seite 1px Rahmen plus 12-16px Polster.
    <section>
      <OrderHeader
        orderId={order.id}
        orderTitle={order.title}
        orderType={order.type}
        typeLabel={TYPE_LABEL[order.type]}
        customer={order.customer}
      />

      {/* Nur noch senkrecht polstern — waagerecht polstert der Reiter-Kasten. */}
      <div className="py-3 sm:py-4">
        <OrderDetailClient
          order={order}
          users={users}
          currentUserId={session?.user?.id || ''}
          hasUnreadComm={hasUnreadComm}
          customerOtherOrdersCount={customerOtherOrdersCount}
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
