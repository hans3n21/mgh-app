'use client';

import { useEffect, useState } from 'react';
import type { Analysis, Finding } from '@/lib/local-ai/contracts';
import LocalAiResults from '@/components/LocalAiResults';

export default function LocalMailAnalysis({ mailId, orderId }: { mailId: string; orderId: string }) {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Analysis | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/settings/local-ai', { signal: controller.signal }).then(r => r.ok ? r.json() : null)
      .then(c => { if (!controller.signal.aborted) setEnabled(!!c?.enabled); }).catch(() => {});
    return () => controller.abort();
  }, []);
  async function analyze() {
    setBusy(true); setError(''); setResult(null);
    try {
      const res = await fetch(`/api/mails/${encodeURIComponent(mailId)}/local-ai`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.orderId !== orderId || data.mailId !== mailId) throw new Error('Die Mailzuordnung hat sich geändert. Bitte die Mail neu öffnen.');
      setResult(data);
    } catch (e) { setError(e instanceof Error ? e.message : 'Lokale Prüfung fehlgeschlagen.'); }
    finally { setBusy(false); }
  }
  async function save(finding: Finding) {
    const res = await fetch(`/api/mails/${encodeURIComponent(mailId)}/local-ai`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, field: finding.field, value: finding.value }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Speichern fehlgeschlagen.');
    window.dispatchEvent(new CustomEvent('mgh:suggestions-updated'));
    return data.alreadyProcessed ? 'Bereits bearbeitet' : 'Im Auftrag vorgemerkt';
  }
  if (!enabled) return null;
  return <section className="mb-3 rounded border border-violet-800/60 bg-violet-950/20 p-3 space-y-3">
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" disabled={busy} onClick={analyze} className="rounded border border-violet-600 px-2 py-1 text-xs text-violet-200 disabled:opacity-50">
        {busy ? 'Lokaler Dienst wertet aus …' : 'Lokal prüfen · Pilot'}
      </button>
      {result && <button type="button" onClick={() => setResult(null)} className="text-xs text-slate-400">Ergebnisse schließen</button>}
    </div>
    {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
    {result && <LocalAiResults result={result} onSave={save} />}
  </section>;
}
