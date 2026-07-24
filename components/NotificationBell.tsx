'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type NotificationItem = {
	id: string;
	type: string;
	title: string;
	body?: string | null;
	href?: string | null;
	readAt?: string | null;
	createdAt: string;
};

const TYPE_ICON: Record<string, string> = {
	task_assigned: '✅',
	order_assigned: '📋',
	order_mail: '📬',
};

function timeAgo(iso: string): string {
	const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
	if (mins < 1) return 'jetzt';
	if (mins < 60) return `vor ${mins} Min`;
	const hours = Math.floor(mins / 60);
	if (hours < 24) return `vor ${hours} Std`;
	return `vor ${Math.floor(hours / 24)} T`;
}

export default function NotificationBell() {
	const [open, setOpen] = useState(false);
	const [items, setItems] = useState<NotificationItem[]>([]);
	const [unreadCount, setUnreadCount] = useState(0);
	const containerRef = useRef<HTMLDivElement | null>(null);
	const router = useRouter();

	const load = useCallback(async () => {
		try {
			const res = await fetch('/api/notifications');
			if (!res.ok) return;
			const data = await res.json();
			setItems(Array.isArray(data.items) ? data.items : []);
			setUnreadCount(Number(data.unreadCount) || 0);
		} catch {
			// Netzwerk-Hickser ignorieren
		}
	}, []);

	useEffect(() => {
		void load();
		const interval = setInterval(() => { void load(); }, 60_000);
		return () => clearInterval(interval);
	}, [load]);

	useEffect(() => {
		const onPointerDown = (event: MouseEvent) => {
			if (!containerRef.current) return;
			if (containerRef.current.contains(event.target as Node)) return;
			setOpen(false);
		};
		document.addEventListener('mousedown', onPointerDown);
		return () => document.removeEventListener('mousedown', onPointerDown);
	}, []);

	const markAllRead = useCallback(async () => {
		await fetch('/api/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
		void load();
	}, [load]);

	const openItem = useCallback(async (item: NotificationItem) => {
		if (!item.readAt) {
			await fetch('/api/notifications', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ ids: [item.id] }),
			});
			void load();
		}
		setOpen(false);
		if (item.href) router.push(item.href);
	}, [load, router]);

	return (
		<div ref={containerRef} className="relative">
			<button
				type="button"
				onClick={() => setOpen((prev) => !prev)}
				className="relative inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800"
				title="Benachrichtigungen"
				aria-label={`Benachrichtigungen${unreadCount > 0 ? ` (${unreadCount} ungelesen)` : ''}`}
			>
				<span className="text-sm leading-none">🔔</span>
				{unreadCount > 0 && (
					<span className="absolute -top-1.5 -right-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
						{unreadCount > 9 ? '9+' : unreadCount}
					</span>
				)}
			</button>

			{open && (
				<div className="absolute right-0 top-10 z-50 w-80 rounded-lg border border-slate-700 bg-slate-900 shadow-xl">
					<div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
						<span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Benachrichtigungen</span>
						{unreadCount > 0 && (
							<button type="button" onClick={markAllRead} className="text-[11px] text-sky-400 hover:text-sky-300">
								Alle gelesen
							</button>
						)}
					</div>
					<div className="max-h-96 overflow-y-auto">
						{items.length === 0 && (
							<div className="px-3 py-6 text-center text-xs text-slate-500">Keine Benachrichtigungen</div>
						)}
						{items.map((item) => (
							<button
								key={item.id}
								type="button"
								onClick={() => openItem(item)}
								className={`block w-full border-b border-slate-800/60 px-3 py-2.5 text-left transition-colors hover:bg-slate-800/60 ${
									item.readAt ? 'opacity-50' : ''
								}`}
							>
								<div className="flex items-start gap-2">
									<span className="mt-0.5 text-sm">{TYPE_ICON[item.type] ?? '🔔'}</span>
									<div className="min-w-0 flex-1">
										<div className={`truncate text-sm ${item.readAt ? 'text-slate-400' : 'font-medium text-slate-100'}`}>
											{item.title}
										</div>
										{item.body && <div className="mt-0.5 truncate text-xs text-slate-500">{item.body}</div>}
										<div className="mt-0.5 text-[10px] text-slate-600">{timeAgo(item.createdAt)}</div>
									</div>
									{!item.readAt && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-sky-400" />}
								</div>
							</button>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
