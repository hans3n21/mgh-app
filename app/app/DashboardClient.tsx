'use client';

import { useState } from 'react';
import Link from 'next/link';
import OpenOrdersModal from '@/components/OpenOrdersModal';

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
  GUITAR: 'Gitarrenbau',
  BODY: 'Body',
  NECK: 'Hals',
  REPAIR: 'Reparatur',
  PICKGUARD: 'Pickguard',
  PICKUPS: 'Tonabnehmer',
  ENGRAVING: 'Gravur',
  FINISH_ONLY: 'Oberflächenbehandlung',
} as const;

interface Order {
  id: string;
  title: string;
  type: keyof typeof TYPE_LABEL;
  status: keyof typeof STATUS_LABEL;
  customer: {
    name: string;
  };
  assignee?: {
    name: string;
  } | null;
}

interface DashboardClientProps {
  orders: Order[];
  openOrdersCount: number;
  isAdmin: boolean;
}

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

export default function DashboardClient({ orders, openOrdersCount, isAdmin }: DashboardClientProps) {
  const [showOpenOrders, setShowOpenOrders] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleOrderAssigned = () => {
    // Trigger refresh of parent component
    setRefreshKey(prev => prev + 1);
    // In einer echten App würde man hier den parent state updaten
    // Für jetzt reloaden wir die Seite
    window.location.reload();
  };

  return (
    <>
      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h2 className="text-lg font-semibold">
            {isAdmin ? 'Alle Aufträge' : 'Meine Aufträge'}
          </h2>
          <div className="flex items-center gap-2">
            {openOrdersCount > 0 && (
              <button
                onClick={() => setShowOpenOrders(true)}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              >
                <span className="bg-white text-amber-700 rounded-full w-5 h-5 text-xs flex items-center justify-center font-bold">
                  {openOrdersCount}
                </span>
                Offene Aufträge
              </button>
            )}
            <Link
              href="/app/orders"
              className="text-sm rounded-lg border border-slate-700 px-3 py-1.5 hover:bg-slate-800 transition-colors"
            >
              Alle Aufträge
            </Link>
          </div>
        </div>
        
        <ul className="mt-3 divide-y divide-slate-800">
          {orders.map((order) => (
            <li key={order.id} className="py-3">
              <Link 
                href={`/app/orders/${order.id}`}
                className="block hover:bg-slate-800/30 rounded-lg p-2 -m-2 transition-colors"
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="text-center sm:text-left space-y-1">
                    {/* Titel alleine in der ersten Zeile */}
                    <div className="font-medium">{order.title}</div>
                    
                    {/* Auftragsnummer und Kunde in der zweiten Zeile */}
                    <div className="text-sm text-slate-400">
                      {order.id} · {order.customer?.name || 'Unbekannt'}
                    </div>
                    
                    {/* Typ und Status mittig untereinander in der dritten Zeile (nur mobile) */}
                    <div className="flex items-center justify-center gap-2 sm:hidden">
                      <span className="text-xs rounded-full border border-slate-700 px-2 py-0.5 text-slate-300">
                        {TYPE_LABEL[order.type]}
                      </span>
                      <StatusBadge status={order.status} />
                    </div>
                  </div>
                  
                  {/* Desktop: Status rechts */}
                  <div className="hidden sm:flex items-center justify-end gap-3">
                    <span className="text-xs rounded-full border border-slate-700 px-2 py-0.5 text-slate-300">
                      {TYPE_LABEL[order.type]}
                    </span>
                    <StatusBadge status={order.status} />
                    <span className="text-sm rounded-lg border border-slate-700 px-3 py-1.5 hover:bg-slate-800">
                      Öffnen
                    </span>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
        
        {orders.length === 0 && (
          <div className="text-slate-500 text-sm mt-3">
            {isAdmin ? 'Keine Aufträge vorhanden.' : 'Du hast noch keine zugewiesenen Aufträge.'}
            {!isAdmin && openOrdersCount > 0 && (
              <div className="mt-2">
                <button
                  onClick={() => setShowOpenOrders(true)}
                  className="text-amber-400 hover:text-amber-300 underline"
                >
                  Schau dir die {openOrdersCount} offenen Aufträge an
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      <OpenOrdersModal
        isOpen={showOpenOrders}
        onClose={() => setShowOpenOrders(false)}
        onOrderAssigned={handleOrderAssigned}
      />
    </>
  );
}
