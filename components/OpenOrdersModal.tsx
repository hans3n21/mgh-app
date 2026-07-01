'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { WORKFLOW_STATUS_CLASS, WORKFLOW_STATUS_LABEL, normalizeWorkflowStatus } from '@/lib/order-status';

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
  status: string;
  createdAt: string;
  customer: {
    id: string;
    name: string;
  };
  assignee?: {
    id: string;
    name: string;
  } | null;
}

interface OpenOrdersModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOrderAssigned?: () => void;
}

function StatusBadge({ status }: { status: string }) {
  const normalized = normalizeWorkflowStatus(status);

  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border ${WORKFLOW_STATUS_CLASS[normalized]}`}>
      {WORKFLOW_STATUS_LABEL[normalized]}
    </span>
  );
}

export default function OpenOrdersModal({ isOpen, onClose, onOrderAssigned }: OpenOrdersModalProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigningOrderId, setAssigningOrderId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchOpenOrders();
    }
  }, [isOpen]);

  const fetchOpenOrders = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/orders/open');
      if (response.ok) {
        const data = await response.json();
        setOrders(data);
      }
    } catch (error) {
      console.error('Fehler beim Laden der offenen Aufträge:', error);
    } finally {
      setLoading(false);
    }
  };

  const assignOrderToMe = async (orderId: string) => {
    if (!session?.user?.id) return;

    try {
      setAssigningOrderId(orderId);
      const response = await fetch(`/api/orders/${orderId}/assign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          assigneeId: session.user.id,
        }),
      });

      if (response.ok) {
        // Auftrag aus der Liste entfernen
        setOrders(prev => prev.filter(order => order.id !== orderId));
        onOrderAssigned?.();
      } else {
        throw new Error('Fehler bei der Zuweisung');
      }
    } catch (error) {
      console.error('Fehler bei der Auftragszuweisung:', error);
      alert('Fehler bei der Auftragszuweisung');
    } finally {
      setAssigningOrderId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-slate-900 rounded-2xl border border-slate-700 w-full max-w-4xl max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <h2 className="text-xl font-semibold text-slate-100">Offene Aufträge</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 text-2xl"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {loading ? (
            <div className="text-center py-8 text-slate-400">Lade offene Aufträge...</div>
          ) : orders.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              Keine offenen Aufträge verfügbar.
            </div>
          ) : (
            <div className="space-y-4">
              {orders.map((order) => (
                <div
                  key={order.id}
                  onClick={() => router.push(`/app/orders/${order.id}`)}
                  className="border border-slate-700 rounded-lg p-4 bg-slate-800/30 cursor-pointer hover:bg-slate-800/50 transition-colors"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="space-y-2">
                      <div className="font-medium text-slate-100">{order.title}</div>
                      <div className="text-sm text-slate-400">
                        {order.id} · {order.customer.name}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs rounded-full border border-slate-700 px-2 py-0.5 text-slate-300">
                          {TYPE_LABEL[order.type]}
                        </span>
                        <StatusBadge status={order.status} />
                      </div>
                      <div className="text-xs text-slate-500">
                        Erstellt: {new Date(order.createdAt).toLocaleDateString('de-DE')}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          assignOrderToMe(order.id);
                        }}
                        disabled={assigningOrderId === order.id}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
                      >
                        {assigningOrderId === order.id ? 'Zuweisen...' : 'Übernehmen'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-700 bg-slate-800/30">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-sm transition-colors"
          >
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
}
