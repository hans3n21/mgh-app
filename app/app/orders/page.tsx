import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import DeleteOrderButton from '@/components/DeleteOrderButton';

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

export default async function OrdersPage() {
  const orders = await prisma.order.findMany({
    include: {
      customer: true,
      assignee: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <h2 className="text-lg font-semibold">Aufträge</h2>
        <div className="md:ml-auto flex items-center gap-2 w-full md:w-auto">
          <input
            placeholder="Suchen…"
            className="w-full md:w-72 rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm"
          />
        </div>
      </div>
      
      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-slate-400">
              <th className="py-2 pr-4">Auftrag</th>
              <th className="py-2 pr-4">Kunde</th>
              <th className="py-2 pr-4">Typ</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Zuständig</th>
              <th className="py-2 pr-4"></th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id} className="border-t border-slate-800 align-top">
                <td className="py-2 pr-4">
                  <div className="font-medium">{order.title}</div>
                  <div className="text-xs text-slate-500 font-mono">{order.id}</div>
                </td>
                <td className="py-2 pr-4">{order.customer?.name || 'Unbekannt'}</td>
                <td className="py-2 pr-4">{TYPE_LABEL[order.type] || order.type}</td>
                <td className="py-2 pr-4">
                  <StatusBadge status={order.status} />
                </td>
                <td className="py-2 pr-4">{order.assignee?.name || '—'}</td>
                <td className="py-2 pr-4 text-right">
                  <div className="flex items-center gap-2 justify-end">
                    <Link
                      href={`/app/orders/${order.id}`}
                      className="rounded-lg border border-slate-700 px-3 py-1.5 hover:bg-slate-800"
                    >
                      Öffnen
                    </Link>
                    <DeleteOrderButton orderId={order.id} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {orders.length === 0 && (
        <div className="text-slate-500 text-sm mt-3">Keine Aufträge vorhanden.</div>
      )}
    </section>
  );
}
