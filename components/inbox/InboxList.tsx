"use client";
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Message } from './types';

type Props = {
	messages: Message[];
	selectedId?: string | null;
	onSelect: (id: string) => void;
	showAccountBadge?: boolean;
};

const SENT_FOLDER_KEYWORDS = ['sent', 'gesendet', 'gesendete', 'outbox'];

function isSent(m: Message): boolean {
	if (!m.folder) return false;
	const lower = m.folder.toLowerCase();
	return SENT_FOLDER_KEYWORDS.some(k => lower.includes(k));
}

function StatusDot({ message }: { message: Message }) {
	if (!message.isRead && !message.assignedTo) {
		return <div className="h-2.5 w-2.5 rounded-full bg-sky-400 ring-2 ring-sky-400/30 flex-shrink-0" title="Neu" />;
	}
	if (message.isRead && !message.assignedTo) {
		return <div className="h-2.5 w-2.5 rounded-full bg-slate-500 flex-shrink-0" title="Gesichtet" />;
	}
	if (message.assignedTo) {
		return <div className="h-2.5 w-2.5 rounded-full bg-emerald-400 flex-shrink-0" title="Zugeordnet" />;
	}
	return <div className="h-2.5 w-2.5 rounded-full bg-slate-700 flex-shrink-0" />;
}

function getAccountBadgeTone(label?: string | null): string {
	const value = (label || '').toLowerCase();
	if (value.includes('pickguard')) return 'bg-amber-500/20 border-amber-500/50 text-amber-200';
	return 'bg-emerald-500/20 border-[rgba(0,189,124,0.5)] text-emerald-200';
}

export default function InboxList({ messages, selectedId, onSelect, showAccountBadge = false }: Props) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const rowHeight = 80;
	const [scrollTop, setScrollTop] = useState(0);
	const [containerHeight, setContainerHeight] = useState(560);

	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		const element = el;
		function onScroll() { setScrollTop(element.scrollTop); }
		element.addEventListener('scroll', onScroll, { passive: true });
		const ro = new ResizeObserver((entries) => {
			for (const entry of entries) setContainerHeight(entry.contentRect.height);
		});
		ro.observe(element);
		return () => { el.removeEventListener('scroll', onScroll); ro.disconnect(); };
	}, []);

	const total = messages.length;
	const overscan = 6;
	const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
	const endIndex = Math.min(total - 1, Math.floor((scrollTop + containerHeight) / rowHeight) + overscan);
	const items = useMemo(() => messages.slice(startIndex, endIndex + 1), [messages, startIndex, endIndex]);

	useEffect(() => {
		function onKey(e: KeyboardEvent) {
			const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
			if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
			if (!total) return;
			if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
				e.preventDefault();
				const currentIndex = selectedId ? messages.findIndex((m) => m.id === selectedId) : -1;
				let nextIndex = currentIndex;
				if (e.key === 'ArrowDown') nextIndex = Math.min(total - 1, currentIndex + 1);
				if (e.key === 'ArrowUp') nextIndex = Math.max(0, currentIndex - 1);
				if (nextIndex !== currentIndex) onSelect(messages[nextIndex].id);
			}
		}
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [messages, selectedId, total, onSelect]);

	return (
		<div
			ref={containerRef}
			role="list"
			aria-label="Nachrichtenliste"
			className="overflow-auto h-full focus:outline-none"
			style={{ contain: 'strict' as any }}
		>
			<div style={{ height: total * rowHeight }} className="relative">
				{items.map((m, i) => {
					const index = i + startIndex;
					const top = index * rowHeight;
					const isSelected = m.id === selectedId;
					const unread = !m.isRead || m.threadHasUnread;

					return (
						<div
							key={m.id}
							role="listitem"
							aria-selected={isSelected}
							onClick={() => onSelect(m.id)}
							className={`absolute inset-x-0 px-3 py-2.5 border-b cursor-pointer transition-colors ${
								isSelected
									? 'border-sky-700 bg-sky-900/30 shadow-[inset_0_0_0_1px_rgba(56,189,248,0.35)]'
									: `border-slate-800 hover:bg-slate-800/40 ${unread ? 'bg-sky-950/40' : ''}`
							}`}
							style={{ top, height: rowHeight }}
						>
							<div className="flex items-start gap-2.5 h-full">
								<div className="pt-1">
									<StatusDot message={m} />
								</div>
								<div className="min-w-0 flex-1">
									{/* Zeile 1: Absender/Empfänger + Datum */}
									<div className="flex items-center justify-between gap-2">
										<span className={`truncate text-sm ${unread ? 'font-semibold text-slate-50' : 'text-slate-300'}`}>
											{isSent(m)
												? <><span className="text-slate-500 mr-1">→</span>{m.toName || m.toEmail || m.fromEmail}</>
												: (m.fromName || m.fromEmail)
											}
										</span>
										<div className="flex items-center gap-1.5 flex-shrink-0">
											{showAccountBadge && m.accountLabel && (
												<span
													className={`text-[10px] px-1.5 py-0.5 rounded-full border ${getAccountBadgeTone(m.accountLabel)}`}
													title={m.accountLabel}
												>
													{m.accountLabel}
												</span>
											)}
											{(m.threadCount || 0) > 1 && (
												<span className="bg-slate-700 text-slate-200 text-[10px] font-medium px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center">
													{m.threadCount}
												</span>
											)}
											<time className="text-[11px] text-slate-500" dateTime={m.createdAt}>
												{new Date(m.createdAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })}
											</time>
										</div>
									</div>
									{/* Zeile 2: Betreff + Icons */}
									<div className="flex items-center gap-1.5 mt-0.5 min-w-0">
										<span className={`truncate text-xs ${unread ? 'text-slate-200' : 'text-slate-400'}`}>
											{m.subject || 'Ohne Betreff'}
										</span>
										{m.hasAttachments && <span className="text-slate-500 text-[10px] flex-shrink-0">📎</span>}
										{m.starred && <span className="text-yellow-400 text-[10px] flex-shrink-0">★</span>}
									</div>
									{/* Zeile 3: Snippet + Tags */}
									<div className="flex items-center gap-1.5 mt-0.5">
										<span className="text-[11px] text-slate-500 truncate flex-1">{m.snippet?.slice(0, 80)}</span>
										{m.assignedTo && (
											<span className="text-[10px] px-1 py-0.5 rounded bg-emerald-900/40 border border-emerald-800/50 text-emerald-300 flex-shrink-0" title={m.assignedTo}>
												{m.assignedTo}
											</span>
										)}
										<span className={`px-1 py-0.5 rounded text-[10px] border flex-shrink-0 ${
											m.lang === 'DE' ? 'bg-slate-800/50 border-slate-700/50 text-slate-500' : 'bg-amber-900/30 border-amber-800/40 text-amber-300'
										}`}>
											{m.lang}
										</span>
									</div>
								</div>
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}
