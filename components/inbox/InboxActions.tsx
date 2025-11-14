"use client";
import React, { useEffect, useMemo, useState } from 'react';

type Lead = { id: string; type: string; status: string };

type Props = {
	messageId: string;
	threadId?: string;
	leadId?: string | null;
	onLinked: (leadId: string) => void;
	onCreated: (lead: Lead) => void;
};

const leadTypes = ['Hals', 'Body', 'Pickguard', 'Pickups', 'Gravur', 'Finish'];

export default function InboxActions({ messageId, threadId, leadId, onLinked, onCreated }: Props) {
	const [query, setQuery] = useState('');
	const [options, setOptions] = useState<Lead[]>([]);
	const [loading, setLoading] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
	const [newLeadType, setNewLeadType] = useState<string>(leadTypes[0]);
	const [toast, setToast] = useState<string | null>(null);

	useEffect(() => {
		let active = true;
		(async () => {
			setLoading(true);
			try {
				const res = await fetch(`/api/inbox/leads?q=${encodeURIComponent(query)}`);
				if (!active) return;
				if (res.ok) {
					const data = (await res.json()) as Lead[];
					setOptions(data);
				}
			} finally {
				if (active) setLoading(false);
			}
		})();
		return () => {
			active = false;
		};
	}, [query]);

	useEffect(() => {
		if (toast) {
			const t = setTimeout(() => setToast(null), 2000);
			return () => clearTimeout(t);
		}
	}, [toast]);

	const canCreate = !!threadId;
	const alreadyLinked = !!leadId;

	return (
		<div className="flex flex-wrap items-center gap-2">
			{/* Link existing lead */}
			<div className="flex items-center gap-2">
				<div className="relative">
					<input
						type="text"
						placeholder="Lead suchen…"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						className="w-56 rounded-md bg-slate-900 border border-slate-700 px-2 py-1.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-600"
					/>
					{query && options.length > 0 && (
						<div className="absolute z-20 mt-1 w-64 max-h-56 overflow-auto rounded-md border border-slate-700 bg-slate-900 shadow-lg">
							{options.map((o) => (
								<button
									key={o.id}
									onClick={() => setSelectedLead(o)}
									className="w-full text-left px-2 py-1.5 text-sm hover:bg-slate-800"
								>
									{o.id} · {o.type} · {o.status}
								</button>
							))}
						</div>
					)}
					{loading ? <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-500">…</span> : null}
				</div>
				<button
					disabled={!selectedLead || submitting}
					onClick={async () => {
					if (!selectedLead) return;
					setSubmitting(true);
					const old = leadId || null;
					onLinked(selectedLead.id);
					try {
						const res = await fetch('/api/inbox/link-to-lead', {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ messageId, leadId: selectedLead.id }),
						});
						if (!res.ok) throw new Error('Serverfehler');
						setToast(`Mit Lead ${selectedLead.id} verknüpft`);
					} catch (e) {
						onLinked(old || '');
						alert('Fehler beim Verknüpfen');
					} finally {
						setSubmitting(false);
					}
				}}
					className="rounded-md border border-slate-700 px-2 py-1.5 text-sm hover:bg-slate-800 disabled:opacity-50"
				>
					Zu Lead zuordnen
				</button>
			</div>

			{/* Create new lead */}
			<div className="flex items-center gap-2">
				<select
					className="rounded-md bg-slate-900 border border-slate-700 px-2 py-1.5 text-sm"
					value={newLeadType}
					onChange={(e) => setNewLeadType(e.target.value)}
				>
					{leadTypes.map((t) => (
						<option key={t} value={t}>{t}</option>
					))}
				</select>
				<button
					disabled={!canCreate || submitting}
					onClick={async () => {
					if (!threadId) return;
					setSubmitting(true);
					try {
						const res = await fetch('/api/inbox/create-lead', {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ threadId, type: newLeadType }),
						});
						if (!res.ok) throw new Error('Serverfehler');
						const lead = (await res.json()) as Lead;
						onCreated(lead);
						setToast(`Lead ${lead.id} erstellt`);
					} catch (e) {
						alert('Fehler beim Erstellen');
					} finally {
						setSubmitting(false);
					}
				}}
					className="rounded-md bg-sky-600 hover:bg-sky-500 text-white px-3 py-1.5 text-sm disabled:opacity-50"
				>
					Neuen Lead anlegen
				</button>
			</div>

			{alreadyLinked ? (
				<span className="ml-2 text-xs text-emerald-300">Lead #{leadId}</span>
			) : null}

			{toast ? (
				<div className="fixed bottom-4 right-4 rounded bg-slate-800 text-slate-100 border border-slate-700 px-3 py-2 text-sm shadow-lg">
					{toast}
				</div>
			) : null}
		</div>
	);
}


