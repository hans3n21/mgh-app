import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import Link from 'next/link';
import OrderDetailClient from './OrderDetailClient';

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
  guitar: 'Gitarrenbau',
  body: 'Body',
  pickguard: 'Pickguard',
  pickup: 'Tonabnehmer',
  repair: 'Reparatur',
  laser: 'Laser/Druck',
};

interface PageProps {
  params: { id: string };
}

export default async function OrderDetailPage({ params }: PageProps) {
  const [order, users, session] = await Promise.all([
    prisma.order.findUnique({
      where: { id: params.id },
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
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 p-3">
        <Link href="/app/orders" className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm hover:bg-slate-800">Aufträge</Link>
        <span className="text-sm text-slate-500">/</span>
        <span className="text-sm text-slate-300 font-mono">{order.id}</span>
        <h2 className="text-lg font-semibold ml-2">{order.title}</h2>
        <div className="ml-auto text-xs rounded-full border border-slate-700 px-2 py-0.5 text-slate-300">{TYPE_LABEL[order.type]}</div>
      </div>

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
