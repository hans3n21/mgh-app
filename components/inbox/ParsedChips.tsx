"use client";
import React from 'react';

type Chip = { key: string; label: string; value: string; source?: 'regex' | 'llm' };

type Props = {
	chips: Chip[];
	onApply: (key: string, value: string) => void;
};

export default function ParsedChips({ chips, onApply }: Props) {
	if (!chips || chips.length === 0) return null;
	return (
		<div className="flex flex-wrap gap-2">
			{chips.map((c) => (
				<button
					key={c.key}
					draggable
					onDragStart={(e) => {
						e.dataTransfer.setData('text/x-spec-key', c.key);
						e.dataTransfer.setData('text/plain', c.value);
					}}
					onClick={() => onApply(c.key, c.value)}
					className="group inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800"
					title="Klicken zum Übernehmen; Drag&Drop auf Feld möglich"
				>
					<span className="font-medium">{c.label}:</span>
					<span>{c.value}</span>
					<span className="ml-1 rounded bg-slate-800 px-1 py-0.5 text-[10px] text-slate-400 border border-slate-700">{c.source || 'regex'}</span>
				</button>
			))}
		</div>
	);
}


