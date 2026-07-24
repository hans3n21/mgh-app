'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

interface SnippetSegment { text: string; match: boolean }
interface Snippet {
	truncatedStart: boolean;
	truncatedEnd: boolean;
	segments: SnippetSegment[];
}
interface SearchResult {
	id: string;
	subject: string | null;
	date: string;
	folder: string;
	orderId: string | null;
	fromEmail: string;
	fromName: string | null;
	toEmail: string | null;
	snippet: Snippet | null;
	matchCount: number;
}
interface FullMail {
	id: string;
	subject: string | null;
	text: string | null;
	fromEmail: string;
	fromName: string | null;
	toEmail: string | null;
	date: string;
}

function formatDateTime(value: string): string {
	return new Date(value).toLocaleString('de-DE', {
		day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
	});
}

function Highlighted({ snippet }: { snippet: Snippet }) {
	return (
		<span className="text-sm text-slate-400">
			{snippet.truncatedStart && '… '}
			{snippet.segments.map((seg, i) => (
				seg.match
					? <mark key={i} className="rounded bg-amber-400/30 px-0.5 text-amber-200">{seg.text}</mark>
					: <span key={i}>{seg.text}</span>
			))}
			{snippet.truncatedEnd && ' …'}
		</span>
	);
}

/** Kundengescopte Volltextsuche über die Mails eines Kunden, mit Treffer-Ausschnitten. */
export default function CustomerMailSearch({ customerId }: { customerId: string }) {
	const [query, setQuery] = useState('');
	const [debouncedQuery, setDebouncedQuery] = useState('');
	const [results, setResults] = useState<SearchResult[]>([]);
	const [loading, setLoading] = useState(false);
	const [expandedId, setExpandedId] = useState<string | null>(null);
	const [expandedMails, setExpandedMails] = useState<Record<string, FullMail>>({});
	const [expandedLoading, setExpandedLoading] = useState(false);
	const requestSeq = useRef(0);

	useEffect(() => {
		const handle = setTimeout(() => setDebouncedQuery(query.trim()), 300);
		return () => clearTimeout(handle);
	}, [query]);

	useEffect(() => {
		if (!debouncedQuery) {
			setResults([]);
			setLoading(false);
			return;
		}
		const seq = ++requestSeq.current;
		setLoading(true);
		fetch(`/api/customers/${customerId}/mails?q=${encodeURIComponent(debouncedQuery)}`)
			.then((r) => (r.ok ? r.json() : { results: [] }))
			.then((data) => {
				if (requestSeq.current === seq) setResults(data.results || []);
			})
			.catch(() => {
				if (requestSeq.current === seq) setResults([]);
			})
			.finally(() => {
				if (requestSeq.current === seq) setLoading(false);
			});
	}, [debouncedQuery, customerId]);

	const toggleExpand = async (mailId: string) => {
		if (expandedId === mailId) {
			setExpandedId(null);
			return;
		}
		setExpandedId(mailId);
		if (expandedMails[mailId]) return;
		setExpandedLoading(true);
		try {
			const res = await fetch(`/api/mails/${mailId}`);
			if (res.ok) {
				const mail = await res.json();
				setExpandedMails((prev) => ({ ...prev, [mailId]: mail }));
			}
		} finally {
			setExpandedLoading(false);
		}
	};

	const statusLabel = useMemo(() => {
		if (!debouncedQuery) return null;
		if (loading) return 'Suche…';
		if (results.length === 0) return `Keine Treffer für „${debouncedQuery}“`;
		return `${results.length} ${results.length === 1 ? 'Mail' : 'Mails'} mit Treffer`;
	}, [debouncedQuery, loading, results.length]);

	return (
		<section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
			<h3 className="mb-2 text-sm font-semibold text-slate-200">🔎 Mails durchsuchen</h3>
			<input
				type="text"
				value={query}
				onChange={(e) => setQuery(e.target.value)}
				placeholder="Suchbegriff, z. B. Pickguard…"
				className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
			/>
			{statusLabel && <div className="mt-2 text-xs text-slate-500">{statusLabel}</div>}

			{results.length > 0 && (
				<ul className="mt-3 divide-y divide-slate-800">
					{results.map((mail) => {
						const expanded = expandedId === mail.id;
						const full = expandedMails[mail.id];
						return (
							<li key={mail.id} className="py-2">
								<button
									type="button"
									onClick={() => toggleExpand(mail.id)}
									className="w-full text-left"
								>
									<div className="flex items-center justify-between gap-3">
										<div className="truncate text-sm font-medium text-slate-200">{mail.subject || 'Ohne Betreff'}</div>
										{mail.matchCount > 1 && (
											<span className="shrink-0 rounded-full border border-slate-700 px-2 py-0.5 text-[11px] text-slate-400">
												{mail.matchCount} Treffer
											</span>
										)}
									</div>
									<div className="mt-0.5 text-xs text-slate-500">
										{formatDateTime(mail.date)} · {mail.folder}
										{mail.orderId && (
											<>
												{' · '}
												<Link
													href={`/app/orders/${mail.orderId}`}
													onClick={(e) => e.stopPropagation()}
													className="text-sky-400 hover:text-sky-300"
												>
													{mail.orderId}
												</Link>
											</>
										)}
									</div>
									{mail.snippet && <div className="mt-1">{<Highlighted snippet={mail.snippet} />}</div>}
								</button>

								{expanded && (
									<div className="mt-2 rounded-lg border border-slate-800 bg-slate-950 p-3">
										{expandedLoading && !full ? (
											<div className="text-xs text-slate-500">Lädt…</div>
										) : full ? (
											<>
												<div className="mb-2 flex items-center justify-between gap-2">
													<div className="text-xs text-slate-500">
														Von {full.fromName || full.fromEmail} · {formatDateTime(full.date)}
													</div>
													<Link
														href="/app/posteingang"
														className="shrink-0 text-xs text-sky-400 hover:text-sky-300"
													>
														Im Posteingang öffnen ↗
													</Link>
												</div>
												<div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300">
													{full.text || '(kein Text)'}
												</div>
											</>
										) : (
											<div className="text-xs text-slate-500">Mail konnte nicht geladen werden.</div>
										)}
									</div>
								)}
							</li>
						);
					})}
				</ul>
			)}
		</section>
	);
}
