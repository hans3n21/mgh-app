'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import DeleteOrderButton from '@/components/DeleteOrderButton';
import CompleteOrderButton from '@/components/CompleteOrderButton';
import QuickCustomerUpdateButton from '@/components/QuickCustomerUpdateButton';
import {
    WORKFLOW_STATUSES,
    WORKFLOW_STATUS_LABEL,
    WORKFLOW_STATUS_CLASS,
    normalizeWorkflowStatus,
} from '@/lib/order-status';

// Lebenslagen der Übersicht: Entwürfe sind noch nicht freigegeben, "Zahlung
// offen" wartet auf die (An-)Zahlung, die den Auftrag automatisch aktiviert.
type ViewKey = 'active' | 'draft' | 'payment' | 'complete';

// Unterstrich-Tabs statt Knöpfe: der aktive Tab trägt die Farbe, die der
// Zustand ohnehin als Status-Badge hat — Entwürfe gestrichelt wie ihr Badge.
const VIEW_META: Record<ViewKey, { label: string; underline: string; countClass: string }> = {
    active: { label: 'Aktiv', underline: 'border-sky-400', countClass: 'text-sky-300/80' },
    draft: { label: 'Entwürfe', underline: 'border-dashed border-slate-400', countClass: 'text-slate-400' },
    payment: { label: 'Zahlung offen', underline: 'border-cyan-400', countClass: 'text-cyan-300/80' },
    complete: { label: 'Fertig', underline: 'border-emerald-400', countClass: 'text-emerald-300/80' },
};

function viewOf(status: string): ViewKey {
    const norm = normalizeWorkflowStatus(status);
    if (norm === 'draft') return 'draft';
    if (norm === 'awaiting_payment') return 'payment';
    if (norm === 'complete') return 'complete';
    return 'active';
}

const FILTER_STORAGE_KEY = 'mgh:orders-filters';

type OrderWithRelations = {
    id: string;
    title: string;
    type: string;
    status: string;
    paymentStatus?: string | null;
    createdAt: Date;
    lastActivityAt?: Date | string | null;
    nextStep?: string | null;
    customer: {
        name: string;
        email?: string | null;
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

function StatusBadge({ status }: { status: string }) {
    const normalized = normalizeWorkflowStatus(status);

    return (
        <span className={`text-xs px-2 py-0.5 rounded-full border ${WORKFLOW_STATUS_CLASS[normalized]}`}>
            {WORKFLOW_STATUS_LABEL[normalized]}
        </span>
    );
}

function daysSince(value: Date | string | null | undefined): number | null {
    if (!value) return null;
    const then = new Date(value).getTime();
    if (Number.isNaN(then)) return null;
    return Math.max(0, Math.floor((Date.now() - then) / 86_400_000));
}

function activityLabel(days: number): string {
    if (days === 0) return 'heute';
    if (days === 1) return 'gestern';
    if (days < 14) return `vor ${days} T`;
    if (days < 60) return `vor ${Math.floor(days / 7)} Wo`;
    return `vor ${Math.floor(days / 30)} Mon`;
}

/** "Liegt seit": letzte Aktivität mit Ampelfarben (≤7 T neutral, ≤21 T gelb, danach rot). */
function ActivityBadge({ lastActivityAt, status }: { lastActivityAt?: Date | string | null; status: string }) {
    const days = daysSince(lastActivityAt);
    if (days === null) return <span className="text-xs text-slate-600">—</span>;
    // Fertige und Entwürfe nicht anmahnen — wartende Zahlungen dagegen schon
    // (da ist Nachfassen beim Kunden ja gerade der Zweck der Ampel).
    const done = ['complete', 'draft'].includes(normalizeWorkflowStatus(status));
    const cls = done || days <= 7
        ? 'text-slate-400'
        : days <= 21
            ? 'text-amber-300'
            : 'text-rose-400 font-medium';
    return (
        <span className={`text-xs ${cls}`} title={`Letzte Aktivität: ${new Date(lastActivityAt!).toLocaleDateString('de-DE')}`}>
            {activityLabel(days)}
        </span>
    );
}

// Zahlungsstand. Bewusst ein €-Zeichen statt eines Hakens: der Haken war nicht
// vom "Auftrag abschliessen"-Knopf daneben zu unterscheiden. Der Zustand steckt
// zusaetzlich in der Fuellung (leer -> halb -> voll), nicht nur in der Farbe.
function PaymentBadge({ paymentStatus }: { paymentStatus?: string | null }) {
    const normalized = paymentStatus || 'open';
    const map: Record<string, { label: string; cls: string }> = {
        open: {
            label: 'Zahlung offen',
            cls: 'border-slate-600 bg-slate-800/60 text-slate-400',
        },
        deposit: {
            label: 'Anzahlung erhalten',
            cls: 'border-amber-500/70 bg-amber-900/40 text-amber-300',
        },
        paid: {
            label: 'Bezahlt',
            cls: 'border-emerald-500 bg-emerald-600 text-white font-semibold',
        },
    };
    const entry = map[normalized] || map.open;
    return (
        <span
            className={`inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border text-xs leading-none ${entry.cls}`}
            title={entry.label}
            aria-label={entry.label}
        >
            €
        </span>
    );
}

export default function OrderList({ orders, currentUserId }: { orders: OrderWithRelations[]; currentUserId?: string | null }) {
    const router = useRouter();
    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState<string>('ALL');
    const [sortMode, setSortMode] = useState<'default' | 'stale' | 'recent'>('default');
    const [view, setView] = useState<ViewKey>('active');
    const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
    // Filter überleben Reload und Detailseite→zurück. sessionStorage statt URL,
    // weil die Liste die einzige Konsumentin ist. Erst nach dem Mount lesen —
    // beim Server-Render gibt es kein sessionStorage, und ein abweichender
    // erster Client-Render bräche die Hydration. Der Schreib-Effekt wartet auf
    // hydratedRef, sonst überschriebe der erste Render mit den Defaults genau
    // die Werte, die er gleich laden wollte.
    const hydratedRef = useRef(false);

    useEffect(() => {
        try {
            const raw = sessionStorage.getItem(FILTER_STORAGE_KEY);
            if (raw) {
                const saved = JSON.parse(raw) as Record<string, unknown>;
                if (typeof saved.view === 'string' && saved.view in VIEW_META) {
                    setView(saved.view as ViewKey);
                }
                if (
                    typeof saved.typeFilter === 'string' &&
                    (saved.typeFilter === 'ALL' || orders.some((order) => order.type === saved.typeFilter))
                ) {
                    setTypeFilter(saved.typeFilter);
                }
                if (typeof saved.sortMode === 'string' && ['default', 'stale', 'recent'].includes(saved.sortMode)) {
                    setSortMode(saved.sortMode as 'default' | 'stale' | 'recent');
                }
                if (typeof saved.search === 'string') setSearch(saved.search);
            }
        } catch {
            // Privater Modus o. Ä. — dann eben ohne Merken.
        }
        hydratedRef.current = true;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!hydratedRef.current) return;
        try {
            sessionStorage.setItem(
                FILTER_STORAGE_KEY,
                JSON.stringify({ view, typeFilter, sortMode, search })
            );
        } catch {
            // siehe oben
        }
    }, [view, typeFilter, sortMode, search]);
    const [openStatusMenuFor, setOpenStatusMenuFor] = useState<string | null>(null);
    const statusMenuRef = useRef<HTMLDivElement | null>(null);
    // Der Hinweis muss hier oben leben, nicht im Loeschknopf: nach dem Verschieben
    // faellt die Auftragszeile aus der Liste und wuerde den Knopf samt Hinweis
    // sofort mit ausbauen.
    const [justMoved, setJustMoved] = useState<{ id: string; title: string } | null>(null);
    const [undoing, setUndoing] = useState(false);

    useEffect(() => {
        if (!justMoved) return;
        // 12s statt der ueblichen 4-5: der Hinweis traegt die einzige Rueckgaengig-
        // Moeglichkeit, und wer gerade am Handy scrollt, braucht laenger zum Reagieren.
        const timer = setTimeout(() => setJustMoved(null), 12000);
        return () => clearTimeout(timer);
    }, [justMoved]);

    const undoMove = async () => {
        if (!justMoved || undoing) return;
        setUndoing(true);
        try {
            const res = await fetch(`/api/orders/${justMoved.id}/restore`, { method: 'POST' });
            if (!res.ok) {
                alert(`Zurückholen fehlgeschlagen: ${res.status}`);
                return;
            }
            setJustMoved(null);
            router.refresh();
        } finally {
            setUndoing(false);
        }
    };

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

    const typeOptions = useMemo(() => {
        return Array.from(new Set(orders.map((order) => order.type))).sort((a, b) =>
            (TYPE_LABEL[a] ?? a).localeCompare(TYPE_LABEL[b] ?? b, 'de')
        );
    }, [orders]);

    const viewCounts = useMemo(() => {
        const counts: Record<ViewKey, number> = { active: 0, draft: 0, payment: 0, complete: 0 };
        for (const order of orders) counts[viewOf(order.status)] += 1;
        return counts;
    }, [orders]);

    // Typ-Zahlen innerhalb der gewählten Lebenslage (ohne Suchterm), damit die
    // Chips zur sichtbaren Liste passen.
    const typeCounts = useMemo(() => {
        const counts = new Map<string, number>();
        let total = 0;
        for (const order of orders) {
            if (viewOf(order.status) !== view) continue;
            total += 1;
            counts.set(order.type, (counts.get(order.type) ?? 0) + 1);
        }
        return { counts, total };
    }, [orders, view]);

    // Nur Typen zeigen, die in der Ansicht vorkommen — leere Kategorien machten
    // die Zeile am Handy unlesbar. Der gewählte Typ bleibt auch bei 0 stehen,
    // sonst ließe sich ein gemerkter Filter nicht mehr abwählen.
    const visibleTypes = useMemo(
        () => typeOptions.filter((type) => (typeCounts.counts.get(type) ?? 0) > 0 || type === typeFilter),
        [typeOptions, typeCounts, typeFilter]
    );

    const filteredOrders = useMemo(() => {
        const term = search.trim().toLowerCase();

        return orders.filter((order) => {
            if (viewOf(order.status) !== view) return false;
            if (typeFilter !== 'ALL' && order.type !== typeFilter) return false;
            if (!term) return true;

            const haystack = [
                order.title,
                order.id,
                order.customer?.name ?? '',
                order.assignee?.name ?? '',
                order.nextStep ?? '',
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
    }, [orders, search, view, typeFilter]);

    const sortedOrders = useMemo(() => {
        if (sortMode === 'default') return filteredOrders;
        const ts = (o: OrderWithRelations) => new Date(o.lastActivityAt ?? o.createdAt).getTime() || 0;
        const copy = [...filteredOrders];
        copy.sort((a, b) => (sortMode === 'stale' ? ts(a) - ts(b) : ts(b) - ts(a)));
        return copy;
    }, [filteredOrders, sortMode]);

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
            {justMoved && (
                <div className="pointer-events-none fixed inset-x-0 bottom-28 z-[9998] flex justify-center px-4 lg:bottom-6">
                    <div className="pointer-events-auto flex max-w-full items-center gap-3 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-slate-100 shadow-lg">
                        <span className="min-w-0 truncate">
                            <span className="font-medium">{justMoved.id}</span> in den Papierkorb verschoben
                        </span>
                        <button
                            type="button"
                            onClick={undoMove}
                            disabled={undoing}
                            className="shrink-0 font-semibold text-sky-400 hover:text-sky-300 disabled:opacity-40"
                        >
                            {undoing ? 'Wird zurückgeholt…' : 'Rückgängig'}
                        </button>
                    </div>
                </div>
            )}

            <div className="mb-3 space-y-2.5">
                {/* Lebenslagen als Unterstrich-Tabs: die Trennlinie läuft durch,
                    der aktive Tab setzt seinen 2px-Strich darauf — die Filter
                    gehören so zur Fläche, statt als Knopfreihe darauf zu liegen.
                    Die Zahlen zählen ALLE Aufträge der Lage, unabhängig von Typ
                    und Suche — sie beantworten "wie viele gibt es überhaupt?". */}
                <div className="flex gap-5 overflow-x-auto overflow-y-hidden border-b border-slate-800">
                    {(Object.keys(VIEW_META) as ViewKey[]).map((key) => {
                        const selected = view === key;
                        const meta = VIEW_META[key];
                        return (
                            <button
                                key={key}
                                type="button"
                                onClick={() => setView(key)}
                                aria-pressed={selected}
                                className={`shrink-0 select-none whitespace-nowrap border-b-2 pb-2 pt-1 text-sm transition-colors focus-visible:outline focus-visible:outline-sky-500/60 ${
                                    selected
                                        ? `${meta.underline} font-medium text-slate-100`
                                        : 'border-transparent text-slate-400 hover:text-slate-200'
                                }`}
                            >
                                {meta.label}
                                <span className={`ml-1.5 text-xs tabular-nums ${selected ? meta.countClass : 'text-slate-600'}`}>
                                    {viewCounts[key]}
                                </span>
                            </button>
                        );
                    })}
                </div>

                <div className="flex items-center gap-2">
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Suchen…"
                        className="min-w-0 flex-1 rounded-lg bg-slate-950 border border-slate-800 px-3 py-1.5 text-sm"
                    />
                    <select
                        value={sortMode}
                        onChange={(e) => setSortMode(e.target.value as 'default' | 'stale' | 'recent')}
                        className="shrink-0 rounded-lg bg-slate-950 border border-slate-800 px-2 py-1.5 text-sm text-slate-100"
                        title="Sortierung"
                        aria-label="Sortierung"
                    >
                        <option value="default">Standard</option>
                        <option value="stale">Längste Liegezeit</option>
                        <option value="recent">Neueste Aktivität</option>
                    </select>
                </div>

                {/* Typen als stille Text-Token statt umrandeter Chips. Am Handy
                    blendet die Verlaufsmaske die Kanten aus — angeschnittene
                    Wörter lesen sich sonst wie Datenmüll. */}
                <div className="flex items-center gap-1 overflow-x-auto pb-0.5 max-sm:[mask-image:linear-gradient(to_right,transparent,black_16px,black_calc(100%-16px),transparent)]">
                    <button
                        type="button"
                        onClick={() => setTypeFilter('ALL')}
                        aria-pressed={typeFilter === 'ALL'}
                        className={`shrink-0 select-none whitespace-nowrap rounded-full px-2.5 py-1 text-xs transition-colors focus-visible:outline focus-visible:outline-sky-500/60 ${
                            typeFilter === 'ALL'
                                ? 'bg-sky-500/10 text-sky-300'
                                : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                        }`}
                    >
                        Alle
                        <span className={`ml-1 tabular-nums ${typeFilter === 'ALL' ? 'text-sky-400/70' : 'text-slate-600'}`}>
                            {typeCounts.total}
                        </span>
                    </button>
                    {visibleTypes.map((type) => {
                        const selected = typeFilter === type;
                        const count = typeCounts.counts.get(type) ?? 0;
                        return (
                            <button
                                key={type}
                                type="button"
                                onClick={() => setTypeFilter(selected ? 'ALL' : type)}
                                aria-pressed={selected}
                                className={`shrink-0 select-none whitespace-nowrap rounded-full px-2.5 py-1 text-xs transition-colors focus-visible:outline focus-visible:outline-sky-500/60 ${
                                    selected
                                        ? 'bg-sky-500/10 text-sky-300'
                                        : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                                }`}
                            >
                                {TYPE_LABEL[type] ?? type}
                                <span className={`ml-1 tabular-nums ${selected ? 'text-sky-400/70' : 'text-slate-600'}`}>
                                    {count}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {filteredOrders.length === 0 && (
                <div className="mb-3 rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 text-sm text-slate-400">
                    Keine Aufträge für den aktuellen Filter.
                </div>
            )}

            {/* Mobile View (Cards)
                grid-cols-1 ist Absicht: ohne die feste Spalte richtet sich das
                Raster nach dem laengsten Auftragstitel — eine einzige lange
                Bezeichnung hat bisher ALLE Karten ueber den Bildschirmrand
                geschoben (Zahlungssymbol und Loeschen-Knopf abgeschnitten).
                minmax(0,1fr) laesst die Spalte schrumpfen, dann greift truncate. */}
            <div className="grid grid-cols-1 gap-3 md:hidden">
                {sortedOrders.map((order) => (
                    <Link
                        key={order.id}
                        href={`/app/orders/${order.id}`}
                        className="block bg-slate-900/40 border border-slate-800 rounded-xl p-4 hover:bg-slate-800/60 transition-colors relative"
                    >
                        {/* Kopf: Auftrag links, Status + Zahlung nebeneinander rechts.
                            Untereinander wirkte das Zahlungssymbol wie verrutscht. */}
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                    <span className="truncate font-medium text-slate-200">{order.title}</span>
                                    {order.hasUnread && (
                                        <span className="h-2 w-2 flex-shrink-0 rounded-full bg-sky-500 animate-pulse" title="Neue Nachricht" />
                                    )}
                                </div>
                                <div className="font-mono text-xs text-slate-500">{order.id}</div>
                                {order.nextStep && (
                                    <div className="mt-0.5 text-xs text-sky-300/80">→ {order.nextStep}</div>
                                )}
                            </div>
                            <div className="flex flex-shrink-0 items-center gap-1.5">
                                <StatusBadge status={order.status} />
                                <PaymentBadge paymentStatus={order.paymentStatus} />
                            </div>
                        </div>

                        {/* Fuss: Kunde links, Aktionen rechts — durch eine Linie
                            abgesetzt, damit die Knoepfe eine eigene Zone haben. */}
                        <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-800 pt-2.5">
                            <div className="min-w-0">
                                <div className="truncate text-sm text-slate-300">{order.customer?.name || 'Unbekannt'}</div>
                                <div className="text-xs text-slate-500">
                                    {TYPE_LABEL[order.type] || order.type} · <ActivityBadge lastActivityAt={order.lastActivityAt} status={order.status} />
                                </div>
                            </div>

                            {/* Am Handy gibt es kein Draufhalten, also auch keine Tooltips:
                                ohne Text stehen hier drei nackte Symbole nebeneinander,
                                von denen eines eine Mail an den Kunden schickt und eines
                                den Auftrag abschliesst. */}
                            <div className="z-10 flex flex-shrink-0 items-start gap-2">
                                <span className="flex flex-col items-center gap-0.5">
                                    <QuickCustomerUpdateButton
                                        orderId={order.id}
                                        customerName={order.customer?.name}
                                        customerEmail={order.customer?.email}
                                        currentUserId={currentUserId}
                                    />
                                    <span className="text-[10px] leading-none text-slate-500">Foto</span>
                                </span>
                                <span className="flex flex-col items-center gap-0.5">
                                    {/* onCompleted statt des reload()-Fallbacks im Knopf:
                                        ein harter Reload verwarf alle gesetzten Filter. */}
                                    <CompleteOrderButton orderId={order.id} status={order.status} onCompleted={() => router.refresh()} />
                                    <span className="text-[10px] leading-none text-slate-500">Fertig</span>
                                </span>
                                <span className="flex flex-col items-center gap-0.5">
                                    <DeleteOrderButton
                                        orderId={order.id}
                                        orderTitle={order.title}
                                        onDeleted={() => {
                                            setJustMoved({ id: order.id, title: order.title });
                                            router.refresh();
                                        }}
                                    />
                                    <span className="text-[10px] leading-none text-slate-500">Papierkorb</span>
                                </span>
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
                            <th className="py-2 pr-4">Liegt seit</th>
                            <th className="py-2 pr-4">Zuständig</th>
                            <th className="py-2 pr-4"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedOrders.map((order) => (
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
                                    {order.nextStep && (
                                        <div className="text-xs text-sky-300/80 mt-0.5" title="Nächster Schritt">→ {order.nextStep}</div>
                                    )}
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
                                            <div className="absolute left-0 top-7 z-20 w-44 rounded-lg border border-slate-700 bg-slate-900 shadow-xl p-1">
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
                                <td className="py-2 pr-4">
                                    <ActivityBadge lastActivityAt={order.lastActivityAt} status={order.status} />
                                </td>
                                <td className="py-2 pr-4">{order.assignee?.name || '—'}</td>
                                <td className="py-2 pr-4 text-right" onClick={(e) => e.stopPropagation()}>
                                    <div className="flex items-center gap-2 justify-end">
                                        <QuickCustomerUpdateButton
                                            orderId={order.id}
                                            customerName={order.customer?.name}
                                            customerEmail={order.customer?.email}
                                            currentUserId={currentUserId}
                                        />
                                        <CompleteOrderButton orderId={order.id} status={order.status} onCompleted={() => router.refresh()} />
                                        <DeleteOrderButton
                                        orderId={order.id}
                                        orderTitle={order.title}
                                        onDeleted={() => {
                                            setJustMoved({ id: order.id, title: order.title });
                                            router.refresh();
                                        }}
                                    />
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
