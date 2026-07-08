'use client';

import { useEffect, useState } from 'react';

export default function DatevSettings() {
  const [forwardEmail, setForwardEmail] = useState('');
  const [envOverrideSet, setEnvOverrideSet] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [cfgRes, sessionRes] = await Promise.all([
          fetch('/api/settings/datev'),
          fetch('/api/auth/session'),
        ]);
        if (cfgRes.ok) {
          const data = await cfgRes.json();
          setForwardEmail(data.forwardEmail || '');
          setEnvOverrideSet(!!data.envOverrideSet);
        }
        if (sessionRes.ok) {
          const session = await sessionRes.json();
          const role = session?.user?.role || '';
          setIsAdmin(role === 'admin' || role === 'admin_no_feedback');
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch('/api/settings/datev', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forwardEmail }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Speichern fehlgeschlagen');
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unbekannter Fehler');
    } finally {
      setSaving(false);
    }
  }

  return (
    <details className="group rounded-xl border border-slate-800 bg-slate-900/60">
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold select-none flex items-center justify-between">
        <span>DATEV-Weiterleitung</span>
        {!loading && (
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full border ${
              forwardEmail || envOverrideSet
                ? 'bg-emerald-900/40 border-emerald-700/50 text-emerald-300'
                : 'bg-amber-900/40 border-amber-700/50 text-amber-300'
            }`}
          >
            {forwardEmail || envOverrideSet ? 'Konfiguriert' : 'Nicht konfiguriert'}
          </span>
        )}
      </summary>

      <div className="px-4 pb-4 space-y-4">
        {loading ? (
          <div className="text-xs text-slate-500">Lade Einstellungen…</div>
        ) : !isAdmin ? (
          <div className="text-xs text-slate-400 rounded-lg border border-slate-700 p-3">
            DATEV-Einstellungen koennen nur von Admins bearbeitet werden.
          </div>
        ) : (
          <>
            <div className="text-xs text-slate-400">
              Ziel-Adresse fuer den &quot;An DATEV&quot;-Button im Postfach. Gilt fuer alle Mitarbeiter und Geraete
              (statt vorher pro Browser einzeln).
            </div>

            {envOverrideSet && (
              <div className="text-[11px] text-amber-400">
                ⚠ Es ist eine Umgebungsvariable (DATEV_FORWARD_EMAIL) gesetzt, die diesen Wert ueberschreibt.
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">DATEV E-Mail-Adresse</label>
              <input
                type="email"
                value={forwardEmail}
                onChange={(e) => setForwardEmail(e.target.value)}
                placeholder="buchhaltung@datev-kanzlei.de"
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-600"
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
              >
                {saving ? 'Speichern…' : saved ? '✓ Gespeichert' : 'Speichern'}
              </button>
            </div>

            {error && (
              <div className="text-xs text-red-400 rounded-lg border border-red-800/50 bg-red-900/20 px-3 py-2">{error}</div>
            )}
          </>
        )}
      </div>
    </details>
  );
}
