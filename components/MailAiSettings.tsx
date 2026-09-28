'use client';

import { useEffect, useState } from 'react';

type TestResult = { status: string; fields?: boolean; elapsedMs?: number; found: { type: string; text: string }[] };

const TYPE_LABELS: Record<string, string> = { name: 'Name', address: 'Adresse', postalCode: 'PLZ / Ort', email: 'E-Mail', phone: 'Telefon', iban: 'IBAN', customerNumber: 'Kundennummer' };

export default function MailAiSettings() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [keySet, setKeySet] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [result, setResult] = useState<TestResult | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/settings/mail-ai', { signal: controller.signal }).then(async r => {
      if (!r.ok) throw new Error('Einstellungen des Analysedienstes konnten nicht geladen werden.');
      return r.json();
    }).then(c => { setIsAdmin(c.isAdmin); setEnabled(c.enabled); setBaseUrl(c.baseUrl || ''); setKeySet(!!c.apiKeySet); })
      .catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, []);

  async function save() {
    setBusy('save'); setError(''); setNotice(''); setResult(null);
    try {
      const res = await fetch('/api/settings/mail-ai', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, baseUrl, ...(apiKey ? { apiKey } : {}) }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setKeySet(keySet || !!apiKey); setApiKey(''); setNotice('Gespeichert.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen.'); }
    finally { setBusy(''); }
  }

  async function runNow() {
    setBusy('run'); setError(''); setNotice(''); setResult(null);
    try {
      const res = await fetch('/api/settings/mail-ai/run', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setNotice(`Prüfung gestartet: ${[data.pii && 'Personenangaben', data.suggestions && 'Auftragsvorschläge'].filter(Boolean).join(' und ')}. Ergebnisse erscheinen nach und nach (Auftragsmails je nach Rechner 10 s bis 2 min pro Mail).`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Start fehlgeschlagen.'); }
    finally { setBusy(''); }
  }

  async function test() {
    setBusy('test'); setError(''); setNotice(''); setResult(null);
    try {
      const res = await fetch('/api/settings/mail-ai/test', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult(data);
    } catch (e) { setError(e instanceof Error ? e.message : 'Test fehlgeschlagen.'); }
    finally { setBusy(''); }
  }

  if (!isAdmin) return error ? <p role="alert" className="text-sm text-rose-300">{error}</p> : null;
  return <section className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 space-y-3">
    <h3 className="font-semibold">Lokale Mail-Analyse</h3>
    <p className="text-sm text-slate-300">Erkennt Personenangaben mit einem kleinen Modell auf diesem Rechner, zusätzlich zu den Regeln. Wird vor jedem KI-Versand und im Hintergrund für neue Mails genutzt. Mailtexte verlassen dabei nicht das Haus.</p>
    <fieldset disabled={!!busy} className="space-y-3 disabled:opacity-60">
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />Lokale Mail-Analyse verwenden</label>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-sm space-y-1 block"><span className="text-slate-300">Dienstadresse</span>
          <input className="w-full rounded border border-slate-600 bg-slate-950 px-2 py-1" value={baseUrl} placeholder="http://127.0.0.1:8766" onChange={e => setBaseUrl(e.target.value)} /></label>
        <label className="text-sm space-y-1 block"><span className="text-slate-300">Zugriffsschlüssel {keySet && <span className="text-emerald-300">(gespeichert)</span>}</span>
          <input type="password" autoComplete="off" className="w-full rounded border border-slate-600 bg-slate-950 px-2 py-1" value={apiKey}
            placeholder={keySet ? 'Nur zum Ändern eingeben' : 'aus services/mail-ai/data/access-token.txt'} onChange={e => setApiKey(e.target.value)} /></label>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={save} className="rounded border border-sky-600 px-3 py-1 text-sm text-sky-200">{busy === 'save' ? 'Speichert …' : 'Speichern'}</button>
        <button type="button" onClick={test} className="rounded border border-slate-600 px-3 py-1 text-sm">{busy === 'test' ? 'Prüft …' : 'Dienst testen'}</button>
        <button type="button" onClick={runNow} disabled={!enabled} className="rounded border border-slate-600 px-3 py-1 text-sm disabled:opacity-50">{busy === 'run' ? 'Startet …' : 'Letzte 24 Stunden jetzt prüfen'}</button>
      </div>
    </fieldset>
    {notice && <p role="status" className="text-sm text-emerald-300">{notice}</p>}
    {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
    {result && <div role="status" className="text-sm text-slate-200 space-y-1">
      {result.status === 'ready'
        ? <p>Dienst bereit{result.elapsedMs !== undefined && ` · Testtext in ${(result.elapsedMs / 1000).toFixed(1)} s geprüft`}{result.fields === false && ' · Feldmodell nicht geladen'}.</p>
        : <p className="text-amber-200">Dienst meldet „{result.status}“ (Modelle laden noch oder Start fehlgeschlagen).</p>}
      {result.found.length > 0 && <p className="text-slate-400">Im erfundenen Testtext erkannt: {result.found.map(f => `${TYPE_LABELS[f.type] || f.type}: ${f.text}`).join(' · ')}</p>}
    </div>}
  </section>;
}
