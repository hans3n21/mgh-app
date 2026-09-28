'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { INTENTS, PRIVACY_FIELDS } from '@/lib/mail-training/contracts';
import type { Dashboard, ModelConfig } from '@/lib/ai-training/contracts';

export type TrainingTransport = (body?: Record<string, unknown>) => Promise<unknown>;
export const trainingRequest: TrainingTransport = async body => {
  const res = await fetch('/api/admin/ai-training', { method: body ? 'POST' : 'GET', cache: 'no-store',
    ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
  if (res.ok && body?.action === 'export') return res.text();
  const result = await res.json(); if (!res.ok) throw new Error(result.error || 'Anfrage fehlgeschlagen.'); return result;
};
const button = 'rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-100 hover:bg-slate-800 disabled:opacity-40';
const input = 'mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm';
const panel = 'rounded-xl border border-slate-700 bg-slate-900/60 p-4 space-y-4';
const fieldName = (field: string, data: Dashboard['cases'][number]) => PRIVACY_FIELDS[field] || data.snapshot.fields.find(f => f.key === field)?.label || field;

export default function AiTrainingAdmin({ transport = trainingRequest, demo = false }: { transport?: TrainingTransport; demo?: boolean }) {
  const [data, setData] = useState<Dashboard | null>(null);
  const [config, setConfig] = useState<ModelConfig | null>(null);
  const [tab, setTab] = useState<'cases' | 'models' | 'export'>('cases');
  const [models, setModels] = useState<{ name: string; size: number }[]>([]);
  const [selectedCases, setSelectedCases] = useState<string[]>([]);
  const [selectedModels, setSelectedModels] = useState<string[]>(['rules']);
  const [examples, setExamples] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const stop = useRef(false);
  const load = useCallback(async (refreshConfig = false) => {
    const result = await transport() as Dashboard; setData(result);
    if (refreshConfig) setConfig(result.config);
    return result;
  }, [transport]);
  useEffect(() => { let active = true; transport().then(value => { if (active) { const d = value as Dashboard; setData(d); setConfig(d.config); } })
    .catch(e => { if (active) setError(e instanceof Error ? e.message : 'Laden fehlgeschlagen.'); }); return () => { active = false; stop.current = true; }; }, [transport]);
  async function action(fn: () => Promise<void>) {
    setBusy(true); setError(''); setMessage('');
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : 'Aktion fehlgeschlagen.'); }
    finally { setBusy(false); }
  }
  const choices = Array.from(new Set(['rules', 'laya', ...(config?.model ? [config.model] : []), ...models.map(m => m.name)]));
  const modelLabel = (m: string) => m === 'rules' ? 'Regeln (ohne Kunden-DB)' : m === 'laya' ? 'Laya-Pilot (nur Auftragsfelder)' : m;
  async function compare() {
    stop.current = false; let done = 0; const total = selectedCases.length * selectedModels.length;
    for (const caseId of selectedCases) for (const model of selectedModels) {
      if (stop.current) { setMessage(`Vergleich nach ${done} von ${total} Läufen angehalten.`); return; }
      setMessage(`Lauf ${done + 1} / ${total}: ${modelLabel(model)}. Auf CPU kann ein Lauf bis zu drei Minuten dauern.`);
      await transport({ action: 'compare', caseId, model, useExamples: examples }); done++;
      await load();
    }
    setMessage(`${done} Läufe abgeschlossen. Fehler und Belege stehen unter den jeweiligen Prüffällen.`);
  }
  return <section className="mx-auto max-w-7xl space-y-5 rounded-xl bg-slate-950 p-3 text-slate-100 sm:p-6">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-medium uppercase tracking-wider text-sky-300">Administration · lokal</p>
      <h1 className="mt-1 text-2xl font-semibold">KI-Training</h1><p className="mt-2 max-w-3xl text-sm text-slate-300">Erkennung prüfen, aus bestätigten Beispielen lernen und Modelle mit demselben Gesprächsverlauf vergleichen.</p></div>
      <Link href="/app/posteingang" className={button}>Mails prüfen →</Link></header>
    {demo && <p className="rounded border border-amber-700 p-3 text-sm text-amber-200">Demo mit erfundenen Daten. Modellläufe werden simuliert; keine Datenbankänderungen.</p>}
    <div className="grid gap-3 sm:grid-cols-3">{[['Lernfälle', data?.cases.filter(c => c.partition === 'train').length || 0], ['Testfälle', data?.cases.filter(c => c.partition === 'test').length || 0], ['Gespeicherte Läufe (Ansicht)', data?.cases.reduce((n, c) => n + c.results.length, 0) || 0]].map(([label, n]) => <div key={label} className="rounded-xl border border-slate-700 p-4"><div className="text-2xl font-semibold">{n}</div><div className="text-xs text-slate-400">{label}</div></div>)}</div>
    <nav aria-label="KI-Training Bereiche" className="flex flex-wrap gap-2">{([['cases', 'Prüffälle & Vergleich'], ['models', 'Lokale Modelle'], ['export', 'Trainingsdaten']] as const).map(([key, label]) => <button key={key} aria-pressed={tab === key} onClick={() => setTab(key)} className={`${button} ${tab === key ? 'border-sky-500 bg-sky-950' : ''}`}>{label}</button>)}</nav>
    {error && <p role="alert" className="rounded border border-rose-700 p-3 text-sm text-rose-200">{error}</p>}
    <p role="status" className="text-sm text-sky-200">{message || (!data && !error ? 'Lädt …' : '')}</p>
    {tab === 'models' && config && <div className={panel}>
      <h2 className="text-lg font-semibold">Ollama auf dem Server-PC</h2>
      <p className="text-sm text-slate-300">Für euren i3 mit 16 GB zuerst Qwen3.5 4B prüfen, anschließend 9B vergleichen. Geschwindigkeit und Qualität müssen wir auf diesem Rechner messen. Modelle werden nacheinander geladen und nach dem Lauf entladen.</p>
      <label className="block text-sm">Lokale Dienstadresse<input aria-label="Lokale Dienstadresse" className={input} disabled={busy} value={config.baseUrl} onChange={e => setConfig({ ...config, baseUrl: e.target.value })} /></label>
      <p className="text-xs text-slate-400">127.0.0.1 meint den Rechner, auf dem der MGH-Server läuft. Alternativ ist eine private IPv4-Adresse möglich.</p>
      <button className={button} disabled={busy} onClick={() => action(async () => { const result = await transport({ action: 'models', baseUrl: config.baseUrl }) as { models: { name: string; size: number }[] }; setModels(result.models); setMessage(`${result.models.length} lokale Modelle gefunden.`); })}>Installierte Modelle laden</button>
      <label className="block text-sm">Modell für die Mailprüfung<select aria-label="Modell für die Mailprüfung" className={input} disabled={busy} value={config.model} onChange={e => setConfig({ ...config, model: e.target.value })}><option value="">Bitte wählen</option>{Array.from(new Set([config.model, ...models.map(m => m.name)])).filter(Boolean).map(m => <option key={m}>{m}</option>)}</select></label>
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={config.localOnlyConfirmed} disabled={busy} onChange={e => setConfig({ ...config, localOnlyConfirmed: e.target.checked })} />Ollama läuft intern mit OLLAMA_NO_CLOUD=1; kein externer Proxy ist vorgeschaltet.</label>
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={config.useExamples} disabled={busy} onChange={e => setConfig({ ...config, useExamples: e.target.checked })} />Bis zu zwei passende Lernfälle aus anderen Gesprächen beifügen</label>
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={config.enabled} disabled={busy} onChange={e => setConfig({ ...config, enabled: e.target.checked })} />Lokale Gesprächsanalyse im Mail-Trainingsmodus aktivieren</label>
      <button className={`${button} border-sky-600`} disabled={busy} onClick={() => action(async () => { await transport({ action: 'config', config }); await load(true); setMessage('Einstellungen gespeichert.'); })}>Modelleinstellungen speichern</button>
      <details className="space-y-3 text-sm"><summary className="cursor-pointer text-sky-300">Einrichtung auf dem anderen Windows-Rechner</summary><p>Ollama installieren, Cloud-Funktionen deaktivieren und Ollama neu starten. Die Befehle lädt man einmal mit Internetzugang; danach erfolgen die Auswertungen lokal.</p>
        <pre className="overflow-auto rounded bg-slate-950 p-3 text-xs">{'[Environment]::SetEnvironmentVariable("OLLAMA_NO_CLOUD", "1", "User")\n# Ollama danach vollständig beenden und neu starten.\nollama pull qwen3.5:4b\n# Optional für den Vergleich:\nollama pull qwen3.5:9b'}</pre>
        <p className="text-xs text-slate-400">Kein Modell-Download durch diese App. Bei Dienstfehlern wird die Auswertung gestoppt. Jev/Kev benötigen einen anderen geprüften lokalen Dienst und sind hier noch nicht angebunden.</p></details>
    </div>}
    {tab === 'cases' && <>
      <div className={panel}><h2 className="font-semibold">Gemeinsamer Vergleich</h2><p className="text-sm text-slate-300">Im Posteingang alle relevanten Stellen prüfen und anschließend „Als Prüffall speichern“ wählen. Kunden, Aufträge und Gespräche dürfen nicht zugleich Lern- und Testfälle liefern.</p>
        <fieldset disabled={busy} className="flex flex-wrap gap-4"><legend className="mb-2 text-xs text-slate-400">Modelle auswählen · zusätzliche Modelle unter „Lokale Modelle“ laden</legend>{choices.map(m => <label key={m} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selectedModels.includes(m)} onChange={e => setSelectedModels(e.target.checked ? [...selectedModels, m] : selectedModels.filter(x => x !== m))} />{modelLabel(m)}</label>)}</fieldset>
        <label className="flex gap-2 text-sm"><input type="checkbox" disabled={busy} checked={examples} onChange={e => setExamples(e.target.checked)} />Ollama mit freigegebenen Lernbeispielen vergleichen</label>
        <div className="flex flex-wrap gap-2"><button className={`${button} border-sky-600 bg-sky-950`} disabled={busy || !selectedCases.length || !selectedModels.length} onClick={() => action(compare)}>Ausgewählte Fälle vergleichen</button>{busy && <button className={button} onClick={() => { stop.current = true; setMessage('Stopp vorgemerkt. Der laufende Modellaufruf wird noch abgeschlossen.'); }}>Nach diesem Lauf stoppen</button>}<button className={button} disabled={busy} onClick={() => action(async () => { await load(); setMessage('Ansicht aktualisiert.'); })}>Aktualisieren</button></div>
        <p className="text-xs text-slate-400">Regeln und Laya sehen nur die aktuelle Mail. Ollama sieht den angezeigten Verlauf. Bewertet wird das Gesamtergebnis der Erkennung; reine Modellleistung ist dadurch nicht direkt vergleichbar. Auftragsfelder: Feld, Wert und Absicht; Datenschutz: zusätzlich exakte Textstelle.</p>
      </div>
      {data && !data.cases.length && <div className={`${panel} py-10 text-center`}><h2 className="font-medium">Noch keine geprüften Fälle</h2><p className="text-sm text-slate-400">Starte mit einigen eindeutigen Wünschen, offenen Fragen und echten Änderungswünschen.</p><Link href="/app/posteingang" className="text-sm text-sky-300 underline">Zum Posteingang</Link></div>}
      {data?.cases.map(c => <article key={c.id} className={`${panel} min-w-0`}>
        {c.unavailable && <p className="text-sm text-amber-200">Eine Mail aus diesem Gespräch wurde gelöscht. Dieser Fall ist gesperrt. Du kannst ihn löschen und nach erneuter Prüfung ersetzen.</p>}
        <div className="flex flex-wrap items-center justify-between gap-3"><label className="flex min-w-0 items-start gap-3"><input type="checkbox" aria-label={`Prüffall ${c.title} auswählen`} className="mt-1" disabled={busy || c.unavailable} checked={selectedCases.includes(c.id)} onChange={e => setSelectedCases(e.target.checked ? [...selectedCases, c.id] : selectedCases.filter(id => id !== c.id))} /><span className="min-w-0"><strong className="block break-words">{c.title}</strong><span className="text-xs text-slate-400">{c.partition === 'test' ? 'Testfall · wird nie als Lernbeispiel verwendet' : 'Lernfall · Ergebnisse sind kein unabhängiger Test'} · {c.snapshot.messages.length} Mails · Stand {new Date(c.createdAt).toLocaleDateString('de-DE')}</span></span></label>
          <div className="flex gap-2"><Link className={button} href={`/app/ki-training/mails/${encodeURIComponent(c.mailId)}`}>Quellmail</Link><button className={button} disabled={busy} onClick={() => setDeleteId(c.id)}>Fall löschen</button></div></div>
        {deleteId === c.id && <div className="rounded border border-amber-700 p-3 text-sm space-y-2"><p>Prüffall und seine Vergleichsläufe löschen? Die Mail und der Auftrag bleiben erhalten.</p><button className={button} disabled={busy} onClick={() => action(async () => { await transport({ action: 'delete', caseId: c.id }); setSelectedCases(selectedCases.filter(id => id !== c.id)); setDeleteId(null); await load(); })}>Löschen bestätigen</button> <button className={button} onClick={() => setDeleteId(null)}>Abbrechen</button></div>}
        <details><summary className="cursor-pointer text-sm text-sky-300">Gespräch und erwartete Erkennung ({c.expected.length})</summary><div className="mt-3 grid min-w-0 gap-4 lg:grid-cols-2"><div className="min-w-0 space-y-3">{c.snapshot.messages.map(m => <div key={m.id} className={`rounded border p-3 ${m.id === c.snapshot.currentId ? 'border-sky-600' : 'border-slate-700'}`}><p className="mb-2 text-xs text-slate-400">{m.role === 'staff' ? 'MGH' : m.role === 'customer' ? 'Kunde' : 'Absender unklar'} · {new Date(m.date).toLocaleString('de-DE')}{m.id === c.snapshot.currentId ? ' · aktuelle Mail' : ''}</p><pre className="whitespace-pre-wrap break-words font-sans text-sm">{m.text}</pre></div>)}{c.snapshot.omitted > 0 && <p className="text-xs text-amber-200">Mindestens {c.snapshot.omitted} ältere Mails liegen außerhalb dieses Ausschnitts.</p>}</div>
          <div className="min-w-0 space-y-2">{c.expected.map((f, i) => <div key={i} className="rounded border border-slate-700 p-3 text-sm"><p className={f.kind === 'privacy' ? 'text-violet-300' : 'text-cyan-300'}>{fieldName(f.field, c)}: {f.value}</p><p className="text-xs text-slate-400">{f.kind === 'privacy' ? 'Zensieren' : INTENTS[f.intent]}</p><blockquote className="mt-2 break-words text-slate-300">„{f.quote}“</blockquote>{f.evidence.map((e, j) => <p key={j} className="mt-1 break-words text-xs text-slate-400">Beleg: „{e.quote}“</p>)}</div>)}{!c.expected.length && <p className="text-sm text-slate-400">Geprüfter Fall ohne relevante Angaben.</p>}</div></div></details>
        <div className="space-y-2">{c.results.map(r => <details key={r.id} className="rounded border border-slate-700 p-3"><summary className="cursor-pointer text-sm"><span className="font-medium">{modelLabel(r.model)}</span> · {(r.durationMs / 1000).toFixed(1)} s · {r.examples.length ? `${r.examples.length} Lernbeispiele` : 'ohne Lernbeispiele'}<span className={`mt-1 block text-xs ${r.error ? 'text-rose-300' : r.metrics.exact ? 'text-emerald-300' : 'text-amber-200'}`}>{r.error || `${r.metrics.correct}/${r.metrics.expected} richtig · ${r.metrics.missed} übersehen · ${r.metrics.extra} zusätzlich/falsch · ${r.metrics.unsafeConfirmations} falsche Bestätigungen · ${r.metrics.privacyMissed} Datenschutzstellen übersehen`}</span></summary>
          <p className="mt-2 break-all text-xs text-slate-500">{new Date(r.createdAt).toLocaleString('de-DE')} · {r.protocol} · Modellstand {r.digest || 'nicht verfügbar'}</p><ul className="mt-2 space-y-2 text-sm">{r.findings.map((f, i) => <li key={i} className="break-words">{fieldName(f.field, c)}: {f.value} · {f.kind === 'privacy' ? 'Zensieren' : INTENTS[f.intent]}<blockquote className="text-xs text-slate-400">„{f.quote}“</blockquote>{f.evidence.map((e, j) => <p key={j} className="text-xs text-slate-400">Beleg: „{e.quote}“</p>)}</li>)}</ul></details>)}</div>
      </article>)}
      {data && data.cases.length >= 100 && <p className="text-xs text-amber-200">Angezeigt werden die neuesten 100 Fälle, je Fall die letzten 12 Läufe.</p>}
    </>}
    {tab === 'export' && <div className={panel}><h2 className="text-lg font-semibold">Wie die Erkennung besser wird</h2><ol className="list-decimal space-y-3 pl-5 text-sm text-slate-300"><li>Markierungen und Zuordnungen in der Mail korrigieren. Als Lernfall ausdrücklich freigeben.</li><li>„Lernbeispiele beifügen“ aktivieren. Das Modell bekommt bis zu zwei passende, geprüfte Beispiele aus anderen Gesprächen als Anleitung.</li><li>Mit unabhängigen Testfällen prüfen, ob Fehler tatsächlich seltener werden. Ergebnisse mit und ohne Beispiele vergleichen.</li></ol>
      <div className="border-t border-slate-700 pt-4 space-y-3"><h3 className="font-medium">Echtes Nachtrainieren vorbereiten</h3><p className="text-sm text-slate-300">Hier werden noch keine Modellgewichte verändert. Der JSONL-Export bereitet freigegebene Lernfälle für einen späteren lokalen Trainingslauf vor. Ein so trainiertes Modell kann nach dem Import in Ollama wieder im gleichen Vergleich geprüft werden.</p><p className="text-sm text-amber-200">Die Datei enthält Originaltexte und damit möglicherweise Namen und Adressen. Sie bleibt für die lokale Verarbeitung bestimmt. Testfälle werden nicht exportiert.</p>
        <button className={button} disabled={busy || !data?.cases.some(c => c.partition === 'train' && !c.unavailable)} onClick={() => action(async () => { const text = await transport({ action: 'export' }) as string; const url = URL.createObjectURL(new Blob([text], { type: 'application/x-ndjson' })); const a = document.createElement('a'); a.href = url; a.download = 'mgh-training-local.jsonl'; a.click(); URL.revokeObjectURL(url); setMessage('Lokale Trainingsdatei heruntergeladen.'); })}>Lernfälle lokal herunterladen</button></div>
    </div>}
  </section>;
}
