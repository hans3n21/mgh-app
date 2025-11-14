"use client";
import React, { useEffect, useMemo, useState } from 'react';
import { detectLang } from '@/lib/lang/detectLang';
import type { ParsedField } from '@/lib/inbox/rules';

type Template = { id: string; key: string; lang: string; body: string; variables?: string[] };

type Props = {
	open: boolean;
	onClose: () => void;
	threadId: string;
	defaultBody?: string;
	parsedFields?: ParsedField[];
	initialLangGuess?: 'DE' | 'EN';
};

function renderTemplate(tpl: string, values: Record<string, string>) {
	return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (values[k] ?? ''));
}

export default function ReplyComposer({ open, onClose, threadId, defaultBody = '', parsedFields = [], initialLangGuess }: Props) {
	const [lang, setLang] = useState<'de' | 'en'>(() => (initialLangGuess || detectLang(defaultBody)) === 'DE' ? 'de' : 'en');
	const [templates, setTemplates] = useState<Template[]>([]);
	const [selectedTpl, setSelectedTpl] = useState<Template | null>(null);
	const [values, setValues] = useState<Record<string, string>>({});
	const [body, setBody] = useState('');
	const [sending, setSending] = useState(false);

	useEffect(() => {
		let active = true;
		(async () => {
			const res = await fetch(`/api/inbox/templates?lang=${lang}`);
			if (!active) return;
			if (res.ok) setTemplates(await res.json());
		})();
		return () => { active = false; };
	}, [lang]);

	useEffect(() => {
		if (!selectedTpl) return;
		const defaults: Record<string, string> = {};
		for (const f of parsedFields) {
			if (f.key === 'griffbrett') defaults.firstName ||= '';
			if (f.key === 'mensur') defaults.mensur ||= f.value;
		}
		setValues((prev) => ({ ...defaults, ...prev }));
	}, [selectedTpl, parsedFields]);

	useEffect(() => {
		if (!selectedTpl) return;
		setBody(renderTemplate(selectedTpl.body, values));
	}, [selectedTpl, values]);

	const variables = useMemo(() => (selectedTpl?.variables || []) as string[], [selectedTpl]);

	return (
		<div className={`${open ? '' : 'hidden'}`}>
			<div className="p-4 space-y-4 border-t border-slate-800 bg-slate-950">
					<div className="flex items-center gap-2">
						<label className="text-sm text-slate-300">Sprache:</label>
						<select value={lang} onChange={(e) => setLang(e.target.value as any)} className="rounded bg-slate-900 border border-slate-700 px-2 py-1 text-sm">
							<option value="de">Deutsch</option>
							<option value="en">English</option>
						</select>
						<label className="text-sm text-slate-300 ml-4">Template:</label>
						<select value={selectedTpl?.id || ''} onChange={(e) => setSelectedTpl(templates.find(t => t.id === e.target.value) || null)} className="rounded bg-slate-900 border border-slate-700 px-2 py-1 text-sm">
							<option value="">— auswählen —</option>
							{templates.map((t) => (
								<option key={t.id} value={t.id}>{t.key}</option>
							))}
						</select>
					</div>

					{variables.length > 0 ? (
						<div className="grid grid-cols-2 gap-3">
							{variables.map((v) => (
								<label key={v} className="text-xs text-slate-300">
									<span className="block mb-1">{v}</span>
									<input value={values[v] || ''} onChange={(e) => setValues((prev) => ({ ...prev, [v]: e.target.value }))} className="w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-sm" />
								</label>
							))}
						</div>
					) : null}

					<div>
						<label className="text-sm text-slate-300">Nachricht</label>
						<textarea value={body} onChange={(e) => setBody(e.target.value)} rows={12} className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-3 py-2 text-sm" />
					</div>

					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2">
							<button onClick={() => { setSelectedTpl(templates.find(t => t.key === 'pickguard_quote') || null); }} className="text-xs rounded border border-slate-700 px-2 py-1 hover:bg-slate-800">Pickguard-Preis senden</button>
						</div>
						<button
							disabled={!body.trim() || sending}
							onClick={async () => {
							setSending(true);
							try {
								const res = await fetch('/api/inbox/reply', {
									method: 'POST',
									headers: { 'Content-Type': 'application/json' },
									body: JSON.stringify({ threadId, body }),
								});
								if (res.ok) onClose();
							} finally {
								setSending(false);
							}
						}}
						className="rounded bg-sky-600 hover:bg-sky-500 text-white px-3 py-1.5 text-sm disabled:opacity-50"
						>
							Senden
						</button>
					</div>
			</div>
		</div>
	);
}


