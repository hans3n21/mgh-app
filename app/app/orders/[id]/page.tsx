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
  GUITAR: 'Gitarrenbau',
  BODY: 'Body',
  NECK: 'Hals',
  PICKGUARD: 'Pickguard',
  PICKUPS: 'Tonabnehmer',
  REPAIR: 'Reparatur',
  FINISH_ONLY: 'Oberflächenbehandlung',
};

interface PageProps {
  params: { id: string };
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
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 p-3">
        <div className="flex items-center gap-2">
          <Link href="/app/orders" className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm hover:bg-slate-800">Aufträge</Link>
          <span className="text-sm text-slate-500">/</span>
          <h2 className="text-lg font-semibold">{order.title}</h2>
          <div className="text-xs rounded-full border border-slate-700 px-2 py-0.5 text-slate-300">{TYPE_LABEL[order.type]}</div>
        </div>
        
        {/* Kunde-Info oben rechts */}
        <div className="flex items-center gap-3">
          <div className="text-sm font-medium text-slate-200">{order.customer.name}</div>
          <div className="flex items-center gap-2">
            {order.customer.email && (
              <a
                href={`mailto:${order.customer.email}`}
                className="text-slate-400 hover:text-sky-400 transition-colors"
                title={`E-Mail an ${order.customer.name}: ${order.customer.email}`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </a>
            )}
            {order.customer.phone && (
              <a
                href={`tel:${order.customer.phone}`}
                className="text-slate-400 hover:text-green-400 transition-colors"
                title={`Anrufen: ${order.customer.phone}`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
              </a>
            )}
          </div>
        </div>
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
