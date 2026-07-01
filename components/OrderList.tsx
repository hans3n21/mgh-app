'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import DeleteOrderButton from '@/components/DeleteOrderButton';
import CompleteOrderButton from '@/components/CompleteOrderButton';
import {
    WORKFLOW_STATUSES,
    WORKFLOW_STATUS_LABEL,
    WORKFLOW_STATUS_CLASS,
    normalizeWorkflowStatus,
} from '@/lib/order-status';

type OrderWithRelations = {
    id: string;
    title: string;
    type: string;
    status: string;
    paymentStatus?: string | null;
    createdAt: Date;
    customer: {
        name: string;
    } | null;
    assignee: {
        name: string;
    } | null;
    hasUnread?: boolean;
};

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

const ALL_STATUSES = [...WORKFLOW_STATUSES];

function StatusBadge({ status }: { status: string }) {
    const normalized = normalizeWorkflowStatus(status);

    return (
        <span className={`text-xs px-2 py-0.5 rounded-full border ${WORKFLOW_STATUS_CLASS[normalized]}`}>
            {WORKFLOW_STATUS_LABEL[normalized]}
        </span>
    );
}

function PaymentBadge({ paymentStatus }: { paymentStatus?: string | null }) {
    const normalized = paymentStatus || 'open';
    const map: Record<string, { label: string; symbol: string; cls: string }> = {
        open: {
            symbol: '○',
            label: 'Offen',
            cls: 'bg-slate-800 text-slate-300 border-slate-700',
        },
        deposit: {
            symbol: '◐',
            label: 'Anzahlung',
            cls: 'bg-amber-900/30 text-amber-300 border-amber-700/50',
        },
        paid: {
            symbol: '✓',
            label: 'Bezahlt',
            cls: 'bg-emerald-900/30 text-emerald-300 border-emerald-700/50',
        },
    };
    const entry = map[normalized] || map.open;
    return (
        <span
            className={`inline-flex h-6 w-6 items-center justify-center text-sm rounded-full border ${entry.cls}`}
            title={entry.label}
            aria-label={entry.label}
        >
            {entry.symbol}
        </span>
    );
}

export default function OrderList({ orders }: { orders: OrderWithRelations[] }) {
    const router = useRouter();
    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState<string>('ALL');
    const [activeStatuses, setActiveStatuses] = useState<string[]>(
        ALL_STATUSES.filter((status) => status !== 'complete')
    );
    const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
    const [openStatusMenuFor, setOpenStatusMenuFor] = useState<string | null>(null);
    const statusMenuRef = useRef<HTMLDivElement | null>(null);

    const updateOrderStatus = async (orderId: string, status: string) => {
        try {
            setUpdatingStatusId(orderId);
            const res = await fetch(`/api/orders/${orderId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status }),
            });
            if (!res.ok) throw new Error('Status-Update fehlgeschlagen');
            router.refresh();
        } catch (error) {
            console.error(error);
            alert('Konnte Status nicht aktualisieren.');
        } finally {
            setUpdatingStatusId(null);
        }
    };

    const showCompleted = activeStatuses.includes('complete');
    const typeOptions = useMemo(() => {
        return Array.from(new Set(orders.map((order) => order.type))).sort((a, b) =>
            (TYPE_LABEL[a] ?? a).localeCompare(TYPE_LABEL[b] ?? b, 'de')
        );
    }, [orders]);

    const filteredOrders = useMemo(() => {
        const term = search.trim().toLowerCase();

        return orders.filter((order) => {
            const statusAllowed =
                activeStatuses.includes(normalizeWorkflowStatus(order.status));
            if (!statusAllowed) return false;
            if (typeFilter !== 'ALL' && order.type !== typeFilter) return false;
            if (!term) return true;

            const haystack = [
                order.title,
                order.id,
                order.customer?.name ?? '',
                order.assignee?.name ?? '',
                TYPE_LABEL[order.type] ?? order.type,
                WORKFLOW_STATUS_LABEL[normalizeWorkflowStatus(order.status)],
                order.paymentStatus === 'paid'
                    ? 'bezahlt'
                    : order.paymentStatus === 'deposit'
                        ? 'angezahlt'
                        : 'offen',
            ]
                .join(' ')
                .toLowerCase();

            return haystack.includes(term);
        });
    }, [orders, search, activeStatuses, typeFilter]);

    useEffect(() => {
        const onPointerDown = (event: MouseEvent) => {
            if (!statusMenuRef.current) return;
            if (statusMenuRef.current.contains(event.target as Node)) return;
            setOpenStatusMenuFor(null);
        };
        document.addEventListener('mousedown', onPointerDown);
        return () => document.removeEventListener('mousedown', onPointerDown);
    }, []);

    if (orders.length === 0) {
        return <div className="text-slate-500 text-sm mt-3">Keine Aufträge vorhanden.</div>;
    }

    return (
        <div className="mt-3">
            <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center">
                <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Suchen…"
                    className="w-full md:w-72 rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm"
                />
                <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    className="w-full md:w-56 rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-slate-100"
                    title="Nach Auftragstyp filtern"
                    aria-label="Nach Auftragstyp filtern"
                >
                    <option value="ALL">Alle Typen</option>
                    {typeOptions.map((type) => (
                        <option key={type} value={type}>
                            {TYPE_LABEL[type] ?? type}
                        </option>
                    ))}
                </select>
                <button
                    type="button"
                    onClick={() => {
                        setActiveStatuses((prev) =>
                            prev.includes('complete')
                                ? prev.filter((status) => status !== 'complete')
                                : [...prev, 'complete']
                        );
                    }}
                    className={`rounded-lg border px-3 py-2 text-sm transition-colors md:ml-auto ${
                        showCompleted
                            ? 'border-emerald-700/70 bg-emerald-900/30 text-emerald-200'
                            : 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800'
                    }`}
                    aria-pressed={showCompleted}
                    title={showCompleted ? 'Fertige ausblenden' : 'Fertige anzeigen'}
                >
                    {showCompleted ? 'Fertige ausblenden' : 'Fertige anzeigen'}
                </button>
            </div>

            {filteredOrders.length === 0 && (
                <div className="mb-3 rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 text-sm text-slate-400">
                    Keine Aufträge für den aktuellen Filter.
                </div>
            )}

            {/* Mobile View (Cards) */}
            <div className="grid gap-3 md:hidden">
                {filteredOrders.map((order) => (
                    <Link
                        key={order.id}
                        href={`/app/orders/${order.id}`}
                        className="block bg-slate-900/40 border border-slate-800 rounded-xl p-4 hover:bg-slate-800/60 transition-colors relative"
                    >
                        <div className="flex justify-between items-start mb-2">
                            <div className="flex items-center gap-2">
                                <div>
                                    <div className="font-medium text-slate-200">{order.title}</div>
                                    <div className="text-xs text-slate-500 font-mono">{order.id}</div>
                                </div>
                                {order.hasUnread && (
                                    <span className="flex-shrink-0 w-2.5 h-2.5 rounded-full bg-sky-500 animate-pulse" title="Neue Nachricht" />
                                )}
                            </div>
                            <div className="flex flex-col items-end gap-1">
                                <StatusBadge status={order.status} />
                                <PaymentBadge paymentStatus={order.paymentStatus} />
                            </div>
                        </div>

                        <div className="flex justify-between items-center text-sm text-slate-400 mt-2">
                            <div className="flex flex-col gap-0.5">
                                <span className="text-slate-300">{order.customer?.name || 'Unbekannt'}</span>
                                <span className="text-xs opacity-70">{TYPE_LABEL[order.type] || order.type}</span>
                            </div>

                            {/* Delete Button positioned absolutely or inline with stopPropagation */}
                            <div className="z-10">
                                <div className="flex items-center gap-2">
                                    <CompleteOrderButton orderId={order.id} status={order.status} />
                                    <DeleteOrderButton orderId={order.id} />
                                </div>
                            </div>
                        </div>
                    </Link>
                ))}
            </div>

            {/* Desktop View (Table) */}
            <div className="hidden md:block overflow-x-auto">
                <table className="min-w-full text-sm">
                    <thead>
                        <tr className="text-left text-slate-400">
                            <th className="py-2 pr-4">Auftrag</th>
                            <th className="py-2 pr-4">Kunde</th>
                            <th className="py-2 pr-4">Typ</th>
                            <th className="py-2 pr-4">Status</th>
                            <th className="py-2 pr-4">Zahlung</th>
                            <th className="py-2 pr-4">Zuständig</th>
                            <th className="py-2 pr-4"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredOrders.map((order) => (
                            <tr
                                key={order.id}
                                className="border-t border-slate-800 align-top hover:bg-slate-800/30 cursor-pointer transition-colors group"
                                onClick={() => router.push(`/app/orders/${order.id}`)}
                            >
                                <td className="py-2 pr-4">
                                    <div className="flex items-center gap-2">
                                        <span className="font-medium group-hover:text-sky-400 transition-colors">{order.title}</span>
                                        {order.hasUnread && (
                                            <span className="flex-shrink-0 w-2 h-2 rounded-full bg-sky-500 animate-pulse" title="Neue Nachricht" />
                                        )}
                                    </div>
                                    <div className="text-xs text-slate-500 font-mono">{order.id}</div>
                                </td>
                                <td className="py-2 pr-4">{order.customer?.name || 'Unbekannt'}</td>
                                <td className="py-2 pr-4">{TYPE_LABEL[order.type] || order.type}</td>
                                <td className="py-2 pr-4" onClick={(e) => e.stopPropagation()}>
                                    <div
                                        ref={openStatusMenuFor === order.id ? statusMenuRef : null}
                                        className="relative inline-flex items-center"
                                    >
                                        <button
                                            type="button"
                                            disabled={updatingStatusId === order.id}
                                            onClick={() =>
                                                setOpenStatusMenuFor((prev) => (prev === order.id ? null : order.id))
                                            }
                                            className={`text-xs px-2 py-0.5 rounded-full border transition-all ${
                                                WORKFLOW_STATUS_CLASS[normalizeWorkflowStatus(order.status)]
                                            } ${updatingStatusId === order.id ? 'opacity-60 cursor-not-allowed' : 'hover:brightness-110'}`}
                                        >
                                            {WORKFLOW_STATUS_LABEL[normalizeWorkflowStatus(order.status)]}
                                        </button>
                                        <button
                                            type="button"
                                            disabled={updatingStatusId === order.id}
                                            onClick={() =>
                                                setOpenStatusMenuFor((prev) => (prev === order.id ? null : order.id))
                                            }
                                            className="ml-1 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-200 text-xs transition-opacity"
                                            title="Status ändern"
                                        >
                                            ⋯
                                        </button>
                                        {openStatusMenuFor === order.id && (
                                            <div className="absolute left-0 top-7 z-20 w-36 rounded-lg border border-slate-700 bg-slate-900 shadow-xl p-1">
                                                {WORKFLOW_STATUSES.map((statusKey) => {
                                                    const active = normalizeWorkflowStatus(order.status) === statusKey;
                                                    return (
                                                        <button
                                                            key={statusKey}
                                                            type="button"
                                                            onClick={async () => {
                                                                if (active) {
                                                                    setOpenStatusMenuFor(null);
                                                                    return;
                                                                }
                                                                await updateOrderStatus(order.id, statusKey);
                                                                setOpenStatusMenuFor(null);
                                                            }}
                                                            className={`w-full text-left rounded px-2 py-1 text-xs ${
                                                                active
                                                                    ? 'bg-slate-700 text-slate-100'
                                                                    : 'text-slate-300 hover:bg-slate-800'
                                                            }`}
                                                        >
                                                            {WORKFLOW_STATUS_LABEL[statusKey]}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </td>
                                <td className="py-2 pr-4">
                                    <PaymentBadge paymentStatus={order.paymentStatus} />
                                </td>
                                <td className="py-2 pr-4">{order.assignee?.name || '—'}</td>
                                <td className="py-2 pr-4 text-right" onClick={(e) => e.stopPropagation()}>
                                    <div className="flex items-center gap-2 justify-end">
                                        <CompleteOrderButton orderId={order.id} status={order.status} />
                                        <DeleteOrderButton orderId={order.id} />
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
