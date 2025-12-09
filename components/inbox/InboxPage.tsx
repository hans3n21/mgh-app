"use client";
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { detectLang } from '@/lib/lang/detectLang';
import InboxToolbar from './InboxToolbar';
import InboxList from './InboxList';
import InboxPreview from './InboxPreview';
import EmptyState from './EmptyState';
import RowSkeleton from './RowSkeleton';
import type { InboxFilter, Message } from './types';
import DatasheetSidebar from './DatasheetSidebar';
import ReplyComposer from './ReplyComposer';

function generateMockMessages(): Message[] {
	const now = Date.now();
	return Array.from({ length: 50 }).map((_, i) => {
		const hasAttachments = Math.random() > 0.6;
		const attachmentsCount = hasAttachments ? Math.floor(Math.random() * 4) + 1 : 0;
		return {
			id: `msg_${i + 1}`,
			subject: `Anfrage ${i + 1} – Angebot und Lieferzeit`,
			fromName: `Kontakt ${i + 1}`,
			fromEmail: `kontakt${i + 1}@example.com`,
			createdAt: new Date(now - i * 3600_000).toISOString(),
			hasAttachments,
			attachmentsCount,
			attachments: hasAttachments
				? Array.from({ length: attachmentsCount }).map((__, j) => ({
						id: `att_${i + 1}_${j + 1}`,
						filename: `bild_${j + 1}.jpg`,
						mimeType: 'image/jpeg',
						url: `/api/attachments/${i + 1}_${j + 1}`,
				  }))
				: [],
			lang: Math.random() > 0.2 ? 'DE' : 'EN',
			assignedTo: Math.random() > 0.5 ? `ORD-${1000 + i}` : null,
			isRead: Math.random() > 0.5,
			snippet: 'Hallo, wir interessieren uns für Ihr Produkt. Können Sie uns ein Angebot und die aktuelle Lieferzeit senden?',
			html: `<p>Hallo,</p><p>wir interessieren uns für Ihr Produkt. Können Sie uns ein Angebot und die aktuelle Lieferzeit senden?</p><p>Beste Grüße</p>`,
			threadId: `thr_${Math.floor(i / 3) + 1}`,
			leadId: Math.random() > 0.8 ? `lead_${200 + i}` : null,
		};
	});
}

export default function InboxPage() {
	const [loading, setLoading] = useState(true);
	const [messages, setMessages] = useState<Message[]>([]);
	const [q, setQ] = useState('');
	const [filter, setFilter] = useState<InboxFilter>('all');
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
	const lastClickedRef = useRef<string | null>(null);
	const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
	const [replyOpen, setReplyOpen] = useState<boolean>(false);
	


	// SSE subscribe
	useEffect(() => {
		const ev = new EventSource('/api/inbox/events');
		ev.addEventListener('message.created', (e: MessageEvent) => {
			try {
				const payload = JSON.parse((e as any).data);
				// refetch latest mail or minimally inject placeholder
				setMessages((prev) => [{
					id: payload.id,
					subject: 'Neue Nachricht',
					fromName: '–',
					fromEmail: '',
					createdAt: payload.createdAt,
					hasAttachments: false,
					attachmentsCount: 0,
					lang: 'DE',
					assignedTo: null,
					isRead: false,
					snippet: '',
					threadId: payload.threadId,
				}, ...prev]);
			} catch {}
		});
		return () => ev.close();
	}, []);

	useEffect(() => {
		let active = true;
		(async () => {
			setLoading(true);
			try {
				const res = await fetch('/api/mails');
				if (!active) return;
				if (res.ok) {
					const mails = await res.json();
											const mapped: Message[] = mails.map((m: any) => ({
						id: m.id,
						subject: m.subject || 'Ohne Betreff',
						fromName: m.fromName || m.fromEmail || '–',
						fromEmail: m.fromEmail || '',
						createdAt: m.date || new Date().toISOString(),
						hasAttachments: m.hasAttachments !== undefined ? !!m.hasAttachments : (m.attachments?.length || 0) > 0,
						attachmentsCount: (m.attachments?.length) || 0,
						attachments: (m.attachments || []).map((a: any) => ({ id: a.id, filename: a.filename, mimeType: a.mimeType || null, url: `/api/attachments/${a.id}` })),
						lang: detectLang((m.text || m.html || '')), 
						assignedTo: m.orderId || null,
						isRead: m.isRead !== undefined ? m.isRead : false, // Default to unread (isRead: false) if not specified
						snippet: (m.text || '').slice(0, 200),
						html: m.html || undefined,
						threadId: m.threadId || undefined,
						leadId: m.leadId || null,
					}));
					setMessages(mapped);
				}
			} finally {
				if (active) setLoading(false);
			}
		})();
		return () => {
			active = false;
		};
	}, []);

	const filtered = useMemo(() => {
		let arr = messages;
		if (q) {
			const term = q.toLowerCase();
			arr = arr.filter((m) =>
				(m.subject && m.subject.toLowerCase().includes(term)) ||
				(m.fromName && m.fromName.toLowerCase().includes(term)) ||
				(m.fromEmail && m.fromEmail.toLowerCase().includes(term))
			);
		}
		switch (filter) {
			case 'assigned':
				arr = arr.filter((m) => !!m.assignedTo);
				break;
			case 'unassigned':
				arr = arr.filter((m) => !m.assignedTo);
				break;
			case 'with_attachments':
				arr = arr.filter((m) => m.hasAttachments);
				break;
			default:
		}
		return arr;
	}, [messages, q, filter]);

	useEffect(() => {
		if (!selectedId && filtered.length > 0) {
			setSelectedId(filtered[0].id);
		}
	}, [filtered, selectedId]);

	const selected = useMemo(() => filtered.find((m) => m.id === selectedId) || null, [filtered, selectedId]);

	function toggleSelect(id: string, withShift: boolean) {
		setSelectedIds((prev) => {
			const next = new Set(prev);
			if (withShift && lastClickedRef.current) {
				const start = filtered.findIndex((m) => m.id === lastClickedRef.current!);
				const end = filtered.findIndex((m) => m.id === id);
				if (start >= 0 && end >= 0) {
					const [a, b] = start < end ? [start, end] : [end, start];
					for (let i = a; i <= b; i++) next.add(filtered[i].id);
				}
			} else {
				if (next.has(id)) next.delete(id); else next.add(id);
				lastClickedRef.current = id;
			}
			return next;
		});
	}

	async function bulkMarkRead(read: boolean) {
		const ids = Array.from(selectedIds);
		if (ids.length === 0) return;
		setMessages((prev) => prev.map((m) => (ids.includes(m.id) ? { ...m, isRead: read } : m)));
		await fetch('/api/inbox/update-meta', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messageIds: ids, meta: { read } }) });
	}

	async function bulkStar(starred: boolean) {
		const ids = Array.from(selectedIds);
		if (ids.length === 0) return;
		setMessages((prev) => prev.map((m) => (ids.includes(m.id) ? { ...m, starred } : m)));
		await fetch('/api/inbox/update-meta', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messageIds: ids, meta: { starred } }) });
	}

	async function bulkTag(tag: string) {
		const ids = Array.from(selectedIds);
		if (ids.length === 0) return;
		setMessages((prev) => prev.map((m) => (ids.includes(m.id) ? { ...m, tags: Array.from(new Set([...(m.tags || []), tag])) } : m)));
		await fetch('/api/inbox/update-meta', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messageIds: ids, meta: { tags: [tag] } }) });
	}

	useEffect(() => {
		function onKey(e: KeyboardEvent) {
			if (e.target && (e.target as HTMLElement).tagName.toLowerCase() === 'input') return;
			if (e.key === 'm') bulkMarkRead(true);
			if (e.key === 'a') {/* open assign UI later */}
			if (e.key === 't') bulkTag('tag');
			if (e.key === 's') bulkStar(true);
		}
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [selectedIds]);

	// keyboard: Enter to open preview focus
	useEffect(() => {
		function onKey(e: KeyboardEvent) {
			if (e.key === 'Enter' && selectedId) {
				const el = document.getElementById('inbox-preview');
				(el as HTMLElement | null)?.focus();
			}
		}
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [selectedId]);

	return (
		<div className="h-full bg-slate-900 text-slate-200 border border-slate-800 rounded-lg overflow-hidden flex flex-col" aria-busy={loading} aria-live="polite">
			<InboxToolbar q={q} onChangeQ={setQ} filter={filter} onChangeFilter={setFilter} />
			<div className="flex-1 flex overflow-hidden min-h-0">
				<div className="w-[24rem] min-w-[20rem] max-w-[26rem] resize-x overflow-auto border-r border-slate-800 h-full">
					{loading ? (
						<div role="status" aria-label="Laden" className="divide-y divide-slate-800">
							{Array.from({ length: 8 }).map((_, i) => (
								<RowSkeleton key={i} />
							))}
						</div>
					) : filtered.length === 0 ? (
						<EmptyState title="Kein Treffer" subtitle="Passen Sie Suche oder Filter an." />
					) : (
						<InboxList
							messages={filtered}
							selectedId={selectedId}
							onSelect={setSelectedId}
						/>
					)}
				</div>
				<div className="flex-1 h-full relative overflow-hidden">
					{loading ? (
						<div className="p-6 text-slate-400">Vorschau wird geladen…</div>
					) : filtered.length === 0 ? (
						<EmptyState title="Nichts ausgewählt" subtitle="Wählen Sie links eine Mail aus." />
					) : (
						<InboxPreview
							message={selected}
							onLeadLinked={(leadId) => {
								if (!selected) return;
								setMessages((prev) => prev.map((m) => (m.id === selected.id ? { ...m, leadId } : m)));
							}}
							onLeadCreated={(leadId) => {
								if (!selected) return;
								setMessages((prev) => prev.map((m) => (m.id === selected.id ? { ...m, leadId } : m)));
							}}
						/>
					)}
					{/* Toggle-Button für Nachricht (links unten) */}
					<button
						className={`absolute bottom-4 left-4 z-10 rounded border px-3 py-2 text-xs hover:bg-slate-800 shadow-lg transition-colors ${
							replyOpen 
								? 'border-slate-600 bg-slate-800 text-slate-300' 
								: 'border-emerald-600 bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30'
						}`}
						onClick={() => setReplyOpen((v) => !v)}
						title={replyOpen ? 'Antwort schließen' : 'Auf diese Mail antworten'}
					>
						{replyOpen ? '✉ Schließen' : '✉ Nachricht'}
					</button>

					{/* Toggle-Button für die Seitenleiste (rechts unten) */}
					<button
						className="absolute bottom-4 right-4 z-10 rounded border border-slate-700 bg-slate-900 px-3 py-2 text-xs hover:bg-slate-800 shadow-lg"
						onClick={() => setSidebarOpen((v) => !v)}
						title={sidebarOpen ? 'Auftragsverwaltung schließen' : 'Auftragsverwaltung öffnen'}
					>
						{sidebarOpen ? '📋 Schließen' : '📋 Öffnen'}
					</button>
				</div>
				<DatasheetSidebar
					message={selected}
					isOpen={sidebarOpen}
					onToggle={() => setSidebarOpen((v) => !v)}
					onOrderResolved={(orderId) => {
						if (!selected) return;
						setMessages((prev) => prev.map((m) => (m.id === selected.id ? { ...m, assignedTo: orderId } : m)));
					}}
				/>

				{/* Reply Composer Modal */}
				{replyOpen && selected && (
					<div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50">
						<div className="w-full max-w-4xl bg-slate-900 border-t border-slate-700 p-4 max-h-[80vh] overflow-y-auto">
							<div className="flex items-center justify-between mb-4">
								<h3 className="text-lg font-semibold">Antwort auf: {selected.subject || 'Ohne Betreff'}</h3>
								<button
									onClick={() => setReplyOpen(false)}
									className="text-slate-400 hover:text-slate-200"
								>
									✕
								</button>
							</div>
							
							<ReplyComposer
								open={replyOpen}
								onClose={() => setReplyOpen(false)}
								threadId={selected.threadId || selected.id}
								defaultBody={''}
								parsedFields={[]}
								initialLangGuess={(selected.lang as any) || 'DE'}
							/>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}


