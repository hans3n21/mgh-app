"use client";
import React, { useEffect, useMemo, useState } from 'react';
import type { Message } from './types';
import InboxActions from './InboxActions';
import { suggestType } from '@/lib/inbox/rules';
import { parseFields as parseDraftFields, type DraftType, type ParsedDraft } from '@/lib/inbox/parse';
import ParsedChips from './ParsedChips';
import SpecForm from '@/components/specs/SpecForm';

import ImageCarouselModal from '@/components/ImageCarouselModal';

type Props = {
    message: Message | null;
    actionsSlot?: React.ReactNode;
    onLeadLinked?: (leadId: string) => void;
    onLeadCreated?: (leadId: string) => void;
};

// lightweight sanitizer for very basic HTML; for robust use DOMPurify in deps
function sanitizeBasic(html: string) {
	const template = document.createElement('template');
	template.innerHTML = html;
	const scripts = template.content.querySelectorAll('script, iframe, object, embed');
	scripts.forEach((el) => el.remove());
	const anchors = template.content.querySelectorAll('a');
	anchors.forEach((a) => {
		a.setAttribute('rel', 'noopener noreferrer nofollow');
		a.setAttribute('target', '_blank');
	});
	return template.innerHTML;
}

export default function InboxPreview({ message, actionsSlot, onLeadLinked, onLeadCreated }: Props) {
	const [isUnread, setIsUnread] = useState<boolean>(true);

	const safeHtml = useMemo(() => {
		if (!message?.html) return '';
		try {
			return sanitizeBasic(message.html);
		} catch {
			return '';
		}
	}, [message]);

	// Mark as read when message is viewed
	useEffect(() => {
		if (!message) return;
		
		// Set initial unread state from message data (isRead is inverted)
		setIsUnread(!message.isRead); // Default to unread if isRead is false
		
		// Mark as read after a short delay (user has actually looked at it)
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
						// Update navigation counter
						window.dispatchEvent(new CustomEvent('mail-read'));
					}
				} catch (error) {
					console.error('Failed to mark mail as read:', error);
				}
			}
		}, 2000); // 2 seconds delay
		
		return () => clearTimeout(timer);
	}, [message]);



const parsedDraft = useMemo(() => {
    if (!message) return { fields: {}, source: 'regex' } as { fields: ParsedDraft; source: 'regex' };
    return parseDraftFields('Hals' as DraftType, { html: message.html as any, text: (message as any).text || message.snippet, subject: message.subject });
}, [message]);

const [draft, setDraft] = useState<ParsedDraft>({});

	const [acceptedKeys, setAcceptedKeys] = useState<Set<string>>(new Set());
const [activeTab, setActiveTab] = useState<'mail' | 'parsed' | 'datasheet'>('mail');

	const [attachmentLightbox, setAttachmentLightbox] = useState<{ open: boolean; index: number }>({ open: false, index: 0 });

	// Konvertiere Mail-Anhänge zu Lightbox-Format
	const attachmentImages = useMemo(() => {
		if (!message?.attachments) return [];
		return message.attachments.map((attachment, index) => ({
			id: attachment.id,
			path: attachment.url,
			comment: attachment.filename,
			position: index,
			attach: false,
			scope: 'attachment',
			createdAt: new Date()
		}));
	}, [message?.attachments]);
	const toggleAccept = (key: string) => {
		setAcceptedKeys((prev) => {
			const next = new Set(prev);
			if (next.has(key)) next.delete(key); else next.add(key);
			return next;
		});
	};

	if (!message) {
		return (
			<div className="h-full flex items-center justify-center">
				<p className="text-slate-400 text-sm">Keine Nachricht ausgewählt</p>
			</div>
		);
	}

	return (
		<div id="inbox-preview" tabIndex={-1} className="h-full overflow-auto flex flex-col">
			<div className="p-4 border-b border-slate-800 space-y-2 flex-shrink-0">

				<div className="flex items-start justify-between gap-3">
					<div>
						<h2 className="text-lg font-semibold text-slate-100">{message.subject || 'Ohne Betreff'}</h2>
						<div className="mt-1 text-sm text-slate-400">
							Von: {message.fromName || message.fromEmail} · {new Date(message.createdAt).toLocaleString()}
						</div>
					</div>
					<div className="flex items-center gap-2">
						{actionsSlot}
						<button
							onClick={async () => {
								if (!message) return;
								const newIsReadState = !isUnread; // isUnread is inverted from isRead
								
								try {
									const res = await fetch(`/api/mails/${message.id}/mark-read`, {
										method: 'POST',
										headers: { 'Content-Type': 'application/json' },
										body: JSON.stringify({ isRead: newIsReadState }),
									});
									
								if (res.ok) {
									setIsUnread(!newIsReadState);
									// Update navigation counter
									window.dispatchEvent(new CustomEvent(!newIsReadState ? 'mail-unread' : 'mail-read'));
								}
								} catch (error) {
									console.error('Failed to update read status:', error);
								}
							}}
							className={`px-3 py-1.5 rounded text-xs border transition-colors ${
								isUnread 
									? 'border-emerald-600 bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30' 
									: 'border-amber-600 bg-amber-600/20 text-amber-300 hover:bg-amber-600/30'
							}`}
							title={isUnread ? 'Als gelesen markieren' : 'Als ungelesen markieren'}
						>
							{isUnread ? '✓ Gelesen' : '📧 Ungelesen'}
						</button>
					</div>
				</div>
			</div>
			<div className="p-4 flex-1 overflow-auto">
				<div className="mb-4 flex items-center gap-2 text-sm">
					<button onClick={() => setActiveTab('mail')} className={`px-2 py-1 rounded border text-xs ${activeTab==='mail' ? 'border-sky-600 bg-sky-600/20 text-sky-300' : 'border-slate-700 bg-slate-900 text-slate-300'}`}>Mail</button>
					<button onClick={() => setActiveTab('parsed')} className={`px-2 py-1 rounded border text-xs ${activeTab==='parsed' ? 'border-sky-600 bg-sky-600/20 text-sky-300' : 'border-slate-700 bg-slate-900 text-slate-300'}`}>Erkannte Felder</button>
					<button onClick={() => setActiveTab('datasheet')} className={`px-2 py-1 rounded border text-xs ${activeTab==='datasheet' ? 'border-sky-600 bg-sky-600/20 text-sky-300' : 'border-slate-700 bg-slate-900 text-slate-300'}`}>Datenblatt (Entwurf)</button>
				</div>

				{activeTab === 'mail' ? (
					<div className="text-sm leading-relaxed [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5" dangerouslySetInnerHTML={{ __html: safeHtml || `<pre class=\"whitespace-pre-wrap\">${message.snippet}</pre>` }} />
                ) : activeTab === 'parsed' ? (
					<div>
                        <ParsedChips
                            chips={Object.entries(parsedDraft.fields).map(([k, v]) => ({ key: k, label: k, value: String(v), source: 'regex' }))}
                            onApply={(key, value) => setDraft((prev) => ({ ...prev, [key]: value }))}
                        />
					</div>
                ) : (
                    <div className="space-y-3">
                        <SpecForm type={'Hals' as DraftType} value={draft} onChange={setDraft} />
                        <div className="flex items-center justify-end">
                            <button
                                className="rounded bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 text-sm"
                                onClick={async () => {
                                    if (!message) return;
                                    const typeMap: Record<string,string> = { Hals: 'NECK', Body: 'BODY', Pickguard: 'PICKGUARD', Pickups: 'PICKUPS', 'Rep.': 'REPAIR' };
                                    const selType = 'Hals'; // Default type
                                    const res = await fetch('/api/inbox/create-order', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ threadId: message.threadId || message.id, type: typeMap[selType] || 'NECK', specsDraft: draft }),
                                    });
                                    if (res.ok) {
                                        const order = await res.json();
                                        try { (message as any).assignedTo = order.id; } catch {}
                                        // rudimentärer Toast
                                        alert(`Angelegt: ${order.id}`);
                                    } else {
                                        alert('Fehler beim Anlegen');
                                    }
                                }}
                            >
                                Auftrag anlegen
                            </button>
                        </div>
                    </div>
                )}
				{message.attachments && message.attachments.length > 0 ? (
					<div className="mt-6">
						<h3 className="text-sm font-medium text-slate-200 mb-2">Anhänge</h3>
						<div className="text-xs text-slate-400 mb-2">📎 Ziehen Sie Anhänge nach rechts zur Auftragsverwaltung</div>
						<div className="flex flex-wrap gap-2">
							{message.attachments.map((a, index) => (
								<div
									key={a.id}
									draggable
									onDragStart={(e) => {
										e.dataTransfer.setData('text/attachment-url', a.url);
										e.dataTransfer.setData('text/attachment-name', a.filename);
										e.dataTransfer.effectAllowed = 'copy';
									}}
									onClick={() => setAttachmentLightbox({ open: true, index })}
									className="group relative h-20 w-20 overflow-hidden rounded border border-slate-700 bg-slate-800 cursor-pointer hover:border-emerald-500 transition-colors"
									title={`${a.filename} - Klicken zum Vergrößern oder zum Auftrag ziehen`}
								>
									<img src={a.url} className="h-full w-full object-cover" alt={a.filename} />
									<div className="absolute inset-0 hidden group-hover:flex items-center justify-center bg-black/50 text-white text-xs flex-col gap-1">
										<div>🔍</div>
										<div>Öffnen</div>
									</div>
									<div className="absolute top-1 left-1 w-4 h-4 bg-slate-900/80 rounded text-white text-[10px] flex items-center justify-center">
										📎
									</div>
									<button 
										onClick={(e) => {
											e.stopPropagation();
											window.open(a.url, '_blank');
										}}
										className="absolute top-1 right-1 w-4 h-4 bg-slate-900/80 rounded text-white text-xs flex items-center justify-center hover:bg-slate-900 opacity-0 group-hover:opacity-100 transition-opacity"
										title="In neuem Tab öffnen"
									>
										↗
									</button>
								</div>
							))}
						</div>
					</div>
				) : null}
			</div>


		{/* Lightbox für Mail-Anhänge */}
		{attachmentLightbox.open && attachmentImages.length > 0 && (
			<ImageCarouselModal
				images={attachmentImages}
				index={attachmentLightbox.index}
				scopes={[]} // Keine Scopes für Mail-Anhänge
				onClose={() => setAttachmentLightbox({ open: false, index: 0 })}
				onUpdate={async () => {}} // Keine Updates für Mail-Anhänge
				onDelete={async () => {}} // Kein Löschen für Mail-Anhänge
			/>
		)}


	</div>
	);
}


