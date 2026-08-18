import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import OrderList from '@/components/OrderList';
import { PAGE_PANEL } from '@/lib/ui-classes';

export default async function OrdersPage() {
  const [orders, session, deletedCount] = await Promise.all([
    prisma.order.findMany({
      where: { deletedAt: null },
      include: {
        customer: true,
        assignee: true,
        messages: { select: { createdAt: true }, orderBy: { createdAt: 'desc' }, take: 1 },
        // Nur eingehende Mails zaehlen fuer den "Neue Nachricht"-Punkt. Ohne den
        // Filter setzte die eigene gesendete Mail (z.B. ein Foto-Update) den Punkt
        // auf dem eigenen Auftrag — fuer alle Nutzer, bis jemand quittiert.
        // senderId faengt selbst versandte Mails, der Ordnername die vom IMAP-Server
        // zurueckgesyncten (der heisst je nach Postfach "Sent" oder "Gesendet").
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
    }),
    getServerSession(authOptions),
    prisma.order.count({ where: { deletedAt: { not: null } } }),
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
      depositPaidAt: order.depositPaidAt,
      paidAt: order.paidAt,
      nextStep: order.nextStep,
      customer: order.customer,
      assignee: order.assignee,
      hasUnread,
    };
  });

  return (
    <section className={PAGE_PANEL}>
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <h2 className="text-lg font-semibold">Aufträge</h2>
        {deletedCount > 0 && (
          <Link
            href="/app/orders/trash"
            className="inline-flex items-center gap-1.5 text-sm text-sky-400 hover:text-sky-300 md:ml-auto"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673A2.25 2.25 0 0 1 15.916 21.75H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
            </svg>
            Papierkorb ({deletedCount})
          </Link>
        )}
      </div>

      <OrderList orders={ordersWithUnread} currentUserId={userId ?? null} />
    </section>
  );
}
