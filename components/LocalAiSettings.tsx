'use client';

import { useEffect, useState } from 'react';
import { DEMO_MAIL, type Analysis } from '@/lib/local-ai/contracts';
import { OrderType } from '@/lib/order-presets';
import LocalAiResults from './LocalAiResults';

export default function LocalAiSettings() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [keySet, setKeySet] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [text, setText] = useState(DEMO_MAIL);
  const [orderType, setOrderType] = useState<string>('NECK');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [result, setResult] = useState<Analysis | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/settings/local-ai', { signal: controller.signal }).then(async r => {
      if (!r.ok) throw new Error('Lokale KI-Einstellungen konnten nicht geladen werden.');
      return r.json();
    }).then(c => { setIsAdmin(c.isAdmin); setEnabled(c.enabled); setBaseUrl(c.baseUrl || ''); setKeySet(!!c.apiKeySet); })
      .catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, []);
  async function save() {
    setBusy('save'); setError(''); setNotice(''); setResult(null);
    try {
      const res = await fetch('/api/settings/local-ai', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, baseUrl, ...(apiKey ? { apiKey } : {}) }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setKeySet(keySet || !!apiKey); setApiKey(''); setDirty(false); setNotice('Gespeichert.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen.'); }
    finally { setBusy(''); }
  }
  async function test() {
    setBusy('test'); setError(''); setNotice(''); setResult(null);
    try {
      const res = await fetch('/api/settings/local-ai/test', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, orderType }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult(data);
    } catch (e) { setError(e instanceof Error ? e.message : 'Test fehlgeschlagen.'); }
    finally { setBusy(''); }
  }
  if (!isAdmin) return error ? <p role="alert" className="text-sm text-rose-300">{error}</p> : null;
  return <section className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 space-y-3">
    <h3 className="font-semibold">Lokale Mailprüfung · Laya-Pilot</h3>
    <p className="text-sm text-slate-300">Prüft Holzangaben, Bundangaben, Mensur und Radius auf eurem Rechner oder NAS. Ergebnisse werden zunächst zur Prüfung angezeigt.</p>
    <p className="text-sm text-amber-200">Experimentell: Im ersten Test wurden nur 4 von 8 Entscheidungen richtig erkannt. Das Modell verwechselt noch Bauteile und Kundenabsichten.</p>
    <fieldset disabled={!!busy} className="space-y-3 disabled:opacity-60">
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={enabled}
        onChange={e => { setEnabled(e.target.checked); setDirty(true); }} />Manuelle Mailprüfung aktivieren</label>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-sm">Lokale Dienstadresse
          <input className="mt-1 block w-full rounded border border-slate-600 bg-slate-950 p-2" type="url" value={baseUrl}
            placeholder="http://192.168.1.20:8765" onChange={e => { setBaseUrl(e.target.value); setDirty(true); }} />
        </label>
        <label className="text-sm">Zugriffsschlüssel
          <input className="mt-1 block w-full rounded border border-slate-600 bg-slate-950 p-2" type="password" autoComplete="new-password" value={apiKey}
            placeholder={keySet ? 'Gespeichert – leer lassen zum Beibehalten' : 'Schlüssel aus der Dienstkonfiguration'}
            onChange={e => { setApiKey(e.target.value); setDirty(true); }} />
        </label>
      </div>
      <button type="button" onClick={save} className="rounded bg-violet-700 px-3 py-2 text-sm">{busy === 'save' ? 'Speichert …' : 'Speichern'}</button>
      <p className="text-xs text-slate-400">Der MGH-Server muss den Dienst erreichen können. Auf demselben Rechner: http://127.0.0.1:8765. Sonst die private IP des Rechners verwenden.</p>
      <details className="space-y-3" open>
        <summary className="cursor-pointer text-sm font-medium">Mit Beispieltext testen</summary>
        <label className="block text-sm">Auftragstyp
          <select className="ml-2 rounded border border-slate-600 bg-slate-950 p-1" value={orderType}
            onChange={e => { setOrderType(e.target.value); setResult(null); }}>
            {Object.values(OrderType).map(type => <option key={type}>{type}</option>)}
          </select>
        </label>
        <label className="block text-sm">Testmail
          <textarea rows={5} maxLength={6000} value={text} onChange={e => { setText(e.target.value); setResult(null); }}
            className="mt-1 w-full rounded border border-slate-600 bg-slate-950 p-2" />
        </label>
        <button type="button" disabled={!enabled || dirty || !keySet} onClick={test}
          className="rounded border border-violet-500 px-3 py-2 text-sm disabled:opacity-50">
          {busy === 'test' ? 'Lokaler Dienst wertet aus …' : 'Lokal testen'}
        </button>
        {dirty && <p className="text-xs text-amber-200">Die Einstellungen vor dem Test speichern.</p>}
        <p className="text-xs text-slate-400">Erwartung beim Beispiel: Ahorn für Hals, Ebenholz für Griffbrett und 22 Edelstahlbünde als Wunsch. Radius bleibt offen. Andere Holzzuordnungen dürfen nicht als Wunsch gelten.</p>
      </details>
    </fieldset>
    <div aria-live="polite">{notice && <p className="text-sm text-emerald-300">{notice}</p>}
      {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}</div>
    {result && <LocalAiResults key={`${result.elapsedMs}:${text}:${orderType}`} result={result} />}
  </section>;
}
