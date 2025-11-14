"use client";
import { useEffect, useMemo, useState } from 'react';
import ImageCarouselModal from '@/components/ImageCarouselModal';

type Attachment = {
	id: string;
	filename: string;
	mimeType: string | null;
	size: number | null;
	storagePath: string;
};

type Mail = {
	id: string;
	messageId: string;
	fromName: string | null;
	fromEmail: string | null;
	subject: string | null;
	date: string | null;
	hasAttachments: boolean;
	parsedData: Record<string, unknown> | null;
	orderId: string | null;
	attachments: Attachment[];
	order?: { id: string; title: string | null } | null;
};

type Order = { id: string; title: string };

type Filter = 'all' | 'assigned' | 'unassigned' | 'with_attachments';

export default function InboxClient() {
	const [mails, setMails] = useState<Mail[]>([]);
	const [q, setQ] = useState('');
	const [filter, setFilter] = useState<Filter>('all');
	const [loading, setLoading] = useState(false);
	const [selected, setSelected] = useState<Mail | null>(null);
	const [orders, setOrders] = useState<Order[]>([]);
	const [savingAssign, setSavingAssign] = useState(false);
	const [lightboxOpen, setLightboxOpen] = useState(false);
	const [lightboxIndex, setLightboxIndex] = useState(0);

	async function fetchMails() {
		setLoading(true);
		try {
			const url = new URL('/api/mails', window.location.origin);
			if (q) url.searchParams.set('q', q);
			if (filter) url.searchParams.set('filter', filter);
			const res = await fetch(url.toString());
			const data = await res.json();
			setMails(data);
		} finally {
			setLoading(false);
		}
	}

	useEffect(() => {
		fetchMails();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [q, filter]);

	useEffect(() => {
		(async () => {
			const res = await fetch('/api/orders');
			const data = await res.json();
			setOrders(data.map((o: any) => ({ id: o.id, title: o.title })));
		})();
	}, []);

	const rows = useMemo(() => mails, [mails]);

	async function assignToOrder(mail: Mail, orderId: string | null) {
		setSavingAssign(true);
		try {
			const res = await fetch(`/api/mails/${mail.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ orderId }),
			});
			const updated = await res.json();
			setMails((prev) => prev.map((m) => (m.id === mail.id ? { ...m, ...updated } : m)));
			setSelected((prev) => (prev && prev.id === mail.id ? { ...prev, ...updated } : prev));
		} finally {
			setSavingAssign(false);
		}
	}

	return (
		<div className="p-4 space-y-4">
			<div className="flex items-center gap-2">
				<input
					type="text"
					placeholder="Suche Betreff/Absender"
					value={q}
					onChange={(e) => setQ(e.target.value)}
					className="rounded-lg bg-slate-900 border border-slate-700 px-3 py-1.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-600"
				/>
				<div className="flex gap-1">
					{([
						['all', 'Alle'],
						['assigned', 'Zugeordnet'],
						['unassigned', 'Nicht zugeordnet'],
						['with_attachments', 'Mit Anhängen'],
					] as Array<[Filter, string]>).map(([key, label]) => (
						<button
							key={key}
							onClick={() => setFilter(key)}
						className={`px-2 py-1 rounded-lg border text-sm transition-colors ${
							filter === key ? 'bg-sky-600 border-sky-600 text-white' : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
						}`}
						>
							{label}
						</button>
					))}
				</div>
			</div>

			<div className="overflow-auto border border-slate-800 rounded-lg bg-slate-900">
				<table className="min-w-full text-sm text-slate-200">
					<thead className="bg-slate-800/50 text-slate-400">
						<tr>
							<th className="text-left p-2">Von</th>
							<th className="text-left p-2">Betreff</th>
							<th className="text-left p-2">Datum</th>
							<th className="text-left p-2">📎</th>
							<th className="text-left p-2">🔗</th>
							<th className="text-left p-2">🧩</th>
						</tr>
					</thead>
					<tbody>
						{loading ? (
							<tr><td className="p-2" colSpan={6}>Lade…</td></tr>
						) : rows.length === 0 ? (
							<tr><td className="p-2" colSpan={6}>Keine Einträge</td></tr>
						) : (
							rows.map((m) => (
								<tr key={m.id} className="cursor-pointer border-t border-slate-800 hover:bg-slate-800/50" onClick={() => setSelected(m)}>
									<td className="p-2">{m.fromName || m.fromEmail || '–'}</td>
									<td className="p-2">{m.subject || '–'}</td>
									<td className="p-2">{m.date ? new Date(m.date).toLocaleString() : '–'}</td>
									<td className="p-2">{m.hasAttachments ? '📎' : ''}</td>
									<td className="p-2">{m.orderId ? '🔗' : ''}</td>
									<td className="p-2">{m.parsedData ? '🧩' : ''}</td>
								</tr>
							))
						)}
					</tbody>
				</table>
			</div>

			{selected && (
				<>
				<div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setSelected(null)}>
					<div className="w-full max-w-5xl max-h-[90vh] bg-slate-900 text-slate-200 border border-slate-800 rounded-xl shadow-xl overflow-auto" onClick={(e) => e.stopPropagation()}>
						<div className="flex items-center justify-between gap-2">
							<h2 className="text-lg font-semibold">{selected.subject || 'Ohne Betreff'}</h2>
							<button onClick={() => setSelected(null)} className="px-2 py-1 rounded-lg border border-slate-700 hover:bg-slate-800">Schließen</button>
						</div>

						<div className="mt-2 text-sm text-slate-400">Von: {selected.fromName || selected.fromEmail || '–'} | Datum: {selected.date ? new Date(selected.date).toLocaleString() : '–'}</div>

						<div className="mt-4">
							<div className="flex gap-2 items-center">
								<label className="text-sm text-slate-300">Zuordnen zu Auftrag:</label>
								
								{/* Zum Auftrag Button - nur wenn Auftrag zugeordnet ist */}
								{selected.orderId && (
									<button
										className="px-2 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm"
										onClick={() => {
											console.log('Navigiere zu Auftrag:', selected.orderId);
											window.open(`/app/orders/${selected.orderId}`, '_blank');
										}}
										title="Zum zugeordneten Auftrag wechseln"
									>
										→ Zum Auftrag
									</button>
								)}
								
								{/* Debug: Zeige orderId Wert */}
								{process.env.NODE_ENV === 'development' && (
									<span className="text-xs text-red-400">
										Debug: orderId = {selected.orderId || 'null'}
									</span>
								)}
								
								<select
									className="rounded-lg bg-slate-900 border border-slate-700 text-slate-200 px-2 py-1"
									value={selected.orderId || ''}
									onChange={(e) => assignToOrder(selected, e.target.value || null)}
									disabled={savingAssign}
								>
									<option value="">Nicht zugeordnet</option>
									{orders.map((o) => (
										<option key={o.id} value={o.id}>{o.id} {o.title ? `– ${o.title}` : ''}</option>
									))}
								</select>
								<button
									className="px-2 py-1 rounded-lg border border-slate-700 hover:bg-slate-800"
									onClick={async () => {
										if (!selected) return;
										// Legt Order aus Mail an und verknüpft Mail→Order
										const res = await fetch('/api/orders', {
											method: 'PUT',
											headers: { 'Content-Type': 'application/json' },
											body: JSON.stringify({ mailId: selected.id }),
										});
										if (res.ok) {
											const order = await res.json();
											await assignToOrder(selected, order.id);
											window.open(`/app/orders/${order.id}`, '_blank');
										} else {
											const data = await res.json().catch(() => ({}));
											alert(`Auftragserstellung fehlgeschlagen: ${data.error || res.status}`);
										}
									}}
								>
									Neu anlegen
								</button>
							</div>
						</div>

						<div className="mt-6 p-2">
							<div className="flex gap-2 text-sm">
								<button className="px-2 py-1 rounded-lg border border-slate-700 hover:bg-slate-800">Mail</button>
								<button className="px-2 py-1 rounded-lg border border-slate-700 hover:bg-slate-800">Erkannte Felder</button>
								<button className="px-2 py-1 rounded-lg border border-slate-700 hover:bg-slate-800">Anhänge</button>
							</div>

							<div className="mt-4 space-y-6">
								<section>
									<h3 className="font-medium">Mail</h3>
									<pre className="whitespace-pre-wrap text-sm rounded-lg border border-slate-800 p-2 bg-slate-950 max-h-64 overflow-auto">{String((selected as any).text || '').slice(0, 5000)}</pre>
								</section>

								<section>
									<h3 className="font-medium">Erkannte Felder</h3>
									{selected.parsedData ? (
										<div className="grid grid-cols-2 gap-2 text-sm">
											{Object.entries(selected.parsedData).map(([k, v]) => (
												<label key={k} className="flex flex-col gap-1">
												<span className="text-xs text-slate-400">{k}</span>
												<input className="rounded-lg bg-slate-900 border border-slate-700 text-slate-200 px-2 py-1" defaultValue={String(v ?? '')} />
												</label>
											))}
										</div>
									) : (
										<div className="text-sm text-slate-400">Keine erkannten Felder</div>
									)}
									<div className="mt-2 flex gap-2">
										<button
											className="px-2 py-1 rounded-lg border border-slate-700 hover:bg-slate-800"
											onClick={async () => {
											if (!selected) return;
											const res = await fetch('/api/datasheets/create', {
												method: 'POST',
												headers: { 'Content-Type': 'application/json' },
												body: JSON.stringify({ mailId: selected.id }),
											});
											const data = await res.json();
											if (res.ok) {
												alert('Datenblatt erstellt');
												window.open(`/app/orders/${data.orderId}`, '_blank');
											} else {
												alert(`Fehler: ${data.error || 'Unbekannt'}`);
											}
										}}
										>
											Datenblatt erstellen
										</button>
									</div>
								</section>

								<section>
									<h3 className="font-medium">Anhänge</h3>
									{selected.attachments.length === 0 ? (
										<div className="text-sm text-slate-400">Keine Anhänge</div>
									) : (
										<div className="flex flex-wrap gap-2">
											{selected.attachments.map((a, idx) => (
												<button
													key={a.id}
													onClick={() => { setLightboxIndex(idx); setLightboxOpen(true); }}
													className="group relative h-20 w-20 overflow-hidden rounded border border-slate-700 bg-slate-800"
													title={a.filename}
												>
													<img src={`/api/attachments/${a.id}`} className="h-full w-full object-cover" />
													<span className="absolute inset-0 hidden group-hover:flex items-center justify-center bg-black/30 text-white text-xs">Ansehen</span>
												</button>
											))}
										</div>
									)}
								</section>
							</div>
						</div>
					</div>
				</div>
				{lightboxOpen && (
					<ImageCarouselModal
						images={selected.attachments.map((a) => ({ id: a.id, path: `/api/attachments/${a.id}`, comment: a.filename, scope: undefined, attach: true, position: 0 }))}
						index={lightboxIndex}
						scopes={[]}
						onClose={() => setLightboxOpen(false)}
						onUpdate={async () => { /* no-op for mail preview */ }}
						onDelete={async () => { /* no-op for mail preview */ }}
					/>
				)}
				</>
			)}
		</div>
	);
}


