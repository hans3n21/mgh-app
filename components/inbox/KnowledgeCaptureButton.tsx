"use client";
import React, { useState } from 'react';

/**
 * "Als Wissen vorschlagen" — Capture am Ort des Geschehens: Aus einer Mail
 * heraus einen Wissensbasis-Entwurf anlegen (Status "review", Admin gibt
 * später frei). Der Inhalt startet bewusst LEER: Wissenseinträge gehen als
 * KI-Kontext an externe LLMs und sollen allgemeine Fakten enthalten, keine
 * Kundendaten. Der Mail-Text kann optional übernommen werden — dann muss der
 * Nutzer PII selbst entfernen (Warnhinweis im Dialog).
 */

type Props = {
	subject?: string | null;
	mailText?: string | null;
};

function cleanSubject(subject: string): string {
	return subject.replace(/^((re|aw|fwd?|wg)\s*:\s*)+/i, '').trim();
}

export default function KnowledgeCaptureButton({ subject, mailText }: Props) {
	const [open, setOpen] = useState(false);
	const [title, setTitle] = useState('');
	const [keywords, setKeywords] = useState('');
	const [content, setContent] = useState('');
	const [saving, setSaving] = useState(false);
	const [savedId, setSavedId] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	function openDialog() {
		setTitle(subject ? cleanSubject(subject) : '');
		setKeywords('');
		setContent('');
		setSavedId(null);
		setError(null);
		setOpen(true);
	}

	async function save() {
		if (!title.trim() || !content.trim()) {
			setError('Titel und Inhalt sind Pflichtfelder.');
			return;
		}
		setSaving(true);
		setError(null);
		try {
			const res = await fetch('/api/knowledge', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					title: title.trim(),
					keywords: keywords.split(',').map((k) => k.trim()).filter(Boolean),
					content: content.trim(),
					status: 'review',
				}),
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data?.error ?? 'Speichern fehlgeschlagen');
			setSavedId(data.id);
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen');
		} finally {
			setSaving(false);
		}
	}

	return (
		<>
			<button
				type="button"
				onClick={openDialog}
				className="px-1.5 py-0.5 rounded border border-slate-700 text-[11px] text-slate-400 hover:text-slate-200"
				title="Aus dieser Mail einen Wissensbasis-Entwurf anlegen (Review durch Admin)"
			>
				🧠 Wissen
			</button>

			{open && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setOpen(false)}>
					<div
						className="w-full max-w-lg rounded-lg border border-slate-700 bg-slate-900 p-4 shadow-xl"
						onClick={(e) => e.stopPropagation()}
					>
						{savedId ? (
							<div className="space-y-3">
								<h3 className="text-sm font-semibold text-slate-100">✓ Wissensvorschlag gespeichert</h3>
								<p className="text-xs text-slate-400">
									Der Eintrag liegt im Status <span className="text-amber-300">Review</span> und geht erst nach
									Admin-Freigabe in den KI-Kontext ein.
								</p>
								<div className="flex justify-end gap-2">
									<a href="/app/wissen" className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">
										Zur Wissensbasis
									</a>
									<button type="button" onClick={() => setOpen(false)} className="rounded bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500">
										Schließen
									</button>
								</div>
							</div>
						) : (
							<div className="space-y-3">
								<h3 className="text-sm font-semibold text-slate-100">🧠 Als Wissen vorschlagen</h3>
								<p className="text-xs text-slate-500">
									Formuliere den allgemeinen Fakt aus dieser Mail — <span className="text-amber-300">ohne Kundendaten</span> (Name,
									Adresse, Bestellnummer). Der Eintrag gilt für alle Postfächer und wird von der KI als Antwort-Kontext genutzt.
								</p>
								<label className="grid gap-1">
									<span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Titel</span>
									<input
										value={title}
										onChange={(e) => setTitle(e.target.value)}
										className="rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-500"
									/>
								</label>
								<label className="grid gap-1">
									<span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Keywords (optional, kommagetrennt)</span>
									<input
										value={keywords}
										onChange={(e) => setKeywords(e.target.value)}
										placeholder="z.B. versand, lieferzeit"
										className="rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-500"
									/>
								</label>
								<label className="grid gap-1">
									<div className="flex items-center justify-between">
										<span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Inhalt</span>
										{mailText && (
											<button
												type="button"
												onClick={() => setContent((prev) => (prev ? `${prev}\n\n${mailText}` : mailText))}
												className="text-[10px] text-slate-500 hover:text-amber-300"
												title="Mail-Text als Ausgangsbasis einfügen — Kundendaten danach unbedingt entfernen!"
											>
												Mail-Text übernehmen ⚠
											</button>
										)}
									</div>
									<textarea
										value={content}
										onChange={(e) => setContent(e.target.value)}
										rows={8}
										placeholder="Der allgemeine Fakt, z.B.: Trussrodcover fertigen wir auch in Sondergrößen, Lieferzeit dann ca. 2 Wochen."
										className="resize-y rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-sm leading-relaxed text-slate-100 outline-none focus:border-sky-500"
									/>
								</label>
								{error && <div className="text-xs text-rose-400">{error}</div>}
								<div className="flex justify-end gap-2">
									<button type="button" onClick={() => setOpen(false)} className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">
										Abbrechen
									</button>
									<button
										type="button"
										onClick={save}
										disabled={saving}
										className="rounded bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-50"
									>
										{saving ? 'Speichert…' : 'Vorschlagen'}
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
