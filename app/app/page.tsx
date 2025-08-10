import { prisma } from '@/lib/prisma';
import Link from 'next/link';

const STATUS_LABEL = {
  intake: 'Eingang',
  quote: 'Angebot',
  in_progress: 'In Arbeit',
  finishing: 'Finish',
  setup: 'Setup',
  awaiting_customer: 'Warten auf Kunde',
  complete: 'Fertig',
  design_review: 'Designprüfung',
} as const;

const TYPE_LABEL = {
  guitar: 'Gitarrenbau',
  body: 'Body',
  pickguard: 'Pickguard',
  pickup: 'Tonabnehmer',
  repair: 'Reparatur',
  laser: 'Laser/Druck',
} as const;

function StatusBadge({ status }: { status: keyof typeof STATUS_LABEL | string }) {
  const map: Record<string, string> = {
    intake: 'bg-slate-800 text-slate-300 border-slate-700',
    quote: 'bg-amber-900/30 text-amber-300 border-amber-700/50',
    in_progress: 'bg-blue-900/30 text-blue-300 border-blue-700/50',
    finishing: 'bg-purple-900/30 text-purple-300 border-purple-700/50',
    setup: 'bg-cyan-900/30 text-cyan-300 border-cyan-700/50',
    awaiting_customer: 'bg-amber-900/30 text-amber-300 border-amber-700/50',
    complete: 'bg-emerald-900/30 text-emerald-300 border-emerald-700/50',
    design_review: 'bg-fuchsia-900/30 text-fuchsia-300 border-fuchsia-700/50',
  };
  
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border ${map[String(status)] || 'bg-slate-800 text-slate-300 border-slate-700'}`}>
      {STATUS_LABEL[String(status) as keyof typeof STATUS_LABEL] || String(status)}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="text-slate-300 text-sm">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}

export default async function Dashboard() {
  const orders = await prisma.order.findMany({
    include: {
      customer: true,
      assignee: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 5,
  });

  const openOrders = await prisma.order.count({
    where: {
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

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Stat label="Offene Aufträge" value={openOrders} />
        <Stat label="In Arbeit" value={inProgressOrders} />
      </div>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Aktivste Aufträge</h2>
          <Link href="/app/orders" className="text-sm text-sky-400 hover:text-sky-300">
            Alle anzeigen
          </Link>
        </div>
        
        <ul className="mt-3 divide-y divide-slate-800">
          {orders.map((order) => (
            <li key={order.id} className="py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{order.title}</span>
                  <span className="text-xs rounded-full border border-slate-700 px-2 py-0.5 text-slate-300">
                    {TYPE_LABEL[order.type]}
                  </span>
                </div>
                <div className="text-sm text-slate-400">
                  {order.id} · {order.customer?.name || 'Unbekannt'}
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <StatusBadge status={order.status} />
                <Link
                  href={`/app/orders/${order.id}`}
                  className="text-sm rounded-lg border border-slate-700 px-3 py-1.5 hover:bg-slate-800"
                >
                  Öffnen
                </Link>
              </div>
            </li>
          ))}
        </ul>
        
        {orders.length === 0 && (
          <div className="text-slate-500 text-sm mt-3">Keine Aufträge vorhanden.</div>
        )}
      </section>
    </div>
  );
}
