"use client";
import React, { useEffect, useRef } from 'react';
import type { InboxFilter } from './types';

type Props = {
	q: string;
	onChangeQ: (q: string) => void;
	filter: InboxFilter;
	onChangeFilter: (f: InboxFilter) => void;
	syncing?: boolean;
	syncLabel?: string;
	syncProgress?: {
		completedAccounts: number;
		totalAccounts: number;
	};
	onSync?: () => void;
	lastSyncTime?: Date | null;
	searchActive?: boolean;
	searchIncludeTrash?: boolean;
	onToggleIncludeTrash?: () => void;
	filterCounts?: Partial<Record<InboxFilter, number>>;
	focusLabel?: string;
};

export default function InboxToolbar({
	q, onChangeQ, filter, onChangeFilter,
	syncing, syncLabel, syncProgress, onSync, lastSyncTime, searchActive, searchIncludeTrash, onToggleIncludeTrash, filterCounts, focusLabel
}: Props) {
	const inputRef = useRef<HTMLInputElement | null>(null);

	useEffect(() => {
		function onKey(e: KeyboardEvent) {
			const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
			if (tag === 'input' || tag === 'textarea' || tag === 'select' || (e.target as HTMLElement)?.isContentEditable) return;
			if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
				e.preventDefault();
				inputRef.current?.focus();
			}
		}
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, []);

	const chips: Array<[InboxFilter, string]> = [
		['all', 'Alle'],
		['unread', 'Ungelesen'],
		['with_order', 'Mit Auftrag'],
		['unassigned', 'Nicht zugeordnet'],
		['with_attachments', 'Mit Anhängen'],
	];

	return (
		<div className="sticky top-0 z-10 border-b border-slate-800 bg-slate-900/80 backdrop-blur supports-[backdrop-filter]:bg-slate-900/50">
			<div className="px-3 py-2 flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
				<div className="flex items-center gap-2 w-full xl:w-auto">

					{/* Globale Suche Badge */}
					{searchActive && (
						<span className="text-[11px] text-sky-400 bg-sky-900/30 border border-sky-700/50 px-2 py-0.5 rounded shrink-0 whitespace-nowrap">
							{focusLabel ? `${focusLabel} · Suche` : 'Suche'}
						</span>
					)}

					<div className="relative flex-1">
						<input
							ref={inputRef}
							type="text"
							placeholder="Suche in allen Postfächern (/)"
							value={q}
							onChange={(e) => onChangeQ(e.target.value)}
							className={`w-full rounded-lg bg-slate-900 border px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-600 ${
								searchActive ? 'border-sky-600/50' : 'border-slate-700'
							}`}
							aria-label="Suche"
						/>
						{!q && <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-500">/</span>}
						{q && (
							<button
								type="button"
								onClick={() => onChangeQ('')}
								className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-sm leading-none"
								title="Suche löschen"
							>
								✕
							</button>
						)}
					</div>

					{/* Papierkorb einschließen — nur bei aktiver Suche */}
					{searchActive && onToggleIncludeTrash && (
						<button
							type="button"
							onClick={onToggleIncludeTrash}
							title={searchIncludeTrash ? 'Papierkorb wird durchsucht' : 'Papierkorb nicht durchsucht'}
							className={`flex items-center gap-1 px-2 py-1.5 rounded-lg border text-xs transition-colors shrink-0 ${
								searchIncludeTrash
									? 'border-amber-600/50 bg-amber-900/20 text-amber-300'
									: 'border-slate-700 text-slate-500 hover:text-slate-300 hover:bg-slate-800'
							}`}
						>
							🗑 {searchIncludeTrash ? 'Papierkorb: an' : 'Papierkorb: aus'}
						</button>
					)}

					{onSync && (
						<button
							type="button"
							onClick={onSync}
							disabled={syncing}
							className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg border text-xs transition-colors shrink-0 ${
								syncing
									? 'border-sky-700 bg-sky-900/30 text-sky-300 cursor-wait'
									: 'border-slate-700 bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
							}`}
							title={lastSyncTime ? `Letzter Sync: ${lastSyncTime.toLocaleTimeString('de-DE')}` : 'Mails synchronisieren'}
						>
							<span className={`text-sm ${syncing ? 'animate-spin' : ''}`}>↻</span>
							{syncing ? <span>{syncLabel || 'Sync…'}</span> : null}
						</button>
					)}
				</div>
				<div className="flex gap-1 overflow-x-auto scrollbar-hide">
					{chips.map(([key, label]) => (
						<button
							key={key}
							onClick={() => onChangeFilter(key)}
							className={`px-2 py-1 rounded-full border text-xs transition-colors whitespace-nowrap ${
								filter === key
									? 'bg-slate-700 border-slate-600 text-slate-100'
									: 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
							}`}
							aria-pressed={filter === key}
						>
							{label}
							{typeof filterCounts?.[key] === 'number' && (
								<span className="ml-1 text-[10px] opacity-80">({filterCounts[key]})</span>
							)}
						</button>
					))}
				</div>
			</div>
			{syncing && (syncProgress?.totalAccounts || 0) > 0 && (
				<div className="px-3 pb-2">
					<div className="flex items-center justify-between text-[11px] text-slate-400">
						<span>Sync-Fortschritt</span>
						<span>
							{Math.min(syncProgress!.completedAccounts, syncProgress!.totalAccounts)}/{syncProgress!.totalAccounts} Konten
						</span>
					</div>
					<div className="mt-1 h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
						<div
							className="h-full bg-sky-500 transition-all duration-300"
							style={{
								width: `${Math.max(0, Math.min(100, (syncProgress!.completedAccounts / syncProgress!.totalAccounts) * 100))}%`,
							}}
						/>
					</div>
				</div>
			)}
		</div>
	);
}
