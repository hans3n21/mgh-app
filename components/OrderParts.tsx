'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Einkaufs-Anbindung im Auftragsdetail: offene Teile zu diesem Auftrag
 * anzeigen und neue direkt mit vorbefüllter Auftrags-Nummer bestellen —
 * vorher musste man die ORD-Nummer im Einkauf von Hand abtippen.
 */

type ProcurementItem = {
	id: string;
	name: string;
	qty: number;
	unit?: string | null;
	status: string;
	link?: string | null;
	neededBy?: string | null;
};

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
	offen: { label: 'Offen', cls: 'bg-amber-900/30 text-amber-300 border-amber-700/50' },
	bestellt: { label: 'Bestellt', cls: 'bg-blue-900/30 text-blue-300 border-blue-700/50' },
	archiviert: { label: 'Eingetroffen', cls: 'bg-emerald-900/30 text-emerald-300 border-emerald-700/50' },
};

export default function OrderParts({ orderId }: { orderId: string }) {
	const [items, setItems] = useState<ProcurementItem[]>([]);
	const [showForm, setShowForm] = useState(false);
	const [name, setName] = useState('');
	const [qty, setQty] = useState(1);
	const [link, setLink] = useState('');
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const load = useCallback(async () => {
		try {
			const res = await fetch(`/api/procurement?orderId=${encodeURIComponent(orderId)}&showArchived=true`);
			if (res.ok) setItems(await res.json());
		} catch {
			// Laden fehlgeschlagen — Block bleibt leer
		}
	}, [orderId]);

	useEffect(() => { void load(); }, [load]);

	const save = async () => {
		if (!name.trim()) { setError('Name fehlt.'); return; }
		setSaving(true);
		setError(null);
		try {
			const res = await fetch('/api/procurement', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: name.trim(), qty, orderId, link: link.trim() || undefined }),
			});
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data?.error ?? 'Speichern fehlgeschlagen');
			}
			setName('');
			setQty(1);
			setLink('');
			setShowForm(false);
			await load();
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen');
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
			<div className="mb-2 flex items-center justify-between">
				<h4 className="text-sm font-semibold text-slate-200">🛒 Teile für diesen Auftrag ({items.length})</h4>
				<button
					type="button"
					onClick={() => setShowForm((prev) => !prev)}
					className="rounded bg-sky-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-sky-500"
				>
					{showForm ? 'Abbrechen' : '+ Teil bestellen'}
				</button>
			</div>

			{showForm && (
				<div className="mb-3 grid gap-2 rounded border border-slate-700 bg-slate-950/60 p-3 sm:grid-cols-[1fr_5rem]">
					<input
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder="Teil, z.B. Schaller Mechaniken 3L3R"
						className="rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-500"
						autoFocus
					/>
					<input
						type="number"
						min={1}
						value={qty}
						onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
						title="Menge"
						className="rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-500"
					/>
					<input
						value={link}
						onChange={(e) => setLink(e.target.value)}
						placeholder="Link zum Shop (optional)"
						className="rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-500 sm:col-span-2"
					/>
					{error && <div className="text-xs text-rose-400 sm:col-span-2">{error}</div>}
					<div className="flex justify-end sm:col-span-2">
						<button
							type="button"
							onClick={save}
							disabled={saving}
							className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
						>
							{saving ? 'Speichert…' : 'In Einkaufsliste'}
						</button>
					</div>
				</div>
			)}

			{items.length === 0 && !showForm && (
				<div className="text-xs text-slate-500">Keine Teile verknüpft.</div>
			)}
			{items.length > 0 && (
				<ul className="divide-y divide-slate-800/60">
					{items.map((item) => {
						const st = STATUS_LABEL[item.status] ?? { label: item.status, cls: 'bg-slate-800 text-slate-300 border-slate-700' };
						return (
							<li key={item.id} className="flex items-center justify-between gap-2 py-1.5">
								<div className="min-w-0 text-sm text-slate-300">
									<span className="text-slate-500">{item.qty}× </span>
									{item.link ? (
										<a href={item.link} target="_blank" rel="noreferrer" className="text-sky-400 hover:text-sky-300">{item.name}</a>
									) : (
										item.name
									)}
								</div>
								<span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] ${st.cls}`}>{st.label}</span>
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
}
