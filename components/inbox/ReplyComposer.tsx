"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { detectLang } from '@/lib/lang/detectLang';
import type { ParsedField } from '@/lib/inbox/rules';
import VoiceInputButton from '@/components/VoiceInputButton';
import AiToolbar from '@/components/mail/AiToolbar';
import SmartReply from '@/components/mail/SmartReply';
import PriceCheckBanner from '@/components/mail/PriceCheckBanner';
import { textToSafeHtml } from '@/lib/mail/linkify';
import { DATASHEET_TYPE_LABELS } from '@/lib/customer-datasheet';
import type { PriceValidationHint } from '@/lib/ai/price-matcher';

type Template = { id: string; key: string; lang: string; body: string; subject?: string | null; variables?: string[] };
type LinkedAttachment = { id: string; name?: string };

type Props = {
	open: boolean;
	onClose: () => void;
	mailId: string;
	defaultSubject?: string;
	defaultTo?: string;
	defaultBody?: string;
	parsedFields?: ParsedField[];
	initialLangGuess?: 'DE' | 'EN';
	accountId?: string;
	originalMailText?: string;
	customerName?: string;
	/** Auftrag, dem die Mail zugeordnet ist — bestimmt die Vorbelegung des Datenblatts */
	orderId?: string | null;
};

function renderTemplate(tpl: string, values: Record<string, string>) {
	return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (values[k] ?? ''));
}

async function filesToPayload(files: File[]): Promise<Array<{ name: string; contentType: string; content: string }>> {
	const enc = (f: File) => new Promise<{ name: string; contentType: string; content: string }>((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve({ name: f.name, contentType: f.type, content: String(reader.result).split(',').pop() || '' });
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(f);
	});
	return Promise.all(files.map(enc));
}

type ToastType = 'success' | 'error' | 'warn' | 'info';

export default function ReplyComposer({ open, onClose, mailId, defaultSubject = '', defaultTo, defaultBody = '', parsedFields = [], initialLangGuess, accountId, originalMailText, customerName, orderId }: Props) {
	const [lang, setLang] = useState<'de' | 'en'>(() => (initialLangGuess || detectLang(defaultBody)) === 'DE' ? 'de' : 'en');
	const [templates, setTemplates] = useState<Template[]>([]);
	const [selectedTpl, setSelectedTpl] = useState<Template | null>(null);
	const [values, setValues] = useState<Record<string, string>>({});
	const [subject, setSubject] = useState(defaultSubject);
	const [body, setBody] = useState(defaultBody);
	const [sending, setSending] = useState(false);
	const [files, setFiles] = useState<File[]>([]);
	const [linkedAttachments, setLinkedAttachments] = useState<LinkedAttachment[]>([]);
	// Ausfuellbares Kunden-Datenblatt. Das PDF entsteht erst beim Senden auf dem
	// Server — hier steht nur, welches angehaengt werden soll.
	const [datasheet, setDatasheet] = useState<{ orderId?: string; type?: string } | null>(null);
	const [datasheetType, setDatasheetType] = useState('GUITAR');
	const [bulletsBusy, setBulletsBusy] = useState(false);
	const [translateBusy, setTranslateBusy] = useState(false);
	const [toast, setToast] = useState<{ text: string; type: ToastType } | null>(null);
	const [showExtras, setShowExtras] = useState<'template' | 'translate' | 'bullets' | 'attach' | null>(null);
	const [showAiTools, setShowAiTools] = useState(true);
	const [bullets, setBullets] = useState('');
	const fileInputRef = useRef<HTMLInputElement | null>(null);
	const textareaRef = useRef<HTMLTextAreaElement | null>(null);
	const [dragOver, setDragOver] = useState(false);
	const [userName, setUserName] = useState<string>('');
	const [hasAiProfile, setHasAiProfile] = useState(false);
	const [bulletsPriceCheck, setBulletsPriceCheck] = useState<{ text: string; hints: PriceValidationHint[] } | null>(null);

	useEffect(() => {
		fetch('/api/auth/session')
			.then(r => r.ok ? r.json() : null)
			.then(s => { if (s?.user?.name) setUserName(s.user.name); })
			.catch(() => {});
	}, []);

	useEffect(() => { setSubject(defaultSubject); }, [defaultSubject]);
	useEffect(() => { setBody(defaultBody); }, [defaultBody]);
	useEffect(() => { setShowAiTools(true); }, [mailId]);

	useEffect(() => {
		if (!accountId) return;
		fetch(`/api/mail-accounts/${accountId}/ai-profile`)
			.then((r) => r.ok ? r.json() : null)
			.then((data) => setHasAiProfile(!!data?.id))
			.catch(() => {});
	}, [accountId]);

	const getText = useCallback(() => body, [body]);
	const setText = useCallback((text: string) => setBody(text), []);

	useEffect(() => {
		let active = true;
		const params = new URLSearchParams({ lang });
		if (accountId) params.set('accountId', accountId);
		fetch(`/api/inbox/templates?${params}`)
			.then(r => r.ok ? r.json() : [])
			.then(data => { if (active) setTemplates(data); })
			.catch(() => {});
		return () => { active = false; };
	}, [lang, accountId]);

	useEffect(() => {
		if (!selectedTpl) return;
		const defaults: Record<string, string> = {};
		for (const f of parsedFields) {
			if (f.key === 'mensur') defaults.mensur ||= f.value;
		}
		setValues((prev) => ({ ...defaults, ...prev }));
	}, [selectedTpl, parsedFields]);

	useEffect(() => {
		if (!selectedTpl) return;
		setBody(renderTemplate(selectedTpl.body, values));
		if (selectedTpl.subject) setSubject(renderTemplate(selectedTpl.subject, values));
	}, [selectedTpl, values]);

	useEffect(() => {
		if (!toast) return;
		const t = setTimeout(() => setToast(null), 3500);
		return () => clearTimeout(t);
	}, [toast]);

	const variables = useMemo(() => (selectedTpl?.variables || []) as string[], [selectedTpl]);
	const attachCount = files.length + linkedAttachments.length + (datasheet ? 1 : 0);

	function showToast(text: string, type: ToastType = 'info') { setToast({ text, type }); }

	function handleDrop(e: React.DragEvent) {
		e.preventDefault();
		setDragOver(false);
		const fileList = Array.from(e.dataTransfer.files || []);
		if (fileList.length > 0) setFiles((prev) => [...prev, ...fileList]);
		const attachmentId = e.dataTransfer.getData('text/attachment-id');
		const attachmentName = e.dataTransfer.getData('text/attachment-name');
		if (attachmentId) {
			setLinkedAttachments((prev) => {
				if (prev.some((a) => a.id === attachmentId)) return prev;
				return [...prev, { id: attachmentId, name: attachmentName || undefined }];
			});
		}
	}

	async function translateBody(targetLang: 'de' | 'en') {
		if (!body.trim() || translateBusy) return;
		setTranslateBusy(true);
		try {
			const res = await fetch('/api/inbox/translate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ text: body, sourceLang: lang, targetLang, mailId }),
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok || data?.error || !data?.text) throw new Error(data?.error || 'Übersetzung fehlgeschlagen');
			setBody(data.text);
			setLang(targetLang);
			showToast(`Übersetzt auf ${targetLang.toUpperCase()}`, 'success');
		} catch (e) {
			showToast(e instanceof Error ? e.message : 'Übersetzung fehlgeschlagen', 'error');
		} finally {
			setTranslateBusy(false);
		}
	}

	async function bulletsToText() {
		if (!bullets.trim() || bulletsBusy) return;
		setBulletsBusy(true);
		setBulletsPriceCheck(null);
		try {
		const res = await fetch('/api/compose-message', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				text: bullets,
				mode: 'bullets',
				language: lang,
				mailId,
				accountId,
				originalMailText: originalMailText || undefined,
				customerName: customerName || undefined,
				userName: userName || undefined,
			}),
		});
			const data = await res.json().catch(() => ({}));
			if (data?.text) {
				const combined = body ? `${body}\n\n${data.text}` : data.text;
				setBody(combined);
				if (data?.subject) setSubject(data.subject);
				if (data?.priceValidation?.length > 0) {
					setBulletsPriceCheck({ text: combined, hints: data.priceValidation });
				}
				showToast('Stichpunkte formuliert', 'success');
			} else {
				setBody((prev) => prev ? `${prev}\n\n${bullets}` : bullets);
				showToast('N8N nicht konfiguriert – Stichpunkte eingefügt', 'warn');
			}
		} catch (e) {
			showToast(e instanceof Error ? e.message : 'Fehler', 'error');
		} finally {
			setBulletsBusy(false);
		}
	}

	async function send() {
		if (sending || !subject.trim() || !body.trim()) return;
		setSending(true);
		try {
			const attachments = [
				...linkedAttachments.map((a) => ({ id: a.id })),
				...(datasheet ? [{ datasheet }] : []),
				...(await filesToPayload(files)),
			];
			const html = textToSafeHtml(body);
			const res = await fetch(`/api/mails/${mailId}/reply`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ to: defaultTo, subject, text: body, html, attachments: attachments.length > 0 ? attachments : undefined }),
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(data?.error || 'Senden fehlgeschlagen');

			if (data?.mode === 'dry-run') {
				showToast('SMTP nicht konfiguriert – bitte in den Einstellungen SMTP-Daten hinterlegen.', 'error');
				return;
			}

			showToast('Antwort gesendet', 'success');
			setBody('');
			setFiles([]);
			setLinkedAttachments([]);
			setDatasheet(null);
			setBullets('');
			setShowExtras(null);
			if (fileInputRef.current) fileInputRef.current.value = '';
			window.dispatchEvent(new CustomEvent('mail-sent'));
			onClose();
		} catch (e) {
			showToast(e instanceof Error ? e.message : 'Senden fehlgeschlagen', 'error');
		} finally {
			setSending(false);
		}
	}

	if (!open) return null;

	const toastColors: Record<ToastType, string> = {
		success: 'border-emerald-600 bg-emerald-950 text-emerald-200',
		error: 'border-rose-600 bg-rose-950 text-rose-200',
		warn: 'border-amber-600 bg-amber-950 text-amber-200',
		info: 'border-slate-600 bg-slate-900 text-slate-200',
	};

	return (
		<div
			className="flex flex-col h-full rounded-xl border border-slate-700/70 bg-[linear-gradient(180deg,rgba(30,41,59,0.55)_0%,rgba(15,23,42,0.75)_100%)] shadow-[0_10px_30px_rgba(2,6,23,0.45),inset_0_1px_0_rgba(148,163,184,0.08)] overflow-hidden"
			onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
			onDragLeave={() => setDragOver(false)}
			onDrop={handleDrop}
		>
			{/* An: + Betreff */}
			<div className="flex items-center gap-2 px-3 py-2 border-b border-slate-700/70 text-sm flex-shrink-0 bg-slate-900/35 backdrop-blur-sm">
				<span className="text-slate-500 text-xs w-8">An:</span>
				<span className="text-slate-300 truncate flex-1">{defaultTo || '–'}</span>
				<select
					value={lang}
					onChange={(e) => setLang(e.target.value as 'de' | 'en')}
					className="bg-slate-900/55 border border-slate-700 rounded px-1.5 py-0.5 text-[11px] text-slate-300 cursor-pointer hover:border-slate-500"
				>
					<option value="de">DE</option>
					<option value="en">EN</option>
				</select>
			</div>
			<div className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-700/70 text-sm flex-shrink-0 bg-slate-900/30 backdrop-blur-sm">
				<span className="text-slate-500 text-xs w-8">Betr:</span>
				<input
					value={subject}
					onChange={(e) => setSubject(e.target.value)}
					className="flex-1 bg-slate-900/45 text-slate-200 text-sm outline-none placeholder:text-slate-600 rounded px-2 py-1"
					placeholder="Betreff"
				/>
			</div>

		{/* AI-Toolbar */}
		{hasAiProfile && (
			<div className="px-3 py-2 border-b border-slate-700/50 bg-slate-900/20 flex-shrink-0 space-y-1.5">
				<div className="flex items-center justify-between gap-2">
					<span className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">KI-Antwort</span>
					<button
						type="button"
						onClick={() => setShowAiTools((v) => !v)}
						className={`rounded border px-2 py-0.5 text-[11px] transition-colors ${
							showAiTools
								? 'border-slate-600 bg-slate-800 text-slate-200'
								: 'border-slate-800 bg-slate-950/40 text-slate-400 hover:border-slate-600 hover:text-slate-200'
						}`}
						title="Text verbessern, ausformulieren, uebersetzen oder eine KI-Vorlage auswaehlen"
					>
						{showAiTools ? 'Werkzeuge ausblenden' : 'Textwerkzeuge'}
					</button>
				</div>
				<SmartReply
					mailAccountId={accountId ?? null}
					hasAiProfile={hasAiProfile}
					incomingMail={originalMailText ?? ''}
					customerName={customerName}
					mailId={mailId}
					onInsert={(text) => setBody(text)}
					getCurrentText={getText}
				/>
				{showAiTools && (
					<AiToolbar
						mailAccountId={accountId ?? null}
						hasAiProfile={hasAiProfile}
						getText={getText}
						setText={setText}
						originalMail={originalMailText}
						customerName={customerName}
						mailId={mailId}
					/>
				)}
			</div>
		)}

		{/* Template-Variablen (nur wenn Template ausgewählt) */}
		{variables.length > 0 && (
				<div className="px-3 py-2 border-b border-slate-800 flex flex-wrap gap-2">
					{variables.map((v) => (
						<label key={v} className="flex items-center gap-1 text-xs">
							<span className="text-slate-500">{v}:</span>
							<input
								value={values[v] || ''}
								onChange={(e) => setValues((prev) => ({ ...prev, [v]: e.target.value }))}
								className="bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-xs text-slate-200 w-24"
							/>
						</label>
					))}
				</div>
			)}

			{/* Nachricht-Textarea */}
			<div className="flex-1 min-h-0 relative bg-slate-900/20">
			<textarea
				ref={textareaRef}
				value={body}
				onChange={(e) => setBody(e.target.value)}
				onKeyDown={(e) => {
					// Ctrl+Enter oder Cmd+Enter → Senden
					if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
						e.preventDefault();
						send();
						return;
					}
					// Normales Enter → Zeilenumbruch (Browser-Standard, nichts blockieren)
				}}
				className="w-full h-full resize-none bg-slate-900/40 text-sm text-slate-100 px-3 py-2 outline-none placeholder:text-slate-500"
				placeholder="Nachricht schreiben…"
			/>
				{dragOver && (
					<div className="absolute inset-0 bg-sky-900/15 border-2 border-dashed border-sky-400/70 rounded flex items-center justify-center pointer-events-none z-10">
						<span className="text-sky-200 text-sm">Dateien hier ablegen</span>
					</div>
				)}
			</div>

			{bulletsPriceCheck && (
				<div className="px-3 py-1.5 border-t border-slate-800/70">
					<PriceCheckBanner
						text={bulletsPriceCheck.text}
						hints={bulletsPriceCheck.hints}
						getCurrentText={getText}
						onFix={setText}
					/>
				</div>
			)}

			{/* Extras-Bereich (aufklappbar) */}
			{showExtras === 'template' && (
				<div className="px-3 py-2 border-t border-slate-800 bg-slate-900/50 space-y-2">
					<div className="flex items-center gap-2">
						<select
						value={selectedTpl?.id || ''}
						onChange={(e) => setSelectedTpl(templates.find(t => t.id === e.target.value) || null)}
						className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
					>
						<option value="">Vorlage wählen…</option>
						{templates.some((t: any) => t.suggested) && (
							<optgroup label="✦ Vorgeschlagen">
								{templates.filter((t: any) => t.suggested).map((t) => (
									<option key={t.id} value={t.id}>{t.key}</option>
								))}
							</optgroup>
						)}
						{templates.some((t: any) => t.suggested) ? (
							<optgroup label="Weitere Vorlagen">
								{templates.filter((t: any) => !t.suggested).map((t) => (
									<option key={t.id} value={t.id}>{t.key}</option>
								))}
							</optgroup>
						) : (
							templates.map((t) => <option key={t.id} value={t.id}>{t.key}</option>)
						)}
					</select>
						<button type="button" onClick={() => setShowExtras(null)} className="text-slate-500 hover:text-slate-300 text-xs">Fertig</button>
					</div>
				</div>
			)}

			{showExtras === 'translate' && (
				<div className="px-3 py-2 border-t border-slate-800 bg-slate-900/50">
					<div className="flex items-center gap-2">
						<span className="text-xs text-slate-400">Nachricht übersetzen:</span>
						<button
							type="button"
							onClick={() => translateBody('de')}
							disabled={translateBusy || !body.trim()}
							className="rounded bg-slate-800 border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-40"
						>
							{translateBusy ? '…' : 'Deutsch'}
						</button>
						<button
							type="button"
							onClick={() => translateBody('en')}
							disabled={translateBusy || !body.trim()}
							className="rounded bg-slate-800 border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-40"
						>
							{translateBusy ? '…' : 'English'}
						</button>
						<button type="button" onClick={() => setShowExtras(null)} className="text-slate-500 hover:text-slate-300 text-xs ml-auto">Fertig</button>
					</div>
				</div>
			)}

			{showExtras === 'bullets' && (
				<div className="px-3 py-2 border-t border-slate-800 bg-slate-900/50 space-y-2">
				<textarea
					value={bullets}
					onChange={(e) => {
						setBullets(e.target.value);
						// Auto-expand
						const el = e.target;
						el.style.height = 'auto';
						el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
					}}
					rows={3}
					className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 resize-none overflow-auto"
					placeholder={"- Punkt 1\n- Punkt 2\n- Punkt 3"}
					style={{ minHeight: '64px' }}
				/>
					<div className="flex items-center gap-2">
						<button
							type="button"
							onClick={bulletsToText}
							disabled={bulletsBusy || !bullets.trim()}
							className="rounded bg-emerald-700 hover:bg-emerald-600 text-white px-2 py-1 text-xs disabled:opacity-40"
						>
							{bulletsBusy ? '…' : 'Formulieren'}
						</button>
						<button
							type="button"
							onClick={() => { setBody((prev) => prev ? `${prev}\n\n${bullets}` : bullets); setShowExtras(null); }}
							disabled={!bullets.trim()}
							className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-40"
						>
							Als Liste einfügen
						</button>
						<button type="button" onClick={() => setShowExtras(null)} className="text-slate-500 hover:text-slate-300 text-xs ml-auto">Fertig</button>
					</div>
				</div>
			)}

			{showExtras === 'attach' && (
				<div className="px-3 py-2 border-t border-slate-800 bg-slate-900/50 space-y-2">
					<input
						ref={fileInputRef}
						type="file"
						multiple
						className="text-xs text-slate-300"
						onChange={(e) => { setFiles(prev => [...prev, ...Array.from(e.target.files || [])]); }}
					/>

					{/* Ausfuellbares Kunden-Datenblatt mitschicken */}
					<div className="flex items-center gap-1.5 flex-wrap border-t border-slate-800 pt-2">
						<span className="text-[10px] text-slate-500 mr-1 flex-shrink-0">Datenblatt:</span>
						{orderId ? (
							<button
								type="button"
								disabled={Boolean(datasheet)}
								onClick={() => setDatasheet({ orderId })}
								className="rounded border border-slate-600 bg-slate-800 px-2 py-0.5 text-[11px] text-slate-200 hover:border-sky-500/60 disabled:opacity-40 disabled:hover:border-slate-600"
								title={`Ausfuellbares Kunden-Datenblatt zu ${orderId} anhaengen (vorbefuellt mit den Auftragsdaten)`}
							>
								🖊️ Aus {orderId} anhängen
							</button>
						) : (
							<>
								<select
									value={datasheetType}
									onChange={(e) => setDatasheetType(e.target.value)}
									className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[11px] text-slate-300"
									title="Auftragstyp für das leere Datenblatt"
								>
									{Object.entries(DATASHEET_TYPE_LABELS).map(([value, label]) => (
										<option key={value} value={value}>{label}</option>
									))}
								</select>
								<button
									type="button"
									disabled={Boolean(datasheet)}
									onClick={() => setDatasheet({ type: datasheetType })}
									className="rounded border border-slate-600 bg-slate-800 px-2 py-0.5 text-[11px] text-slate-200 hover:border-sky-500/60 disabled:opacity-40 disabled:hover:border-slate-600"
									title="Leeres Kunden-Datenblatt anhaengen — diese Mail ist keinem Auftrag zugeordnet"
								>
									🖊️ Blanko anhängen
								</button>
							</>
						)}
					</div>

					{(linkedAttachments.length > 0 || files.length > 0 || datasheet) && (
						<div className="space-y-1">
							{datasheet && (
								<div className="flex items-center justify-between text-xs text-sky-300">
									<span>
										🖊️ Kunden-Datenblatt{' '}
										{datasheet.orderId
											? `(${datasheet.orderId}, vorbefüllt)`
											: `(${DATASHEET_TYPE_LABELS[datasheet.type || ''] || datasheet.type}, blanko)`}
									</span>
									<button type="button" onClick={() => setDatasheet(null)} className="text-slate-600 hover:text-slate-300">✕</button>
								</div>
							)}
							{linkedAttachments.map((a) => (
								<div key={a.id} className="flex items-center justify-between text-xs text-slate-400">
									<span>📎 {a.name || a.id}</span>
									<button type="button" onClick={() => setLinkedAttachments((prev) => prev.filter((i) => i.id !== a.id))} className="text-slate-600 hover:text-slate-300">✕</button>
								</div>
							))}
							{files.map((f, i) => (
								<div key={`${f.name}-${i}`} className="flex items-center justify-between text-xs text-slate-400">
									<span>{f.name}</span>
									<button type="button" onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))} className="text-slate-600 hover:text-slate-300">✕</button>
								</div>
							))}
						</div>
					)}
					<button type="button" onClick={() => setShowExtras(null)} className="text-slate-500 hover:text-slate-300 text-xs">Fertig</button>
				</div>
			)}

			{/* Toolbar + Senden */}
			<div className="flex items-center gap-1 px-3 py-2 border-t border-slate-700/70 bg-slate-900/55 backdrop-blur-sm flex-shrink-0">
				<button
					type="button"
					onClick={() => setShowExtras(showExtras === 'attach' ? null : 'attach')}
					className={`p-1.5 rounded text-sm transition-colors ${showExtras === 'attach' ? 'bg-slate-700 text-slate-200' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'}`}
					title="Anhänge"
				>
					📎{attachCount > 0 && <span className="text-[10px] ml-0.5 text-sky-400">{attachCount}</span>}
				</button>
				<button
					type="button"
					onClick={() => setShowExtras(showExtras === 'template' ? null : 'template')}
					className={`p-1.5 rounded text-sm transition-colors ${showExtras === 'template' ? 'bg-slate-700 text-slate-200' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'}`}
					title="Textvorlage"
				>
					📋
				</button>
				<button
					type="button"
					onClick={() => setShowExtras(showExtras === 'translate' ? null : 'translate')}
					className={`hidden p-1.5 rounded text-sm transition-colors ${showExtras === 'translate' ? 'bg-slate-700 text-slate-200' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'}`}
					title="Übersetzen"
				>
					🌐
				</button>
				<button
					type="button"
					onClick={() => setShowExtras(showExtras === 'bullets' ? null : 'bullets')}
					className={`hidden p-1.5 rounded text-sm transition-colors ${showExtras === 'bullets' ? 'bg-slate-700 text-slate-200' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'}`}
					title="Stichpunkte"
				>
					•••
				</button>
				<VoiceInputButton
					compact
					onTranscript={(text) => setBody(prev => prev.trim() ? prev + '\n' + text : text)}
					language={lang}
					disabled={sending}
				/>

				<div className="flex-1" />

				<button
					type="button"
					onClick={onClose}
					className="px-2 py-1 text-xs text-slate-500 hover:text-slate-300"
				>
					Verwerfen
				</button>
				<button
					disabled={!body.trim() || !subject.trim() || sending}
					onClick={send}
					className="rounded bg-[linear-gradient(135deg,rgba(56,189,248,0.85)_0%,rgba(59,130,246,0.85)_45%,rgba(99,102,241,0.9)_100%)] hover:brightness-110 text-white px-4 py-1.5 text-xs font-medium disabled:opacity-40 transition-all shadow-[0_0_14px_rgba(59,130,246,0.25)]"
				>
					{sending ? 'Senden…' : 'Senden'}
				</button>
			</div>

			{/* Toast */}
			{toast && (
				<div className={`fixed bottom-4 right-4 z-[100] rounded border px-3 py-2 text-sm shadow-lg ${toastColors[toast.type]}`}>
					{toast.text}
				</div>
			)}
		</div>
	);
}
