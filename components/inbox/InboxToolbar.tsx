"use client";
import React, { useEffect, useRef } from 'react';
import type { InboxFilter } from './types';

type Props = {
	q: string;
	onChangeQ: (q: string) => void;
	filter: InboxFilter;
	onChangeFilter: (f: InboxFilter) => void;
};

export default function InboxToolbar({ q, onChangeQ, filter, onChangeFilter }: Props) {
	const inputRef = useRef<HTMLInputElement | null>(null);

	useEffect(() => {
		function onKey(e: KeyboardEvent) {
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
		['assigned', 'Zugeordnet'],
		['unassigned', 'Nicht zugeordnet'],
		['with_attachments', 'Mit Anhängen'],
	];

	return (
		<div className="sticky top-0 z-10 border-b border-slate-800 bg-slate-900/80 backdrop-blur supports-[backdrop-filter]:bg-slate-900/50">
			<div className="px-3 py-2 flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
				<div className="flex items-center gap-2 w-full xl:w-auto">
					<div className="relative flex-1">
						<input
							ref={inputRef}
							type="text"
							placeholder="Suche (/)"
							value={q}
							onChange={(e) => onChangeQ(e.target.value)}
							className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-600"
							aria-label="Suche"
						/>
						<span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-500">/</span>
					</div>
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
						</button>
					))}
				</div>
			</div>
		</div>
	);
}


