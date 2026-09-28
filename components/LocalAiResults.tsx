'use client';

import { useState } from 'react';
import { DECISION_LABELS, type Analysis, type Finding } from '@/lib/local-ai/contracts';

export default function LocalAiResults({ result, onSave }: { result: Analysis; onSave?: (finding: Finding) => Promise<string> }) {
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  async function save(finding: Finding) {
    if (!onSave) return;
    setSaving(finding.id); setError('');
    try { const message = await onSave(finding); setSaved(previous => ({ ...previous, [finding.id]: message })); }
    catch (err) { setError(err instanceof Error ? err.message : 'Vorschlag konnte nicht gespeichert werden.'); }
    finally { setSaving(null); }
  }
  return <div className="space-y-2">
    <p className="text-xs text-slate-400">Laya Multilingual · {(result.elapsedMs / 1000).toFixed(1)} s · Modellstand {result.revision.slice(0, 12)}
      {result.hadQuotes ? ' · Zitierter Verlauf entfernt' : ''}</p>
    <p className="text-xs text-amber-200">Pilot: Alle Ergebnisse prüfen. Die Prozentwerte sind Modellbewertungen, keine gemessene Trefferrate.</p>
    {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
    {result.findings.map(f => <div key={f.id} className="rounded border border-slate-700 bg-slate-950/40 p-3 space-y-1">
      <div className="flex flex-wrap justify-between gap-2">
        <p className="text-sm"><strong>{f.label}:</strong> {f.value}</p>
        <span className={`text-xs ${f.decision === 'confirmed' ? 'text-emerald-300' : 'text-amber-200'}`}>
          Modellurteil: {DECISION_LABELS[f.decision]} · {Math.round(f.probability * 100)} %
        </span>
      </div>
      {f.currentValue !== undefined && <p className="text-xs text-slate-400">Im Auftrag: {f.currentValue || 'Noch leer'}</p>}
      <blockquote className="whitespace-pre-wrap border-l-2 border-slate-600 pl-2 text-xs text-slate-300">{f.evidence}</blockquote>
      {onSave && f.decision === 'confirmed' && <button type="button" onClick={() => save(f)} disabled={saving !== null || !!saved[f.id]}
        className="rounded border border-violet-600 px-2 py-1 text-xs text-violet-200 disabled:opacity-50">
        {saved[f.id] || (saving === f.id ? 'Speichert …' : 'Als Auftragsvorschlag vormerken')}
      </button>}
    </div>)}
  </div>;
}
