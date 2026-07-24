'use client';

import { useState } from 'react';
import Link from 'next/link';
import OpenOrdersModal from '@/components/OpenOrdersModal';
import ImageCarouselModal from '@/components/ImageCarouselModal';
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
  customer: {
    name: string;
  };
  assignee?: {
    name: string;
  } | null;
  hasUnread?: boolean;
}

interface DashboardTask {
  id: string;
  title: string;
  note: string | null;
  createdAt: string;
  creator: { id: string; name: string };
  order: { id: string; title: string };
}

interface DashboardClientProps {
  orders: Order[];
  openOrdersCount: number;
  isAdmin: boolean;
  myTasks?: DashboardTask[];
}

function StatusBadge({ status }: { status: string }) {
  const normalized = normalizeWorkflowStatus(status);

  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border ${WORKFLOW_STATUS_CLASS[normalized]}`}>
      {WORKFLOW_STATUS_LABEL[normalized]}
    </span>
  );
}

function parseNoteAttachments(note: string | null) {
  if (!note) return { text: '', images: [] as string[] };
  const lines = note.split('\n');
  const textLines: string[] = [];
  const imgs: string[] = [];
  let inBlock = false;
  for (const line of lines) {
    if (line.startsWith('📎 Anhänge:')) { inBlock = true; continue; }
    if (inBlock) {
      const m = line.match(/🖼️\s+(\S+)/);
      if (m) imgs.push(m[1]);
    } else {
      textLines.push(line);
    }
  }
  return { text: textLines.join('\n').trim(), images: imgs };
}

export default function DashboardClient({ orders, openOrdersCount, isAdmin, myTasks = [] }: DashboardClientProps) {
  const [showOpenOrders, setShowOpenOrders] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [tasks, setTasks] = useState<DashboardTask[]>(myTasks);
  const [completingTask, setCompletingTask] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ images: Array<{ id: string; path: string; comment: string; position: number; attach: boolean; scope: string }>; index: number } | null>(null);

  const handleOrderAssigned = () => {
    // Trigger refresh of parent component
    setRefreshKey(prev => prev + 1);
    // In einer echten App würde man hier den parent state updaten
    // Für jetzt reloaden wir die Seite
    window.location.reload();
  };

  const handleCompleteTask = async (taskId: string, orderId: string) => {
    setCompletingTask(taskId);
    try {
      const res = await fetch(`/api/orders/${orderId}/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'done' }),
      });
      if (res.ok) {
        setTasks(prev => prev.filter(t => t.id !== taskId));
      }
    } catch {
    } finally {
      setCompletingTask(null);
    }
  };

  return (
    <>
      {tasks.length > 0 && (
        <section className="rounded-2xl border border-orange-500/30 bg-orange-500/5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">📋</span>
            <h2 className="text-lg font-semibold">Meine Aufgaben</h2>
            <span className="text-xs px-2 py-0.5 rounded-full bg-orange-600/20 text-orange-400 border border-orange-600/30">
              {tasks.length}
            </span>
          </div>
          <ul className="space-y-2">
            {tasks.map((task) => (
              <li key={task.id} className="rounded-lg border border-slate-700/60 bg-slate-900/40 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm truncate">{task.title}</div>
                    {(() => {
                      const { text, images } = parseNoteAttachments(task.note);
                      return (
                        <>
                          {text && <div className="text-xs text-slate-400 truncate mt-0.5">{text}</div>}
                          {images.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                              {images.map((src, i) => (
                                <button
                                  key={i}
                                  type="button"
                                  onClick={() => setLightbox({
                                    images: images.map((s, j) => ({ id: `task-img-${j}`, path: s, comment: '', position: j, attach: false, scope: 'attachment' })),
                                    index: i,
                                  })}
                                  className="block h-10 w-10 overflow-hidden rounded border border-slate-700 bg-slate-800 hover:border-orange-500/60"
                                >
                                  <img src={src} className="h-full w-full object-cover" alt="Anhang" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                </button>
                              ))}
                            </div>
                          )}
                        </>
                      );
                    })()}
                    <div className="text-xs text-slate-500 mt-1">
                      Von {task.creator.name} ·{' '}
                      <Link href={`/app/orders/${task.order.id}`} className="text-sky-400 hover:text-sky-300">
                        {task.order.title}
                      </Link>
                      {' · '}
                      {new Date(task.createdAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                    </div>
                  </div>
                  <button
                    onClick={() => handleCompleteTask(task.id, task.order.id)}
                    disabled={completingTask === task.id}
                    className="flex-shrink-0 px-3 py-1.5 rounded-lg border border-emerald-600/40 bg-emerald-600/10 text-emerald-400 hover:bg-emerald-600/20 text-xs font-medium transition-colors disabled:opacity-50"
                  >
                    {completingTask === task.id ? '…' : '✓ Erledigt'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

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
                    <div className="flex items-center gap-2 justify-center sm:justify-start">
                      <span className="font-medium">{order.title}</span>
                      {order.hasUnread && (
                        <span className="flex-shrink-0 w-2 h-2 rounded-full bg-sky-500 animate-pulse" title="Neue Nachricht" />
                      )}
                    </div>

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

      {lightbox && lightbox.images.length > 0 && (
        <ImageCarouselModal
          images={lightbox.images}
          index={Math.min(lightbox.index, lightbox.images.length - 1)}
          scopes={[]}
          onClose={() => setLightbox(null)}
          onUpdate={async () => {}}
          onDelete={async () => {}}
        />
      )}
    </>
  );
}
