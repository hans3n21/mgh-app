'use client';

import { useState } from 'react';

interface CreateReturnLabelButtonProps {
	orderId: string;
	className?: string;
}

interface PrefillData {
	customer: {
		name: string;
		street: string;
		houseNumber: string;
		postalCode: string;
		city: string;
		country: string;
		email?: string;
		phone?: string;
	};
	existingTracking: string | null;
	existingCreatedAt: string | null;
}

interface FormState {
	name: string;
	street: string;
	houseNumber: string;
	postalCode: string;
	city: string;
	country: string;
	weightInGrams: string;
}

const EMPTY_FORM: FormState = {
	name: '', street: '', houseNumber: '', postalCode: '', city: '', country: 'DE', weightInGrams: '500',
};

/** Self-contained "Versandlabel erstellen" button — embeddable anywhere with just an orderId. */
export default function CreateReturnLabelButton({ orderId, className }: CreateReturnLabelButtonProps) {
	const [open, setOpen] = useState(false);
	const [loading, setLoading] = useState(false);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [form, setForm] = useState<FormState>(EMPTY_FORM);
	const [existingTracking, setExistingTracking] = useState<string | null>(null);
	const [result, setResult] = useState<{ trackingNumber: string; emailSent: boolean; emailWarning?: string } | null>(null);

	const openModal = async () => {
		setOpen(true);
		setResult(null);
		setError(null);
		setLoading(true);
		try {
			const res = await fetch(`/api/orders/${orderId}/return-label`);
			if (res.ok) {
				const data: PrefillData = await res.json();
				setForm({
					name: data.customer.name || '',
					street: data.customer.street || '',
					houseNumber: data.customer.houseNumber || '',
					postalCode: data.customer.postalCode || '',
					city: data.customer.city || '',
					country: data.customer.country || 'DE',
					weightInGrams: '500',
				});
				setExistingTracking(data.existingTracking);
			} else {
				setError('Adresse konnte nicht geladen werden');
			}
		} catch {
			setError('Adresse konnte nicht geladen werden');
		} finally {
			setLoading(false);
		}
	};

	const closeModal = () => {
		if (saving) return;
		setOpen(false);
	};

	const submit = async () => {
		setSaving(true);
		setError(null);
		try {
			const res = await fetch(`/api/orders/${orderId}/return-label`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					...form,
					weightInGrams: form.weightInGrams ? Number(form.weightInGrams) : undefined,
				}),
			});
			const data = await res.json();
			if (!res.ok) {
				throw new Error(data.error || 'Label konnte nicht erstellt werden');
			}
			setResult(data);
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Unbekannter Fehler');
		} finally {
			setSaving(false);
		}
	};

	return (
		<>
			<button
				type="button"
				onClick={(e) => { e.preventDefault(); e.stopPropagation(); void openModal(); }}
				title="Versandlabel erstellen"
				aria-label="Versandlabel erstellen"
				className={className ?? 'inline-flex h-7 w-7 items-center justify-center rounded border border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-sky-400 transition-colors'}
			>
				📦
			</button>

			{open && (
				<div
					className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4"
					onClick={(e) => { e.preventDefault(); e.stopPropagation(); closeModal(); }}
				>
					<div
						className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-4 shadow-2xl"
						onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
					>
						<h3 className="text-sm font-semibold text-slate-100">Versandlabel erstellen</h3>
						<p className="mt-1 text-xs text-slate-400">
							Versandmarke für den Kunden — Adresse prüfen/korrigieren, dann erstellen. Wird automatisch per Mail an den Kunden geschickt.
						</p>

						{existingTracking && !result && (
							<div className="mt-2 rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-400">
								Bereits erstellt: Tracking-Nr. {existingTracking}
							</div>
						)}

						{result ? (
							<div className="mt-3 space-y-2">
								<div className="rounded border border-emerald-700/50 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-300">
									✓ Label erstellt — Tracking-Nr. {result.trackingNumber}
								</div>
								{result.emailWarning && (
									<div className="rounded border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-xs text-amber-300">
										⚠ {result.emailWarning}
									</div>
								)}
								{result.emailSent && (
									<div className="text-xs text-slate-400">Mail mit Label wurde an den Kunden verschickt.</div>
								)}
								<div className="flex justify-end pt-2">
									<button
										type="button"
										onClick={closeModal}
										className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
									>
										Schließen
									</button>
								</div>
							</div>
						) : loading ? (
							<div className="mt-4 text-xs text-slate-500">Lädt…</div>
						) : (
							<div className="mt-3 space-y-3">
								<div className="grid grid-cols-2 gap-2">
									<label className="col-span-2 space-y-1">
										<span className="text-xs font-medium text-slate-300">Name</span>
										<input
											type="text"
											value={form.name}
											onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
											className="w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-sm text-slate-100"
										/>
									</label>
									<label className="space-y-1">
										<span className="text-xs font-medium text-slate-300">Straße</span>
										<input
											type="text"
											value={form.street}
											onChange={(e) => setForm((prev) => ({ ...prev, street: e.target.value }))}
											className="w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-sm text-slate-100"
										/>
									</label>
									<label className="space-y-1">
										<span className="text-xs font-medium text-slate-300">Hausnummer</span>
										<input
											type="text"
											value={form.houseNumber}
											onChange={(e) => setForm((prev) => ({ ...prev, houseNumber: e.target.value }))}
											className="w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-sm text-slate-100"
										/>
									</label>
									<label className="space-y-1">
										<span className="text-xs font-medium text-slate-300">PLZ</span>
										<input
											type="text"
											value={form.postalCode}
											onChange={(e) => setForm((prev) => ({ ...prev, postalCode: e.target.value }))}
											className="w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-sm text-slate-100"
										/>
									</label>
									<label className="space-y-1">
										<span className="text-xs font-medium text-slate-300">Stadt</span>
										<input
											type="text"
											value={form.city}
											onChange={(e) => setForm((prev) => ({ ...prev, city: e.target.value }))}
											className="w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-sm text-slate-100"
										/>
									</label>
									<label className="space-y-1">
										<span className="text-xs font-medium text-slate-300">Land</span>
										<input
											type="text"
											value={form.country}
											onChange={(e) => setForm((prev) => ({ ...prev, country: e.target.value }))}
											className="w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-sm text-slate-100"
										/>
									</label>
									<label className="space-y-1">
										<span className="text-xs font-medium text-slate-300">Gewicht (g)</span>
										<input
											type="number"
											value={form.weightInGrams}
											onChange={(e) => setForm((prev) => ({ ...prev, weightInGrams: e.target.value }))}
											className="w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-sm text-slate-100"
										/>
									</label>
								</div>

								{error && (
									<div className="rounded border border-red-800/50 bg-red-900/20 px-3 py-2 text-xs text-red-400">{error}</div>
								)}

								<div className="flex items-center justify-end gap-2 pt-1">
									<button
										type="button"
										onClick={closeModal}
										disabled={saving}
										className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-60"
									>
										Abbrechen
									</button>
									<button
										type="button"
										onClick={() => void submit()}
										disabled={saving || !form.name || !form.street || !form.houseNumber || !form.postalCode || !form.city}
										className="rounded-lg border border-sky-700/70 bg-sky-900/30 px-3 py-1.5 text-sm text-sky-200 hover:bg-sky-900/50 disabled:opacity-60"
									>
										{saving ? 'Erstellt…' : 'Label erstellen'}
									</button>
								</div>
							</div>
						)}
					</div>
				</div>
			)}
		</>
	);
}
