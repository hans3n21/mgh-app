import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import RestoreOrderButton from '@/components/RestoreOrderButton';
import PurgeOrderButton from '@/components/PurgeOrderButton';
import { PAGE_PANEL } from '@/lib/ui-classes';

const TYPE_LABEL: Record<string, string> = {
  GUITAR: 'Gitarrenbau',
  BODY: 'Body',
  NECK: 'Hals',
  REPAIR: 'Reparatur',
  PICKGUARD: 'Pickguard',
  PICKUPS: 'Tonabnehmer',
  ENGRAVING: 'Gravur',
  FINISH_ONLY: 'Oberflächenbehandlung',
};

function formatDeletedAt(date: Date) {
  return `${date.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })}, ${date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr`;
}

export default async function OrderTrashPage() {
  const orders = await prisma.order.findMany({
    where: { deletedAt: { not: null } },
    include: {
      customer: { select: { name: true } },
      _count: { select: { images: true, messages: true, mails: true } },
    },
    orderBy: { deletedAt: 'desc' },
  });

  return (
    <section className={PAGE_PANEL}>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold">Papierkorb</h2>
        <Link href="/app/orders" className="text-sm text-sky-400 hover:text-sky-300">
          Zurück zu den Aufträgen
        </Link>
      </div>

      <p className="mt-1 text-sm text-slate-400">
        Gelöschte Aufträge bleiben hier mitsamt Bildern, Datenblatt und Nachrichten
        liegen, bis sie jemand endgültig entfernt.
      </p>

      {orders.length === 0 ? (
        <div className="mt-6 rounded-xl border border-slate-800 bg-slate-950/40 p-6 text-center text-sm text-slate-400">
          Der Papierkorb ist leer.
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-slate-800">
          {orders.map((order) => (
            <li
              key={order.id}
              className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="truncate font-medium text-slate-100">{order.title}</div>
                <div className="text-xs text-slate-400">
                  {order.id} · {order.customer.name} · {TYPE_LABEL[order.type] ?? order.type}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  Gelöscht am {order.deletedAt ? formatDeletedAt(order.deletedAt) : '—'}
                  {' · '}
                  {order._count.images} Bilder, {order._count.messages} Notizen,{' '}
                  {order._count.mails} Mails
                </div>
              </div>

              <div className="flex min-w-0 flex-col items-stretch gap-2 sm:flex-row sm:items-start">
                <RestoreOrderButton orderId={order.id} />
                <PurgeOrderButton
                  orderId={order.id}
                  orderTitle={order.title}
                  imageCount={order._count.images}
                  messageCount={order._count.messages}
                  mailCount={order._count.mails}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
