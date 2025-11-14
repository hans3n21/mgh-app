"use client";

import { useEffect, useMemo, useState } from 'react';
import SpecFormCompact from '@/components/spec/SpecFormCompact';

type Suggestion = {
	field: string;
	value: string;
	sourceMailId: string;
	sourceLabel: string;
	confidence: number;
};

type OrderTypeSuggestion = { key: string; score: number; reasons: string[] };

export default function InlineSpecEditor({
    mail,
    orderId,
    initialOrderType,
    suggestions = [],
    suggestedOrderTypes = [],
    onCreated,
}: {
    mail: { id: string; subject?: string | null; attachments?: Array<{ id: string; filename: string; mimeType: string | null }> };
    orderId: string | null;
    initialOrderType?: string | null;
    suggestions?: Suggestion[];
    suggestedOrderTypes?: OrderTypeSuggestion[];
    onCreated?: (orderId: string) => void;
}) {
	const [typeKey, setTypeKey] = useState<string>(initialOrderType || 'GUITAR');
	const [pendingSpec, setPendingSpec] = useState<Record<string, string>>({});
    const [busy, setBusy] = useState(false);
    const [orderImages, setOrderImages] = useState<Array<{ id: string; path: string }>>([]);

	useEffect(() => {
		if (initialOrderType) setTypeKey(initialOrderType);
	}, [initialOrderType]);

	const groupedSuggestions = useMemo(() => {
		const byField: Record<string, Suggestion[]> = {};
		for (const s of suggestions) {
			(byField[s.field] = byField[s.field] || []).push(s);
		}
		return byField;
	}, [suggestions]);

    // Lade Order-Bilder, um anzuzeigen, ob Mail-Anhänge bereits gespiegelt sind
    useEffect(() => {
        (async () => {
            if (!orderId) { setOrderImages([]); return; }
            try {
                const res = await fetch(`/api/orders/${orderId}/images`);
                if (res.ok) {
                    const imgs = await res.json();
                    setOrderImages(imgs);
                }
            } catch {}
        })();
    }, [orderId]);

    const isAttachmentLinked = (attId: string) => {
        const target = `/api/attachments/${attId}`;
        return orderImages?.some((img) => img.path === target);
    };

	return (
		<div className="mt-6 space-y-3">
			<div className="flex items-center justify-between">
				<div className="text-sm font-medium">Datenblatt (Inline)</div>
				{!orderId && (
					<div className="flex flex-wrap gap-2">
						{(suggestedOrderTypes || []).slice(0, 5).map((s) => (
							<button
								key={s.key}
								onClick={() => setTypeKey(s.key)}
								className={`text-xs rounded-full px-2 py-1 border ${typeKey === s.key ? 'bg-sky-600 text-white border-sky-600' : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800'}`}
								title={`Score ${s.score}`}
							>
								{s.key}
							</button>
						))}
					</div>
				)}
			</div>
            {/* Attachments Panel */}
            {mail.attachments && mail.attachments.length > 0 && (
                <div className="rounded border border-slate-800 p-2">
                    <div className="text-sm font-medium mb-2">Anhänge aus Mail</div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                        {mail.attachments.map((a) => {
                            const linked = isAttachmentLinked(a.id);
                            return (
                                <div key={a.id} className="rounded border border-slate-700 p-2 bg-slate-900">
                                    <div className="text-xs text-slate-300 truncate" title={a.filename}>{a.filename}</div>
                                    <div className="mt-1 h-20 overflow-hidden rounded bg-slate-800 flex items-center justify-center">
                                        <img src={`/api/attachments/${a.id}`} className="max-h-20" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                    </div>
                                    <div className="flex items-center justify-between mt-2">
                                        <span className={`text-[11px] ${linked ? 'text-emerald-400' : 'text-slate-400'}`}>{linked ? 'Verknüpft' : 'Nicht verknüpft'}</span>
                                        {!linked && orderId && (
                                            <button
                                                className="text-[11px] rounded border border-slate-700 px-2 py-0.5 hover:bg-slate-800"
                                                title="Anhang in Auftrag spiegeln"
                                                onClick={async () => {
                                                    try {
                                                        const res = await fetch(`/api/mails/${mail.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId }) });
                                                        if (res.ok) {
                                                            const r = await fetch(`/api/orders/${orderId}/images`);
                                                            if (r.ok) setOrderImages(await r.json());
                                                        }
                                                    } catch {}
                                                }}
                                            >Zum Auftrag verknüpfen</button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}



			<SpecFormCompact
				typeKey={typeKey}
				value={pendingSpec}
				onChange={(kv) => setPendingSpec((p) => ({ ...p, ...kv }))}
			/>

			<div className="flex items-center gap-2">
				{!orderId ? (
					<button
						disabled={busy}
						onClick={async () => {
							setBusy(true);
							try {
								const res = await fetch(`/api/mails/${mail.id}/create-order`, {
									method: 'POST',
									headers: { 'Content-Type': 'application/json' },
									body: JSON.stringify({ orderType: typeKey, spec: pendingSpec }),
								});
								const data = await res.json();
								if (!res.ok) throw new Error(data?.error || res.status);
								alert('Auftrag erstellt');
								onCreated?.(data.orderId);
							} catch (e: any) {
								alert(`Fehler: ${String(e?.message || e)}`);
							} finally {
								setBusy(false);
							}
						}}
						className="rounded bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 text-xs font-medium"
					>
						Auftrag erstellen
					</button>
				) : (
					<button
						disabled={busy}
						onClick={async () => {
							setBusy(true);
							try {
								const res = await fetch(`/api/orders/${orderId}/spec/autofill-from-mail`, {
									method: 'POST',
									headers: { 'Content-Type': 'application/json' },
									body: JSON.stringify({ mailId: mail.id, strategy: 'emptyOnly', extra: pendingSpec }),
								});
								const data = await res.json().catch(() => ({}));
								if (!res.ok) throw new Error(data?.error || res.status);
								alert('Datenblatt aktualisiert');
							} catch (e: any) {
								alert(`Fehler: ${String(e?.message || e)}`);
							} finally {
								setBusy(false);
							}
						}}
						className="rounded bg-sky-600 hover:bg-sky-500 px-3 py-1.5 text-xs font-medium"
					>
						Datenblatt aktualisieren
					</button>
				)}
				<button
					disabled={busy}
					onClick={() => setPendingSpec({})}
					className="rounded border border-slate-700 px-3 py-1.5 text-xs"
				>
					Zurücksetzen
				</button>
			</div>
		</div>
	);
}


