'use client';

import { useEffect, useState } from 'react';

/** Freitext-Notizen zum Kunden — nutzt die bestehende Note-API (SystemSetting). */
export default function CustomerNotes({ customerId }: { customerId: string }) {
	const [note, setNote] = useState('');
	const [loaded, setLoaded] = useState(false);
	const [saving, setSaving] = useState(false);
	const [savedAt, setSavedAt] = useState<number | null>(null);

	useEffect(() => {
		fetch(`/api/customers/${customerId}/note`)
			.then((r) => (r.ok ? r.json() : { note: '' }))
			.then((d) => { setNote(d.note || ''); setLoaded(true); })
			.catch(() => setLoaded(true));
	}, [customerId]);

	const save = async () => {
		setSaving(true);
		try {
			const res = await fetch(`/api/customers/${customerId}/note`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ note }),
			});
			if (res.ok) setSavedAt(Date.now());
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
			<div className="mb-2 flex items-center justify-between">
				<h3 className="text-sm font-semibold text-slate-200">📝 Notizen</h3>
				{savedAt && <span className="text-[11px] text-emerald-400">Gespeichert</span>}
			</div>
			<textarea
				value={note}
				onChange={(e) => { setNote(e.target.value); setSavedAt(null); }}
				rows={5}
				disabled={!loaded}
				placeholder="Interne Notizen zum Kunden (Vorlieben, Absprachen, Besonderheiten)…"
				className="w-full resize-y rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm leading-relaxed text-slate-100 outline-none focus:border-sky-500 disabled:opacity-50"
			/>
			<div className="mt-2 flex justify-end">
				<button
					type="button"
					onClick={save}
					disabled={saving || !loaded}
					className="rounded bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-50"
				>
					{saving ? 'Speichert…' : 'Notiz speichern'}
				</button>
			</div>
		</div>
	);
}
