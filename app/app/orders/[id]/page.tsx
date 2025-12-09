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
  const [order, users, session] = await Promise.all([
    prisma.order.findUnique({
      where: { id },
      include: {
        customer: true,
        assignee: true,
        specs: true,
        items: { include: { priceItem: true } },
        images: true,
        messages: { include: { sender: true } },
      },
    }),
    prisma.user.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    getServerSession(authOptions),
  ]);

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
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden">
      <OrderHeader
        orderId={order.id}
        orderTitle={order.title}
        orderType={order.type}
        typeLabel={TYPE_LABEL[order.type]}
        customer={order.customer}
      />

      <div className="p-4">
        <OrderDetailClient 
          order={order} 
          users={users} 
          currentUserId={session?.user?.id || ''} 
        />
      </div>
    </section>
  );
}
