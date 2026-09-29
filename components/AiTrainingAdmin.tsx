'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { ModelConfig } from '@/lib/ai-training/contracts';

async function request(body?: Record<string, unknown>) {
  const res = await fetch('/api/admin/ai-training', { method: body ? 'POST' : 'GET', cache: 'no-store',
    ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
  const result = await res.json();
  if (!res.ok) throw new Error(result.error || 'Anfrage fehlgeschlagen.');
  return result;
}
const button = 'rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-100 hover:bg-slate-800 disabled:opacity-40';
const input = 'mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm';
const panel = 'rounded-xl border border-slate-700 bg-slate-900/60 p-4 space-y-4';

/** Lokales Sprachmodell fuer die Auftragsvorschlaege (Ollama). */
export default function AiTrainingAdmin() {
  const [config, setConfig] = useState<ModelConfig | null>(null);
  const [models, setModels] = useState<{ name: string; size: number }[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    request().then(d => { if (active) setConfig(d.config); }).catch(e => { if (active) setError(e instanceof Error ? e.message : 'Laden fehlgeschlagen.'); });
    return () => { active = false; };
  }, []);
  async function action(fn: () => Promise<void>) {
    setBusy(true); setError(''); setMessage('');
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : 'Aktion fehlgeschlagen.'); }
    finally { setBusy(false); }
  }
  return <section className="mx-auto max-w-4xl space-y-5 rounded-xl bg-slate-950 p-3 text-slate-100 sm:p-6">
    <header className="flex flex-wrap items-start justify-between gap-3"><div>
      <p className="text-xs font-medium uppercase tracking-wider text-sky-300">Administration · lokal</p>
      <h1 className="mt-1 text-2xl font-semibold">KI-Training</h1>
      <p className="mt-2 max-w-3xl text-sm text-slate-300">Lokales Sprachmodell für die Auftragsvorschläge. Die Vorschläge erscheinen im Auftrag; jede Entscheidung dort ist ein Lernbeispiel.
        Trefferquote je Feld und Personenerkennung: <Link href="/app/settings" className="text-sky-300 underline">Einstellungen → Lokale Mail-Analyse</Link>.</p></div>
      <Link href="/app/posteingang" className={button}>Mails prüfen →</Link></header>
    {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
    {message && <p role="status" className="text-sm text-emerald-300">{message}</p>}
    {config && <div className={panel}>
      <h2 className="text-lg font-semibold">Lokale Modelle (Ollama)</h2>
      <p className="text-sm text-slate-300">update.bat stellt auf jedem Rechner ein passendes Modell bereit (unter 24 GB Arbeitsspeicher die kleinere Variante) und hat damit Vorrang vor der Auswahl hier. Die Auswahl gilt für Rechner ohne eigene Einrichtung.</p>
      <label className="block text-sm">Lokale Dienstadresse<input aria-label="Lokale Dienstadresse" className={input} disabled={busy} value={config.baseUrl} onChange={e => setConfig({ ...config, baseUrl: e.target.value })} /></label>
      <p className="text-xs text-slate-400">127.0.0.1 meint den Rechner, auf dem die App läuft. Alternativ ist eine private IPv4-Adresse möglich.</p>
      <button className={button} disabled={busy} onClick={() => action(async () => { const result = await request({ action: 'models', baseUrl: config.baseUrl }) as { models: { name: string; size: number }[] }; setModels(result.models); setMessage(`${result.models.length} lokale Modelle gefunden.`); })}>Installierte Modelle laden</button>
      <label className="block text-sm">Modell für die Auftragsvorschläge<select aria-label="Modell für die Auftragsvorschläge" className={input} disabled={busy} value={config.model} onChange={e => setConfig({ ...config, model: e.target.value })}><option value="">Bitte wählen</option>{Array.from(new Set([config.model, ...models.map(m => m.name)])).filter(Boolean).map(m => <option key={m}>{m}</option>)}</select></label>
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={config.localOnlyConfirmed} disabled={busy} onChange={e => setConfig({ ...config, localOnlyConfirmed: e.target.checked })} />Ollama läuft intern mit OLLAMA_NO_CLOUD=1; kein externer Proxy ist vorgeschaltet.</label>
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={config.useExamples} disabled={busy} onChange={e => setConfig({ ...config, useExamples: e.target.checked })} />Bis zu zwei geprüfte Stellen desselben Auftragstyps als Lernbeispiele beifügen (Wirkung in der Trefferquote „mit/ohne Lernbeispiele“)</label>
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={config.enabled} disabled={busy} onChange={e => setConfig({ ...config, enabled: e.target.checked })} />Auftragsvorschläge mit dem lokalen Modell erzeugen</label>
      <button className={`${button} border-sky-600`} disabled={busy} onClick={() => action(async () => { await request({ action: 'config', config }); setMessage('Einstellungen gespeichert.'); })}>Modelleinstellungen speichern</button>
      <p className="text-xs text-slate-400">Kein Modell-Download durch die App und kein Cloud-Ersatz: Cloud-Modelle sind gesperrt, bei Dienstfehlern wird die Auswertung übersprungen.</p>
    </div>}
  </section>;
}
