"use client";

import { useMemo, useState } from 'react';
import { checkPricesInText, type PriceValidationHint } from '@/lib/ai/price-matcher';

type Props = {
	/** Snapshot of the generated text at the moment it was inserted — used to decide what to flag. */
	text: string;
	hints: PriceValidationHint[];
	/** Reads the *current* composer body (may differ from `text` if the user kept editing). */
	getCurrentText: () => string;
	/** Writes a corrected body back into the composer. */
	onFix: (newText: string) => void;
};

function escapeRegex(value: string) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default function PriceCheckBanner({ text, hints, getCurrentText, onFix }: Props) {
	const [resolved, setResolved] = useState<Set<string>>(new Set());

	const results = useMemo(() => checkPricesInText(text, hints), [text, hints]);
	if (results.length === 0) return null;

	const mismatches = results.filter((r) => r.status === 'mismatch' && !resolved.has(r.amount));
	const ok = results.filter((r) => r.status === 'ok');

	function applyFix(wrongAmount: string, correctAmount: string) {
		const current = getCurrentText();
		const pattern = new RegExp(`${escapeRegex(wrongAmount)}(\\s*)(€|EUR|eur|euro)`, 'g');
		const fixed = current.replace(pattern, (_m, space, unit) => `${correctAmount}${space}${unit}`);
		onFix(fixed);
		setResolved((prev) => new Set(prev).add(wrongAmount));
	}

	function dismiss(amount: string) {
		setResolved((prev) => new Set(prev).add(amount));
	}

	if (mismatches.length === 0) {
		if (ok.length === 0) return null;
		return (
			<div className="text-[11px] text-emerald-400 px-1">
				✓ Preis{ok.length > 1 ? 'e' : ''} im Text ({ok.map((o) => `${o.amount} €`).join(', ')}) stimmt mit der Preisliste überein.
			</div>
		);
	}

	return (
		<div className="rounded border border-amber-700/50 bg-amber-950/30 px-2.5 py-2 space-y-1.5">
			{mismatches.map((m) => (
				<div key={m.amount} className="flex flex-wrap items-center gap-1.5 text-[11px] text-amber-300">
					<span>⚠ {m.amount} € steht nicht in der Preisliste.</span>
					{m.suggestions.length > 0 && <span className="text-amber-400/70">Richtig wäre vermutlich:</span>}
					{m.suggestions.map((s) => (
						<button
							key={s}
							type="button"
							onClick={() => applyFix(m.amount, s)}
							className="rounded-full border border-amber-600/60 bg-amber-900/30 px-2 py-0.5 text-amber-200 hover:bg-amber-900/60 transition-colors"
						>
							{s} €
						</button>
					))}
					<button
						type="button"
						onClick={() => dismiss(m.amount)}
						className="ml-auto text-amber-500/60 hover:text-amber-300"
						title="Ignorieren"
					>
						✕
					</button>
				</div>
			))}
		</div>
	);
}
