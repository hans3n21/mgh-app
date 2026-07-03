'use client';

import { useState } from 'react';
import Link from 'next/link';

interface ConflictWarning {
	email: string;
	conflictCustomer: { id: string; name: string };
}

/** Zusätzliche Mailadressen desselben Kunden (z. B. alte + neue Adresse parallel). */
export default function CustomerEmails({
	customerId,
	initialEmails,
}: {
	customerId: string;
	initialEmails: string[];
}) {
	const [emails, setEmails] = useState<string[]>(initialEmails);
	const [newEmail, setNewEmail] = useState('');
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [warnings, setWarnings] = useState<ConflictWarning[]>([]);

	const save = async (next: string[]) => {
		setSaving(true);
		setError(null);
		try {
			const res = await fetch(`/api/customers/${customerId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ additionalEmails: next }),
			});
			const data = await res.json();
			if (!res.ok) {
				setError(data.error || 'Fehler beim Speichern');
				return;
			}
			setEmails(data.additionalEmails || next);
			setWarnings(data.warnings || []);
		} catch {
			setError('Fehler beim Speichern');
		} finally {
			setSaving(false);
		}
	};

	const addEmail = () => {
		const trimmed = newEmail.trim().toLowerCase();
		if (!trimmed) return;
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
			setError('Ungültige E-Mail-Adresse');
			return;
		}
		if (emails.includes(trimmed)) {
			setNewEmail('');
			return;
		}
		setNewEmail('');
		save([...emails, trimmed]);
	};

	const removeEmail = (email: string) => {
		setWarnings((prev) => prev.filter((w) => w.email !== email));
		save(emails.filter((e) => e !== email));
	};

	return (
		<section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
			<h3 className="mb-2 text-sm font-semibold text-slate-200">✉ Weitere Mailadressen</h3>
			<p className="mb-2 text-xs text-slate-500">
				Zusätzliche Adressen desselben Kunden (z. B. alte + neue Adresse) — Mails von/an diese Adressen zählen in Suche und Zuordnung zu diesem Kunden.
			</p>

			{emails.length > 0 && (
				<ul className="mb-2 space-y-1">
					{emails.map((email) => {
						const warning = warnings.find((w) => w.email === email);
						return (
							<li key={email} className="flex flex-col gap-1">
								<div className="flex items-center justify-between gap-2 rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-sm">
									<span className="truncate text-slate-200">{email}</span>
									<button
										type="button"
										onClick={() => removeEmail(email)}
										disabled={saving}
										className="shrink-0 text-slate-500 hover:text-red-400 disabled:opacity-50"
										title="Adresse entfernen"
									>
										✕
									</button>
								</div>
								{warning && (
									<div className="rounded border border-amber-700/50 bg-amber-950/30 px-2.5 py-1 text-xs text-amber-300">
										⚠ Diese Adresse ist bereits bei{' '}
										<Link href={`/app/customers/${warning.conflictCustomer.id}`} className="underline hover:text-amber-200">
											{warning.conflictCustomer.name}
										</Link>{' '}
										hinterlegt.
									</div>
								)}
							</li>
						);
					})}
				</ul>
			)}

			<div className="flex gap-2">
				<input
					type="email"
					value={newEmail}
					onChange={(e) => { setNewEmail(e.target.value); setError(null); }}
					onKeyDown={(e) => { if (e.key === 'Enter') addEmail(); }}
					placeholder="weitere.adresse@beispiel.de"
					disabled={saving}
					className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-500 disabled:opacity-50"
				/>
				<button
					type="button"
					onClick={addEmail}
					disabled={saving || !newEmail.trim()}
					className="shrink-0 rounded bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-50"
				>
					{saving ? 'Speichert…' : 'Hinzufügen'}
				</button>
			</div>
			{error && <div className="mt-1.5 text-xs text-red-400">{error}</div>}
		</section>
	);
}
