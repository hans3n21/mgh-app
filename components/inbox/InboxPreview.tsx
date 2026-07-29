"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Message } from './types';
import ReplyComposer from './ReplyComposer';
import ImageCarouselModal, { type CarouselImage } from '@/components/ImageCarouselModal';
import AnnotatedMailText from './AnnotatedMailText';
import KnowledgeCaptureButton from './KnowledgeCaptureButton';
import type { ExtractedEntity } from '@/lib/mail/extraction';
import { renderMarkdown } from '@/lib/utils/markdown';
import { stripQuotedContent } from '@/lib/mail/stripQuotedContent';
import { isTrashFolderName } from '@/lib/mail/folders';
import { importDatasheetFromAttachment } from '@/lib/datasheet-import-client';

type Props = {
	message: Message | null;
	actionsSlot?: React.ReactNode;
	replyOpen?: boolean;
	onReplyToggle?: () => void;
	onLeadLinked?: (leadId: string) => void;
	onLeadCreated?: (leadId: string) => void;
	onMessageMoved?: (mailId: string, folder: string) => void;
	accountId?: string | null;
};

type AttachmentLike = {
	id: string;
	filename: string;
	mimeType: string | null;
	url?: string;
	size?: number;
};

function normalizeCid(value: string | null | undefined): string {
	if (!value) return '';
	return decodeURIComponent(value)
		.replace(/^cid:/i, '')
		.replace(/^<|>$/g, '')
		.trim()
		.toLowerCase();
}

function sanitizeBasic(html: string, attachments?: Array<{ cid?: string | null; url: string }>) {
	const template = document.createElement('template');
	template.innerHTML = html;
	template.content.querySelectorAll('script, iframe, object, embed').forEach((el) => el.remove());
	template.content.querySelectorAll('a').forEach((a) => {
		a.setAttribute('rel', 'noopener noreferrer nofollow');
		a.setAttribute('target', '_blank');
	});

	if (attachments && attachments.length > 0) {
		const cidToUrl = new Map<string, string>();
		for (const att of attachments) {
			const key = normalizeCid(att.cid);
			if (key) cidToUrl.set(key, att.url);
		}

		template.content.querySelectorAll('img[src^="cid:"], img[src^="CID:"]').forEach((img) => {
			const src = img.getAttribute('src');
			const key = normalizeCid(src);
			const mappedUrl = cidToUrl.get(key);
			if (mappedUrl) {
				img.setAttribute('src', mappedUrl);
			}
		});
	}

	return template.innerHTML;
}

function stripHtml(html: string) {
	if (!html) return '';
	const t = document.createElement('template');
	t.innerHTML = html;
	return t.content.textContent || '';
}

const MIN_SPLIT = 120;

const SENT_KEYWORDS = ['sent', 'gesendet', 'gesendete', 'outbox'];
const INVOICE_KEYWORDS = [
	'rechnung',
	'invoice',
	'beleg',
	'quittung',
	'gutschrift',
	'credit note',
	'zahlungsbeleg',
	'datev',
];

function isSentFolder(folder?: string | null): boolean {
	if (!folder) return false;
	const l = folder.toLowerCase();
	return SENT_KEYWORDS.some(k => l.includes(k));
}

const DISPLAY_URL_PATTERN = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi;

// Renders plain text with bare http(s)/www. URLs turned into clickable links,
// without dangerouslySetInnerHTML — everything else stays as React-escaped text.
function renderTextWithLinks(text: string): React.ReactNode {
	const parts = text.split(DISPLAY_URL_PATTERN);
	return parts.map((part, i) => {
		if (i % 2 !== 1) return part;
		const trailingMatch = part.match(/[.,;:!?)]+$/);
		const trailing = trailingMatch ? trailingMatch[0] : '';
		const core = trailing ? part.slice(0, -trailing.length) : part;
		const href = core.toLowerCase().startsWith('www.') ? `https://${core}` : core;
		return (
			<React.Fragment key={i}>
				<a href={href} target="_blank" rel="noopener noreferrer nofollow" className="underline decoration-dotted hover:text-sky-300">
					{core}
				</a>
				{trailing}
			</React.Fragment>
		);
	});
}

function isImageAttachment(mime: string | null, fn: string) {
	const mt = (mime || '').toLowerCase();
	if (mt.startsWith('image/')) return true;
	const ext = (fn || '').split('.').pop()?.toLowerCase();
	return ['jpg', 'jpeg', 'jpog', 'jpe', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext || '');
}

function isPdfAttachment(mime: string | null, fn: string) {
	const mt = (mime || '').toLowerCase();
	return mt.includes('pdf') || (fn || '').toLowerCase().endsWith('.pdf');
}

function isPreviewableAttachment(attachment: AttachmentLike) {
	return isImageAttachment(attachment.mimeType, attachment.filename) || isPdfAttachment(attachment.mimeType, attachment.filename);
}

function attachmentUrl(attachment: AttachmentLike) {
	return attachment.url || `/api/attachments/${attachment.id}`;
}

function toCarouselImage(attachment: AttachmentLike, position: number): CarouselImage {
	return {
		id: attachment.id,
		path: attachmentUrl(attachment),
		comment: attachment.filename,
		position,
		attach: false,
		scope: 'attachment',
		mimeType: attachment.mimeType || undefined,
		filename: attachment.filename,
	};
}

function looksLikeInvoice(message: Message): boolean {
	const attachments = message.attachments || [];
	const hasPdf = attachments.some((attachment) => isPdfAttachment(attachment.mimeType, attachment.filename));
	const haystack = [
		message.subject,
		message.snippet,
		message.text,
		message.fromName,
		message.fromEmail,
		...attachments.map((attachment) => attachment.filename),
	]
		.filter(Boolean)
		.join(' ')
		.toLowerCase();
	const hasInvoiceWord = INVOICE_KEYWORDS.some((keyword) => haystack.includes(keyword));
	return hasInvoiceWord || hasPdf;
}

export default function InboxPreview({ message, actionsSlot, replyOpen = false, onReplyToggle, onLeadLinked, onLeadCreated, onMessageMoved, accountId }: Props) {
	const [isUnread, setIsUnread] = useState(true);
	const [summary, setSummary] = useState<string | null>(null);
	const [summaryLoading, setSummaryLoading] = useState(false);
	const [summaryError, setSummaryError] = useState<string | null>(null);
	const [translation, setTranslation] = useState<{ lang: 'de' | 'en'; text: string } | null>(null);
	const [translationLoading, setTranslationLoading] = useState(false);
	const [translationError, setTranslationError] = useState<string | null>(null);
	const [actionLoading, setActionLoading] = useState<'trash' | 'datev' | null>(null);
	const [actionMessage, setActionMessage] = useState<string | null>(null);
	const [actionError, setActionError] = useState<string | null>(null);

	const [attachmentLightbox, setAttachmentLightbox] = useState<{ open: boolean; index: number; items?: CarouselImage[] }>({ open: false, index: 0 });

	// Datenblatt-PDF aus einem Anhang in den zugeordneten Auftrag uebernehmen
	const [datasheetImportId, setDatasheetImportId] = useState<string | null>(null);
	const linkedOrderId = message?.assignedTo || message?.orderId || null;

	const importAttachmentAsDatasheet = useCallback(async (attachment: AttachmentLike) => {
		if (!linkedOrderId) return;
		setDatasheetImportId(attachment.id);
		setActionError(null);
		// Nicht gespeicherte Anhaenge holt der Server erst per IMAP — das dauert
		// spuerbar, deshalb sofort sagen, dass etwas laeuft.
		setActionMessage(`Lade "${attachment.filename}" und übertrage nach ${linkedOrderId}…`);
		try {
			const outcome = await importDatasheetFromAttachment({
				orderId: linkedOrderId,
				attachmentId: attachment.id,
			});
			if (outcome.status === 'cancelled') {
				// Ohne Rueckmeldung wirkt der Abbruch wie ein wirkungsloser Klick.
				setActionMessage('Import abgebrochen - es wurde nichts uebernommen.');
				return;
			}
			if (outcome.status === 'error') {
				setActionError(outcome.message);
				return;
			}
			// Der Auftrag rechts zeigt die Vorschlaege sofort an.
			window.dispatchEvent(new CustomEvent('mgh:suggestions-updated'));
			setActionMessage(
				outcome.created > 0
					? `${outcome.created} Vorschläge in ${linkedOrderId} – rechts im violetten Banner bestätigen.`
					: `Keine Abweichungen gefunden – ${linkedOrderId} ist bereits auf diesem Stand.`,
			);
			// Die Meldung listet auch verworfene Felder — die gehoert in den Dialog,
			// nicht in den schmalen Hinweisstreifen.
			alert(outcome.message);
		} finally {
			setDatasheetImportId(null);
		}
	}, [linkedOrderId]);

	// KI-Toggle: 'original' zeigt die Mail, 'ai' zeigt KI-Ergebnis
	const [aiView, setAiView] = useState<'original' | 'ai'>('original');
	const [aiContent, setAiContent] = useState<{ type: 'summary' | 'translation'; label: string; text: string } | null>(null);

	// PII-Bestätigung vor KI-Versand
	const [piiConfirmSkip, setPiiConfirmSkip] = useState(false);
	const [piiDialog, setPiiDialog] = useState<{ action: 'summary' | 'translation'; targetLang?: 'de' | 'en' } | null>(null);
	const [piiDialogDontAsk, setPiiDialogDontAsk] = useState(false);

	useEffect(() => {
		const stored = localStorage.getItem('ai-pii-confirm-skip');
		if (stored === '1') setPiiConfirmSkip(true);
	}, []);

	const [extraction, setExtraction] = useState<{ entities: ExtractedEntity[]; plaintext: string } | null>(null);
	const [extractionLoading, setExtractionLoading] = useState(false);
	const [annotatedView, setAnnotatedView] = useState(false);
	const [contextMenu, setContextMenu] = useState<{ entity: ExtractedEntity; rect: DOMRect } | null>(null);
	const [excludedPiiIndices, setExcludedPiiIndices] = useState<Set<number>>(new Set());
	const [showReviewPanel, setShowReviewPanel] = useState(false);

	// Split-View resize
	const containerRef = useRef<HTMLDivElement>(null);
	const [splitRatio, setSplitRatio] = useState(0.55);
	const isResizingRef = useRef(false);

	const startResize = useCallback((e: React.MouseEvent) => {
		e.preventDefault();
		isResizingRef.current = true;
		const startY = e.clientY;
		const startRatio = splitRatio;
		const container = containerRef.current;
		if (!container) return;
		const totalH = container.clientHeight;

		function onMove(ev: MouseEvent) {
			if (!isResizingRef.current) return;
			const delta = ev.clientY - startY;
			const newRatio = Math.max(0.2, Math.min(0.8, startRatio + delta / totalH));
			setSplitRatio(newRatio);
		}
		function onUp() {
			isResizingRef.current = false;
			document.removeEventListener('mousemove', onMove);
			document.removeEventListener('mouseup', onUp);
		}
		document.addEventListener('mousemove', onMove);
		document.addEventListener('mouseup', onUp);
	}, [splitRatio]);

	// Mark as read
	useEffect(() => {
		if (!message) return;
		setIsUnread(!message.isRead);
		const timer = setTimeout(async () => {
			if (!message.isRead) {
				try {
					const res = await fetch(`/api/mails/${message.id}/mark-read`, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ isRead: true }),
					});
					if (res.ok) {
						setIsUnread(false);
						window.dispatchEvent(new CustomEvent('mail-read', { detail: { mailId: message.id } }));
					}
				} catch { /* ignore */ }
			}
		}, 2000);
		return () => clearTimeout(timer);
	}, [message]);

	useEffect(() => {
		setSummary(null);
		setSummaryError(null);
		setTranslation(null);
		setTranslationError(null);
		setExtraction(null);
		setContextMenu(null);
		setExcludedPiiIndices(new Set());
		setAnnotatedView(false);
		setShowReviewPanel(false);
		setAiView('original');
		setAiContent(null);
		setActionLoading(null);
		setActionMessage(null);
		setActionError(null);
	}, [message?.id]);

	useEffect(() => {
		if (!message?.id) return;
		let active = true;
		setExtractionLoading(true);
		fetch(`/api/mails/${message.id}/extraction`)
			.then(r => r.ok ? r.json() : null)
			.then(data => {
				if (active && data) {
					setExtraction({ entities: data.entities || [], plaintext: data.plaintext || '' });
				}
			})
			.catch(() => {})
			.finally(() => { if (active) setExtractionLoading(false); });
		return () => { active = false; };
	}, [message?.id]);

	const safeHtml = useMemo(() => {
		if (!message?.html) return '';
		try { return sanitizeBasic(message.html, message.attachments); } catch { return ''; }
	}, [message?.html, message?.attachments]);

	const previewText = useMemo(() => {
		if (!message) return '';
		if (message.text) return message.text;
		if (message.html) return stripHtml(message.html);
		return message.snippet || '';
	}, [message]);

	function requestAiAction(action: 'summary' | 'translation', targetLang?: 'de' | 'en') {
		if (piiConfirmSkip) {
			if (action === 'summary') fetchSummary();
			else if (targetLang) fetchTranslation(targetLang);
		} else {
			setPiiDialogDontAsk(false);
			setPiiDialog({ action, targetLang });
		}
	}

	function confirmPiiDialog() {
		if (piiDialogDontAsk) {
			localStorage.setItem('ai-pii-confirm-skip', '1');
			setPiiConfirmSkip(true);
		}
		const { action, targetLang } = piiDialog!;
		setPiiDialog(null);
		if (action === 'summary') fetchSummary();
		else if (targetLang) fetchTranslation(targetLang);
	}

	async function fetchSummary() {
		if (!message || summaryLoading) return;
		setSummaryLoading(true);
		setSummaryError(null);
		try {
			const res = await fetch('/api/inbox/summarize', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					text: previewText,
					language: message.lang === 'DE' ? 'de' : 'en',
					mailId: message.id,
					accountId: accountId || undefined,
				}),
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok || data?.error) throw new Error(data?.error || 'Zusammenfassung fehlgeschlagen');
			if (!data?.summary) throw new Error('Keine Zusammenfassung erhalten');
			setSummary(data.summary);
			setAiContent({ type: 'summary', label: 'Kurzfassung', text: data.summary });
			setAiView('ai');
		} catch (e) {
			setSummaryError(e instanceof Error ? e.message : 'Zusammenfassung fehlgeschlagen');
		} finally {
			setSummaryLoading(false);
		}
	}

	async function fetchTranslation(targetLang: 'de' | 'en') {
		if (!message || translationLoading) return;
		setTranslationLoading(true);
		setTranslationError(null);
		try {
			const res = await fetch('/api/inbox/translate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					text: previewText,
					sourceLang: message.lang === 'DE' ? 'de' : 'en',
					targetLang,
					mailId: message.id,
					accountId: accountId || undefined,
				}),
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok || data?.error) throw new Error(data?.error || 'Übersetzung fehlgeschlagen');
			if (!data?.text) throw new Error('Keine Übersetzung erhalten');
			setTranslation({ lang: targetLang, text: data.text });
			setAiContent({ type: 'translation', label: `Übersetzung ${targetLang.toUpperCase()}`, text: data.text });
			setAiView('ai');
		} catch (e) {
			setTranslationError(e instanceof Error ? e.message : 'Übersetzung fehlgeschlagen');
		} finally {
			setTranslationLoading(false);
		}
	}

	async function postDatevForward() {
		if (!message) return { needsTarget: false };
		const res = await fetch(`/api/mails/${encodeURIComponent(message.id)}/forward-datev`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({}),
		});
		const data = await res.json().catch(() => ({}));
		if (!res.ok && data?.code === 'DATEV_TARGET_REQUIRED') return { needsTarget: true };
		if (!res.ok) throw new Error(data?.error || 'DATEV-Weiterleitung fehlgeschlagen');
		return { ...data, needsTarget: false };
	}

	async function forwardToDatev() {
		if (!message || actionLoading) return;
		setActionLoading('datev');
		setActionError(null);
		setActionMessage(null);
		try {
			const result = await postDatevForward();
			if (result.needsTarget) {
				setActionError('Keine DATEV-Adresse hinterlegt — bitte unter Einstellungen → DATEV-Weiterleitung eintragen.');
				return;
			}
			const attachmentCount = Number(result.attachmentCount || 0);
			const skippedCount = Number(result.skippedAttachmentCount || 0);
			const attachmentText = skippedCount > 0
				? ` (${attachmentCount} Anhaenge, ${skippedCount} nicht geladen)`
				: attachmentCount > 0
					? ` (${attachmentCount} Anhaenge)`
					: '';
			setActionMessage(`An DATEV weitergeleitet${attachmentText}.`);
		} catch (error) {
			setActionError(error instanceof Error ? error.message : 'DATEV-Weiterleitung fehlgeschlagen');
		} finally {
			setActionLoading(null);
		}
	}

	async function moveCurrentToTrash() {
		if (!message || actionLoading) return;
		setActionLoading('trash');
		setActionError(null);
		setActionMessage(null);
		try {
			const res = await fetch('/api/mail/move', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ mailId: message.id, targetFolder: 'trash' }),
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(data?.error || 'Mail konnte nicht verschoben werden');
			const movedFolder = data?.folder || 'Trash';
			setActionMessage('In den Papierkorb verschoben.');
			onMessageMoved?.(message.id, movedFolder);
			window.dispatchEvent(new CustomEvent('mail-moved', { detail: { mailId: message.id, folder: movedFolder } }));
		} catch (error) {
			setActionError(error instanceof Error ? error.message : 'Mail konnte nicht verschoben werden');
		} finally {
			setActionLoading(null);
		}
	}

	const attachmentImages = useMemo(() => {
		if (!message?.attachments) return [];
		return message.attachments
			.filter(isPreviewableAttachment)
			.map((att, index) => toCarouselImage(att, index));
	}, [message?.attachments]);

	// Thread
	const [threadMails, setThreadMails] = useState<any[]>([]);
	const [threadLoading, setThreadLoading] = useState(false);
	const [expandedThreadIds, setExpandedThreadIds] = useState<Set<string>>(new Set());
	const showComposer = true;

	const threadAttachmentImages = useMemo(() => {
		const items: CarouselImage[] = [];
		const seen = new Set<string>();
		for (const threadMail of threadMails) {
			for (const attachment of (threadMail.attachments || []) as AttachmentLike[]) {
				if (!isPreviewableAttachment(attachment) || seen.has(attachment.id)) continue;
				seen.add(attachment.id);
				items.push(toCarouselImage(attachment, items.length));
			}
		}
		return items;
	}, [threadMails]);

	useEffect(() => {
		if (!message) { setThreadMails([]); return; }
		if ((message.threadCount || 0) <= 1 && !message.threadId) { setThreadMails([]); return; }
		const threadKey = message.threadId || message.id;
		let active = true;
		setThreadLoading(true);
		const params = new URLSearchParams();
		if (accountId) params.set('accountId', accountId);
		const url = `/api/mails/thread/${encodeURIComponent(threadKey)}${params.toString() ? `?${params.toString()}` : ''}`;
		fetch(url)
			.then(r => r.ok ? r.json() : [])
			.then(data => { if (active) { setThreadMails(data); setExpandedThreadIds(new Set([message.id])); } })
			.catch(() => { if (active) setThreadMails([]); })
			.finally(() => { if (active) setThreadLoading(false); });
		return () => { active = false; };
	}, [message?.id, message?.threadId, message?.threadCount, accountId]);

	const toggleThreadExpand = useCallback((id: string) => {
		setExpandedThreadIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
	}, []);

	const handleEntityApply = useCallback(async (field: string, value: string) => {
		if (!message?.orderId) return;
		try {
			await fetch(`/api/orders/${message.orderId}/suggestions`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ field, value, mailId: message.id }),
			});
		} catch { /* ignore */ }
	}, [message?.orderId, message?.id]);

	if (!message) {
		return (
			<div className="h-full flex items-center justify-center">
				<p className="text-slate-400 text-sm">Keine Nachricht ausgewählt</p>
			</div>
		);
	}

	const messageIsInTrash = isTrashFolderName(message.folder);
	const showDatevButton = looksLikeInvoice(message);
	const formatSize = (bytes?: number) => bytes != null ? (bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`) : '';
	const fileIcon = (mime: string | null, fn: string) => {
		const mt = (mime || '').toLowerCase();
		const ext = (fn || '').split('.').pop()?.toLowerCase();
		if (mt.startsWith('image/') || ['jpg', 'jpeg', 'jpog', 'jpe', 'png', 'gif', 'webp'].includes(ext || '')) return '🖼️';
		if (['xlsx', 'xls'].includes(ext || '') || mt.includes('spreadsheet')) return '📊';
		if (['pdf'].includes(ext || '') || mt.includes('pdf')) return '📄';
		if (['doc', 'docx'].includes(ext || '') || mt.includes('word')) return '📝';
		if (['zip', 'rar', '7z'].includes(ext || '')) return '📦';
		return '📎';
	};

	const mailHeader = (
		<div className="px-4 py-3 border-b border-slate-800 flex-shrink-0">
			{/* Betreff bekommt eine eigene volle Zeile (basis-full); die Aktions-Buttons
			    rutschen darunter und brechen bei Bedarf um — sonst quetschen sie in
			    schmaler Ansicht den langen Betreff in eine winzige Spalte. */}
			<div className="flex flex-wrap items-start gap-x-3 gap-y-2">
				<div className="min-w-0 basis-full">
					<h2 className="text-base font-semibold text-slate-100 leading-tight">{message.subject || 'Ohne Betreff'}</h2>
				<div className="mt-1 text-xs text-slate-400">
					{isSentFolder(message.folder)
						? <>
							<span className="text-slate-500">An: </span>
							{message.toName || message.toEmail || message.fromEmail}
						  </>
						: (message.fromName || message.fromEmail)
					}
					{' · '}{new Date(message.createdAt).toLocaleString('de-DE')}
				</div>
				</div>
				<div className="flex items-center gap-2 flex-wrap">
					<button
						type="button"
						draggable
						onDragStart={(e) => {
							const content = previewText || message.snippet || message.subject || '';
							e.dataTransfer.setData('text/plain', content);
							e.dataTransfer.effectAllowed = 'copy';
						}}
						className="px-2 py-1 rounded text-[11px] border border-slate-700 text-slate-400 hover:text-slate-200"
						title="In den Vorlagen-Manager ziehen"
					>
						📥 Als Vorlage ziehen
					</button>
					{showDatevButton && (
						<button
							type="button"
							onClick={forwardToDatev}
							disabled={!!actionLoading}
							className="px-2 py-1 rounded text-[11px] border border-cyan-700 bg-cyan-950/30 text-cyan-200 hover:bg-cyan-900/40 disabled:opacity-50"
							title="Mail samt Anhaengen an DATEV weiterleiten"
						>
							{actionLoading === 'datev' ? 'Sende...' : 'An DATEV'}
						</button>
					)}
					{!messageIsInTrash && !isSentFolder(message.folder) && (
						<button
							type="button"
							onClick={moveCurrentToTrash}
							disabled={!!actionLoading}
							className="px-2 py-1 rounded text-[11px] border border-slate-700 text-slate-400 hover:text-slate-200 disabled:opacity-50"
							title="Mail in den Papierkorb verschieben"
						>
							{actionLoading === 'trash' ? 'Verschiebe...' : 'Papierkorb'}
						</button>
					)}
					{actionsSlot}
					<button
						onClick={async () => {
							const newRead = isUnread;
							try {
								const res = await fetch(`/api/mails/${message.id}/mark-read`, {
									method: 'POST',
									headers: { 'Content-Type': 'application/json' },
									body: JSON.stringify({ isRead: newRead }),
								});
								if (res.ok) {
									setIsUnread(!newRead);
									window.dispatchEvent(new CustomEvent(newRead ? 'mail-read' : 'mail-unread', { detail: { mailId: message.id } }));
								}
							} catch { /* ignore */ }
						}}
						className={`px-2 py-1 rounded text-[11px] border transition-colors ${
							isUnread
								? 'border-emerald-700 bg-emerald-900/30 text-emerald-300 hover:bg-emerald-800/40'
								: 'border-amber-700 bg-amber-900/30 text-amber-300 hover:bg-amber-800/40'
						}`}
					>
						{isUnread ? '✓ Gelesen' : '📧 Ungelesen'}
					</button>
				</div>
			</div>
			{/* Anhänge inline */}
			{(actionMessage || actionError) && (
				<div className={`mt-2 rounded border px-2 py-1 text-[11px] ${
					actionError
						? 'border-rose-800 bg-rose-950/30 text-rose-300'
						: 'border-emerald-800 bg-emerald-950/30 text-emerald-300'
				}`}>
					{actionError || actionMessage}
				</div>
			)}
			{message.attachments && message.attachments.length > 0 && (
				<div className="mt-2 flex flex-wrap gap-1.5">
					{message.attachments.map((a, index) => {
						const isImg = isImageAttachment(a.mimeType, a.filename);
						const isPdf = isPdfAttachment(a.mimeType, a.filename);
						const canPreview = isImg || isPdf;
						// Nur PDFs koennen ein Datenblatt sein, und nur mit zugeordnetem Auftrag
						// gibt es ein Ziel fuer die Uebernahme.
						const canImport = isPdf && Boolean(linkedOrderId);
						const importing = datasheetImportId === a.id;
						return (
							<div key={a.id} className="flex items-center gap-1">
							<a
								href={a.url}
								target="_blank"
								rel="noopener noreferrer"
								draggable
								onDragStart={(e) => {
									e.dataTransfer.setData('text/attachment-url', a.url);
									e.dataTransfer.setData('text/attachment-name', a.filename);
									e.dataTransfer.setData('text/attachment-id', a.id);
									e.dataTransfer.effectAllowed = 'copy';
								}}
								onClick={(e) => {
									if (canPreview) {
										e.preventDefault();
										const imgIdx = message.attachments!.slice(0, index).filter(isPreviewableAttachment).length;
										setAttachmentLightbox({ open: true, index: imgIdx, items: attachmentImages });
									}
								}}
								className="group flex items-center gap-1 py-0.5 px-1.5 rounded border border-slate-700 bg-slate-800/50 hover:border-sky-500/40 transition-colors text-left max-w-[160px]"
							>
								{isImg ? (
									<div className="h-6 w-6 flex-shrink-0 rounded overflow-hidden bg-slate-900 relative flex items-center justify-center">
										<img src={a.url} alt={a.filename} className="h-full w-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
									</div>
								) : (
									<span className="text-xs flex-shrink-0">{fileIcon(a.mimeType, a.filename)}</span>
								)}
								<span className="text-[11px] text-slate-300 truncate">{a.filename}</span>
							</a>
							{canImport && (
								<button
									type="button"
									disabled={importing}
									onClick={() => importAttachmentAsDatasheet(a)}
									className="flex-shrink-0 rounded border border-violet-700/60 bg-violet-900/30 px-1.5 py-0.5 text-[10px] text-violet-200 hover:border-violet-500 disabled:opacity-50"
									title={`Ausgefülltes Datenblatt in Auftrag ${linkedOrderId} übernehmen – legt nur Vorschläge an`}
								>
									{importing ? '…' : `→ ${linkedOrderId}`}
								</button>
							)}
							</div>
						);
					})}
				</div>
			)}
		</div>
	);

	const mailContent = (
		<div className="flex-1 overflow-auto px-4 py-3">
			<div className="mb-3 flex items-center gap-1.5">
				<div className="flex items-center gap-1">
						{/* KI-Toggle (Original / KI) - nur wenn AI-Inhalt vorhanden */}
						{aiContent && (
							<div className="flex items-center rounded border border-slate-700 overflow-hidden mr-1">
								<button
									onClick={() => setAiView('original')}
									className={`px-2 py-0.5 text-[11px] transition-colors ${aiView === 'original' ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-200'}`}
								>
									Original
								</button>
								<button
									onClick={() => setAiView('ai')}
									className={`px-2 py-0.5 text-[11px] transition-colors border-l border-slate-700 ${aiView === 'ai' ? 'bg-violet-700/60 text-violet-100' : 'text-slate-400 hover:text-slate-200'}`}
								>
									✨ KI
								</button>
							</div>
						)}
						{extraction && (
							<>
								<button
									onClick={() => setAnnotatedView(!annotatedView)}
									className={`px-1.5 py-0.5 rounded border text-[11px] transition-colors ${annotatedView ? 'border-violet-600 bg-violet-900/30 text-violet-300' : 'border-slate-700 text-slate-400 hover:text-slate-200'}`}
									title="Persoenliche Daten markieren (werden bei KI-Versand automatisch anonymisiert)"
								>
									🛡 DSGVO
								</button>
								{annotatedView && (
									<button
										onClick={() => setShowReviewPanel(!showReviewPanel)}
										className={`px-1.5 py-0.5 rounded border text-[11px] transition-colors ${showReviewPanel ? 'border-violet-600 bg-violet-900/30 text-violet-300' : 'border-slate-700 text-slate-400 hover:text-slate-200'}`}
										title="Zeige welche Daten anonymisiert werden"
									>
										Pruefen
									</button>
								)}
							</>
						)}
						<button onClick={() => requestAiAction('summary')} disabled={summaryLoading || !previewText} className="px-1.5 py-0.5 rounded border border-slate-700 text-[11px] text-slate-400 hover:text-slate-200 disabled:opacity-40">
							{summaryLoading ? '⏳' : '✨'} Kurzfassung
						</button>
						<button onClick={() => requestAiAction('translation', 'de')} disabled={translationLoading} className="px-1.5 py-0.5 rounded border border-slate-700 text-[11px] text-slate-400 hover:text-slate-200 disabled:opacity-40">
							{translationLoading ? '⏳' : 'DE'}
						</button>
						<button onClick={() => requestAiAction('translation', 'en')} disabled={translationLoading} className="px-1.5 py-0.5 rounded border border-slate-700 text-[11px] text-slate-400 hover:text-slate-200 disabled:opacity-40">
							{translationLoading ? '⏳' : 'EN'}
						</button>
						<KnowledgeCaptureButton subject={message.subject} mailText={previewText} />
				</div>
				<div className="flex-1" />
			</div>

			{summaryError && <div className="text-xs text-rose-400 mb-2">{summaryError}</div>}
			{translationError && <div className="text-xs text-rose-400 mb-2">{translationError}</div>}

			{(
				<div className="space-y-3">
					{/* KI-Ansicht */}
					{aiView === 'ai' && aiContent ? (
						<div className="rounded-lg border border-violet-800/40 bg-violet-950/20 p-3">
							<div className="flex items-center gap-2 mb-2">
								<span className="text-[10px] uppercase tracking-wide text-violet-400 font-semibold">{aiContent.label}</span>
								<span className="text-[9px] text-slate-500">via KI · PII anonymisiert</span>
								<button
									onClick={() => setAiView('original')}
									className="ml-auto text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
								>
									Original anzeigen →
								</button>
							</div>
							<div
							className="prose-sm prose-invert max-w-none"
							dangerouslySetInnerHTML={{ __html: renderMarkdown(aiContent.text) }}
						/>
						</div>
					) : null}

					{/* Original-Inhalt: nur wenn nicht im KI-View */}
					{aiView === 'original' && threadMails.length > 1 && (!annotatedView || !extraction) ? (
						<div className="space-y-2">
							<div className="text-[11px] text-slate-500 px-1">Konversation ({threadMails.length})</div>
							{threadMails.map((tm: any) => {
								const isOurs = isSentFolder(tm.folder) || !!tm.senderId;
								const isCurrent = tm.id === message.id;
								// Strip quoted history — only show the new content of this message.
								const { freshContent } = stripQuotedContent(tm.text || '');
								const displayText = freshContent.trim() || tm.snippet || '';
								return (
									<div key={tm.id} className={`flex ${isOurs ? 'justify-end' : 'justify-start'} px-1`}>
										<div className={`max-w-[88%] rounded-2xl overflow-hidden border ${
											isOurs
												? 'bg-emerald-950/50 border-emerald-800/40 rounded-tr-sm'
												: 'bg-slate-800/50 border-slate-700/40 rounded-tl-sm'
										} ${isCurrent ? 'ring-1 ring-sky-600/40' : ''}`}>
											{/* Sender + time */}
											<div className="px-3 pt-2 pb-1 flex items-center gap-2">
												<span className={`text-[11px] font-semibold truncate flex-1 ${isOurs ? 'text-emerald-400' : 'text-slate-300'}`}>
													{isOurs
														? `→ ${(tm as any).toName || (tm as any).toEmail || tm.fromEmail || 'Ich'}`
														: (tm.fromName || tm.fromEmail || '–')
													}
												</span>
												<time className="text-[10px] text-slate-500 flex-shrink-0">
													{new Date(tm.date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
													{' '}
													{new Date(tm.date).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
												</time>
											</div>

											{/* Message body — always visible, no quoting */}
											<div className={`px-3 pb-3 ${displayText ? '' : 'hidden'}`}>
												<pre className="whitespace-pre-wrap text-sm text-slate-200 leading-relaxed font-sans">
													{renderTextWithLinks(displayText)}
												</pre>
											</div>

											{/* Attachments */}
											{tm.attachments?.length > 0 && (
												<div className={`px-3 pb-2 pt-2 flex flex-wrap gap-1.5 border-t ${isOurs ? 'border-emerald-800/30' : 'border-slate-700/30'}`}>
													{(tm.attachments as AttachmentLike[]).map((a) => {
														const isImg = isImageAttachment(a.mimeType, a.filename);
														const isPdf = isPdfAttachment(a.mimeType, a.filename);
														const canPreview = isImg || isPdf;
														const url = attachmentUrl(a);
														const lightboxIndex = threadAttachmentImages.findIndex((item) => item.id === a.id);

														if (canPreview) {
															return (
																<button
																	key={a.id}
																	type="button"
																	onClick={() => setAttachmentLightbox({
																		open: true,
																		index: Math.max(0, lightboxIndex),
																		items: threadAttachmentImages,
																	})}
																	className={`group relative h-12 w-12 overflow-hidden rounded-md border border-slate-700 bg-slate-900/80 hover:border-sky-500/60 transition-colors ${isPdf ? 'flex items-center justify-center' : ''}`}
																	title={a.filename}
																>
																	{isImg ? (
																		<img
																			src={url}
																			alt={a.filename}
																			className="h-full w-full object-cover"
																			onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
																		/>
																	) : (
																		<span className="text-lg">{fileIcon(a.mimeType, a.filename)}</span>
																	)}
																	<span className="absolute inset-x-0 bottom-0 hidden truncate bg-black/65 px-1 py-0.5 text-[9px] text-slate-100 group-hover:block">
																		{a.filename}
																	</span>
																</button>
															);
														}

														return (
															<a
																key={a.id}
																href={url}
																target="_blank"
																rel="noopener noreferrer"
																className="inline-flex max-w-[180px] items-center gap-1 rounded border border-slate-700 bg-slate-900/60 px-2 py-1 text-[10px] text-slate-300 hover:border-sky-500/50 hover:text-sky-200"
																title={a.filename}
															>
																<span>{fileIcon(a.mimeType, a.filename)}</span>
																<span className="truncate">{a.filename}</span>
																{a.size != null ? <span className="text-slate-500">{formatSize(a.size)}</span> : null}
															</a>
														);
													})}
												</div>
											)}
										</div>
									</div>
								);
							})}
						</div>
					) : aiView === 'original' && annotatedView && extraction ? (
						<AnnotatedMailText
							plaintext={extraction.plaintext}
							entities={extraction.entities}
							onEntityClick={() => {}}
							excludedIndices={excludedPiiIndices}
							onExcludeToggle={(idx) => {
								setExcludedPiiIndices(prev => {
									const next = new Set(prev);
									if (next.has(idx)) next.delete(idx); else next.add(idx);
									return next;
								});
							}}
							showReviewPanel={showReviewPanel}
							onAddEntity={async (ent) => {
								if (!message?.id) return;
								try {
									const res = await fetch(`/api/mails/${message.id}/extraction`, {
										method: 'PATCH',
										headers: { 'Content-Type': 'application/json' },
										body: JSON.stringify({ add: ent }),
									});
									if (res.ok) {
										const data = await res.json();
										setExtraction(prev => prev ? { ...prev, entities: data.entities || [] } : prev);
									}
								} catch { /* ignore */ }
							}}
							onRemoveEntity={async (idx) => {
								if (!message?.id) return;
								try {
									const res = await fetch(`/api/mails/${message.id}/extraction`, {
										method: 'PATCH',
										headers: { 'Content-Type': 'application/json' },
										body: JSON.stringify({ remove: idx }),
									});
									if (res.ok) {
										const data = await res.json();
										setExtraction(prev => prev ? { ...prev, entities: data.entities || [] } : prev);
									}
								} catch { /* ignore */ }
							}}
							onApplyField={handleEntityApply}
						/>
					) : aiView === 'original' ? (
						<div className="text-sm leading-relaxed [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5" dangerouslySetInnerHTML={{ __html: safeHtml || `<pre class="whitespace-pre-wrap">${message.snippet}</pre>` }} />
					) : null}
				</div>
			)}
		</div>
	);

	const activeLightboxItems = attachmentLightbox.items ?? attachmentImages;

	return (
		<div ref={containerRef} id="inbox-preview" tabIndex={-1} className="h-full flex flex-col overflow-hidden">
			{showComposer ? (
				<>
					{/* Obere Hälfte: Mail */}
					<div className="flex flex-col overflow-hidden" style={{ height: `${splitRatio * 100}%` }}>
						{mailHeader}
						{mailContent}
					</div>

					{/* Resize Handle */}
					<div
						className="h-1.5 flex-shrink-0 bg-transparent hover:bg-transparent cursor-row-resize flex items-center justify-center group"
						onMouseDown={startResize}
					>
						<div className="w-8 h-px bg-slate-700/40 rounded group-hover:bg-slate-500/60 transition-colors" />
					</div>

					{/* Untere Hälfte: Composer */}
					<div className="flex-1 min-h-0 border-t border-slate-700/70 bg-[linear-gradient(180deg,rgba(15,23,42,0.72)_0%,rgba(15,23,42,0.9)_100%)] p-2 flex flex-col overflow-hidden">
				<ReplyComposer
					open={true}
					onClose={() => {}}
					mailId={message.id}
					defaultSubject={message.subject ? `Re: ${message.subject}` : 'Re:'}
					defaultTo={
					isSentFolder(message.folder)
						? (message.toEmail || message.fromEmail || undefined)
						: (message.replyToEmail || message.fromEmail || undefined)
				}
					defaultBody=""
					parsedFields={[]}
					initialLangGuess={(message.lang as any) || 'DE'}
					accountId={accountId ?? undefined}
					originalMailText={previewText || undefined}
					customerName={message.fromName || undefined}
					orderId={message.assignedTo || message.orderId || null}
				/>
					</div>
				</>
			) : null}

			{attachmentLightbox.open && activeLightboxItems.length > 0 && (
				<ImageCarouselModal
					images={activeLightboxItems}
					index={Math.min(attachmentLightbox.index, activeLightboxItems.length - 1)}
					scopes={[]}
					onClose={() => setAttachmentLightbox({ open: false, index: 0 })}
					onUpdate={async () => {}}
					onDelete={async () => {}}
				/>
			)}
		{/* PII-Bestätigungsdialog vor KI-Versand */}
		{piiDialog && (
			<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
				<div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-5 w-[360px] max-w-full space-y-4">
					<div className="flex items-start gap-3">
						<span className="text-xl mt-0.5">🔒</span>
						<div>
							<p className="text-sm font-semibold text-slate-100">Vor dem KI-Versand</p>
							<p className="text-xs text-slate-400 mt-0.5">
								{(() => {
									const activeEntities = extraction?.entities?.filter((_, i) => !excludedPiiIndices.has(i)) ?? [];
									if (activeEntities.length === 0 && !extraction) return 'Die E-Mail wird noch analysiert. Trotzdem senden?';
									if (activeEntities.length === 0) return 'Keine personenbezogenen Daten erkannt. Mail wird so gesendet.';
									return `${activeEntities.length} Stelle${activeEntities.length !== 1 ? 'n' : ''} anonymisiert. Alles korrekt?`;
								})()}
							</p>
						</div>
					</div>

					<label className="flex items-center gap-2 cursor-pointer">
						<input
							type="checkbox"
							checked={piiDialogDontAsk}
							onChange={e => setPiiDialogDontAsk(e.target.checked)}
							className="rounded border-slate-600 bg-slate-800"
						/>
						<span className="text-xs text-slate-400">Nicht mehr fragen (liegt in meiner Verantwortung)</span>
					</label>

					<div className="flex gap-2 justify-end">
						<button
							onClick={() => setPiiDialog(null)}
							className="px-3 py-1.5 rounded-lg text-xs text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors"
						>
							Abbrechen
						</button>
						<button
							onClick={confirmPiiDialog}
							className="px-3 py-1.5 rounded-lg text-xs text-white bg-violet-600 hover:bg-violet-500 transition-colors"
						>
							Ja, senden
						</button>
					</div>
				</div>
			</div>
		)}
		</div>
	);
}
