'use client';

import { useEffect, useState } from 'react';

type DhlConfig = {
  environment: 'sandbox' | 'production';
  clientId: string;
  clientSecret: string;
  clientSecretSet: boolean;
  portalUsername: string;
  portalPassword: string;
  portalPasswordSet: boolean;
  receiverId: string;
};

const DEFAULT_CONFIG: DhlConfig = {
  environment: 'sandbox',
  clientId: '',
  clientSecret: '',
  clientSecretSet: false,
  portalUsername: '',
  portalPassword: '',
  portalPasswordSet: false,
  receiverId: 'deu',
};

export default function DhlSettings() {
  const [config, setConfig] = useState<DhlConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [cfgRes, sessionRes] = await Promise.all([
          fetch('/api/settings/dhl'),
          fetch('/api/auth/session'),
        ]);
        if (cfgRes.ok) {
          const data = await cfgRes.json();
          setConfig({ ...DEFAULT_CONFIG, ...data });
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
      const res = await fetch('/api/settings/dhl', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Speichern fehlgeschlagen');
      }
      setSaved(true);
      const fresh = await fetch('/api/settings/dhl').then((r) => r.json()).catch(() => null);
      if (fresh) setConfig((prev) => ({ ...prev, ...fresh }));
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
        <span>DHL Versand (Retourenlabel)</span>
        {config.environment === 'production' ? (
          <span className="text-[10px] bg-amber-900/40 border border-amber-700/50 text-amber-300 px-2 py-0.5 rounded-full">
            Produktion — echte Kosten
          </span>
        ) : (
          <span className="text-[10px] bg-slate-800 border border-slate-700 text-slate-400 px-2 py-0.5 rounded-full">
            Sandbox
          </span>
        )}
      </summary>

      <div className="px-4 pb-4 space-y-4">
        {loading ? (
          <div className="text-xs text-slate-500">Lade Einstellungen…</div>
        ) : !isAdmin ? (
          <div className="text-xs text-slate-400 rounded-lg border border-slate-700 p-3">
            DHL-Einstellungen koennen nur von Admins bearbeitet werden.
          </div>
        ) : (
          <>
            <div className="text-xs text-slate-400">
              Zugangsdaten fuer die DHL-API (Retourenlabel). Client-ID/-Secret ueber developer.dhl.com registrieren,
              Portal-Login ist der bestehende Geschaeftskunden-Zugang.
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">Umgebung</label>
              <select
                value={config.environment}
                onChange={(e) => setConfig((prev) => ({ ...prev, environment: e.target.value === 'production' ? 'production' : 'sandbox' }))}
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-600"
              >
                <option value="sandbox">Sandbox (Test, kostenlos)</option>
                <option value="production">Produktion (echtes Konto)</option>
              </select>
              {config.environment === 'production' && (
                <div className="text-[11px] text-amber-400">
                  ⚠ Labels werden ueber euer echtes DHL-Geschaeftskonto erstellt (Erstellung selbst ist laut DHL kostenlos, abgerechnet wird erst bei tatsaechlichem Versand).
                </div>
              )}
            </div>

            <div className="grid md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Client-ID (developer.dhl.com)</label>
                <input
                  type="text"
                  value={config.clientId}
                  onChange={(e) => setConfig((prev) => ({ ...prev, clientId: e.target.value }))}
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-slate-200"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Client-Secret</label>
                <input
                  type="password"
                  value={config.clientSecret}
                  onChange={(e) => setConfig((prev) => ({ ...prev, clientSecret: e.target.value }))}
                  placeholder={config.clientSecretSet ? '•••••••• (hinterlegt)' : 'Client-Secret'}
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-slate-200"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Geschaeftskundenportal-Login</label>
                <input
                  type="text"
                  value={config.portalUsername}
                  onChange={(e) => setConfig((prev) => ({ ...prev, portalUsername: e.target.value }))}
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-slate-200"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Portal-Passwort</label>
                <input
                  type="password"
                  value={config.portalPassword}
                  onChange={(e) => setConfig((prev) => ({ ...prev, portalPassword: e.target.value }))}
                  placeholder={config.portalPasswordSet ? '•••••••• (hinterlegt)' : 'Passwort'}
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-slate-200"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Empfaenger-Code (Land)</label>
                <input
                  type="text"
                  value={config.receiverId}
                  onChange={(e) => setConfig((prev) => ({ ...prev, receiverId: e.target.value }))}
                  placeholder="deu"
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-slate-200"
                />
                <div className="text-[11px] text-slate-500">
                  In der Regel &quot;deu&quot; fuer Ruecksendungen innerhalb Deutschlands — die eigentliche Werkstatt-Adresse ist im DHL-Portal unter &quot;Returns Settings&quot; hinterlegt, nicht hier.
                </div>
              </div>
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
            <div className="text-[10px] text-slate-500">
              Zugangsdaten werden serverseitig in den System-Einstellungen gespeichert.
            </div>
          </>
        )}
      </div>
    </details>
  );
}
