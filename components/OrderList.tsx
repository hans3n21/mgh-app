'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import DeleteOrderButton from '@/components/DeleteOrderButton';

// Type definitions based on the Prisma query in page.tsx
type OrderWithRelations = {
    id: string;
    title: string;
    type: string;
    status: string;
    createdAt: Date;
    customer: {
        name: string;
    } | null;
    assignee: {
        name: string;
    } | null;
};

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

function StatusBadge({ status }: { status: string }) {
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
        <span className={`text-xs px-2 py-0.5 rounded-full border ${map[status] || 'bg-slate-800 text-slate-300 border-slate-700'}`}>
            {STATUS_LABEL[status as keyof typeof STATUS_LABEL] || status}
        </span>
    );
}

export default function OrderList({ orders }: { orders: OrderWithRelations[] }) {
    const router = useRouter();

    if (orders.length === 0) {
        return <div className="text-slate-500 text-sm mt-3">Keine Aufträge vorhanden.</div>;
    }

    return (
        <div className="mt-3">
            {/* Mobile View (Cards) */}
            <div className="grid gap-3 md:hidden">
                {orders.map((order) => (
                    <Link
                        key={order.id}
                        href={`/app/orders/${order.id}`}
                        className="block bg-slate-900/40 border border-slate-800 rounded-xl p-4 hover:bg-slate-800/60 transition-colors relative"
                    >
                        <div className="flex justify-between items-start mb-2">
                            <div>
                                <div className="font-medium text-slate-200">{order.title}</div>
                                <div className="text-xs text-slate-500 font-mono">{order.id}</div>
                            </div>
                            <StatusBadge status={order.status} />
                        </div>

                        <div className="flex justify-between items-center text-sm text-slate-400 mt-2">
                            <div className="flex flex-col gap-0.5">
                                <span className="text-slate-300">{order.customer?.name || 'Unbekannt'}</span>
                                <span className="text-xs opacity-70">{TYPE_LABEL[order.type] || order.type}</span>
                            </div>

                            {/* Delete Button positioned absolutely or inline with stopPropagation */}
                            <div className="z-10">
                                <DeleteOrderButton orderId={order.id} />
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
                            <th className="py-2 pr-4">Zuständig</th>
                            <th className="py-2 pr-4"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {orders.map((order) => (
                            <tr
                                key={order.id}
                                className="border-t border-slate-800 align-top hover:bg-slate-800/30 cursor-pointer transition-colors group"
                                onClick={() => router.push(`/app/orders/${order.id}`)}
                            >
                                <td className="py-2 pr-4">
                                    <div className="font-medium group-hover:text-sky-400 transition-colors">{order.title}</div>
                                    <div className="text-xs text-slate-500 font-mono">{order.id}</div>
                                </td>
                                <td className="py-2 pr-4">{order.customer?.name || 'Unbekannt'}</td>
                                <td className="py-2 pr-4">{TYPE_LABEL[order.type] || order.type}</td>
                                <td className="py-2 pr-4">
                                    <StatusBadge status={order.status} />
                                </td>
                                <td className="py-2 pr-4">{order.assignee?.name || '—'}</td>
                                <td className="py-2 pr-4 text-right" onClick={(e) => e.stopPropagation()}>
                                    <div className="flex items-center gap-2 justify-end">
                                        {/* Open button removed as requested, row is clickable */}
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
