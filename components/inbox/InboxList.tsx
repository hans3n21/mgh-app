"use client";
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Message } from './types';

type Props = {
	messages: Message[];
	selectedId?: string | null;
	onSelect: (id: string) => void;
};

// Simple windowed virtualization for fixed row height
export default function InboxList({ messages, selectedId, onSelect }: Props) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const rowHeight = 72; // px
	const [scrollTop, setScrollTop] = useState(0);
	const viewportHeight = 560; // fallback; will update via ResizeObserver
	const [containerHeight, setContainerHeight] = useState(viewportHeight);

	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		const element = el; // Store in local constant for TypeScript
		function onScroll() {
			setScrollTop(element.scrollTop);
		}
		element.addEventListener('scroll', onScroll, { passive: true });
		const ro = new ResizeObserver((entries) => {
			for (const entry of entries) {
				setContainerHeight(entry.contentRect.height);
			}
		});
		ro.observe(element);
		return () => {
			el.removeEventListener('scroll', onScroll);
			ro.disconnect();
		};
	}, []);

	const total = messages.length;
	const overscan = 6;
	const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
	const endIndex = Math.min(total - 1, Math.floor((scrollTop + containerHeight) / rowHeight) + overscan);
	const items = useMemo(() => messages.slice(startIndex, endIndex + 1), [messages, startIndex, endIndex]);

	useEffect(() => {
		function onKey(e: KeyboardEvent) {
			if (!total) return;
			if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
				e.preventDefault();
				const currentIndex = selectedId ? messages.findIndex((m) => m.id === selectedId) : -1;
				let nextIndex = currentIndex;
				if (e.key === 'ArrowDown') nextIndex = Math.min(total - 1, currentIndex + 1);
				if (e.key === 'ArrowUp') nextIndex = Math.max(0, currentIndex - 1);
				if (nextIndex !== currentIndex) {
					onSelect(messages[nextIndex].id);
				}
			}
			if (e.key === 'Enter' && selectedId) {
				// no-op here; parent opens preview automatically on selection
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
					return (
						<div
							key={m.id}
							role="listitem"
							aria-selected={isSelected}
							onClick={() => onSelect(m.id)}
							className={`absolute inset-x-0 px-3 py-3 border-b transition ${
								isSelected
									? 'border-sky-700 bg-sky-900/20 shadow-[inset_0_0_0_1px_rgba(56,189,248,0.35)]'
									: `border-slate-800 hover:bg-slate-800/40 ${m.unread ? 'bg-sky-900/10' : ''}`
							}`}
							style={{ top, height: rowHeight }}
						>
							<div className="flex items-center gap-3 h-full">
								<div className={`h-2 w-2 rounded-full ${m.unread ? 'bg-sky-400' : 'bg-slate-700'}`} />
								<div className="min-w-0 flex-1">
									<div className="flex items-center gap-2 min-w-0">
										<span className={`truncate text-sm ${m.unread ? 'text-slate-100' : 'text-slate-200'}`}>{m.subject || 'Ohne Betreff'}</span>
										{m.hasAttachments ? (
											<span className="ml-1 text-slate-400 text-xs">📎 {m.attachmentsCount}</span>
										) : null}
										{m.assignedTo ? (
											<span className="ml-1 text-slate-400 text-xs" title={`Zugeordnet: ${m.assignedTo}`}>🔗</span>
										) : null}
										{m.leadId ? (
											<span className="ml-1 text-emerald-400 text-xs" title={`Lead #${m.leadId}`}>⭐ Lead</span>
										) : null}
											{m.starred ? (
												<span className="ml-1 text-yellow-400 text-xs" title="Gemarkert">★</span>
											) : null}
									</div>
										<div className="text-xs text-slate-400 truncate">{m.fromName || m.fromEmail}</div>
										<div className="mt-1 flex flex-wrap gap-1">
											{(m.tags || []).map((t) => (
												<span key={t} className="text-[10px] px-1 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300">{t}</span>
											))}
										</div>
								</div>
								<div className="flex items-center gap-2">
									<span className={`px-1.5 py-0.5 rounded text-[10px] border ${m.lang === 'DE' ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-amber-900/40 border-amber-700 text-amber-200'}`}>{m.lang}</span>
									<time className="text-xs text-slate-400" dateTime={m.createdAt}>{new Date(m.createdAt).toLocaleDateString()}</time>
								</div>
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}


