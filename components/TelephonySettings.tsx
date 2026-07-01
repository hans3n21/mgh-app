'use client';

import { useEffect, useState } from 'react';

type TelephonyConfig = {
  enabled: boolean;
  provider: 'tel' | 'fritzbox';
  fritzHost: string;
  fritzUsername: string;
  fritzPassword: string;
  fritzPasswordSet: boolean;
  fritzDialPort: string;
};

const DEFAULT_CONFIG: TelephonyConfig = {
  enabled: false,
  provider: 'tel',
  fritzHost: 'http://fritz.box',
  fritzUsername: '',
  fritzPassword: '',
  fritzPasswordSet: false,
  fritzDialPort: '',
};

export default function TelephonySettings() {
  const [config, setConfig] = useState<TelephonyConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [cfgRes, sessionRes] = await Promise.all([
          fetch('/api/settings/telephony'),
          fetch('/api/auth/session'),
        ]);
        if (cfgRes.ok) {
          const data = await cfgRes.json();
          setConfig({
            ...DEFAULT_CONFIG,
            ...data,
          });
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
      const res = await fetch('/api/settings/telephony', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Speichern fehlgeschlagen');
      }
      setSaved(true);
      const fresh = await fetch('/api/settings/telephony').then((r) => r.json()).catch(() => null);
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
        <span>Telefonie / FritzBox</span>
        {config.enabled && config.provider === 'fritzbox' && (
          <span className="text-[10px] bg-emerald-900/40 border border-emerald-800/50 text-emerald-300 px-2 py-0.5 rounded-full">
            Aktiv
          </span>
        )}
      </summary>

      <div className="px-4 pb-4 space-y-4">
        {loading ? (
          <div className="text-xs text-slate-500">Lade Einstellungen…</div>
        ) : !isAdmin ? (
          <div className="text-xs text-slate-400 rounded-lg border border-slate-700 p-3">
            Telefonie-Einstellungen koennen nur von Admins bearbeitet werden.
          </div>
        ) : (
          <>
            <div className="text-xs text-slate-400">
              Optional: Telefonnummern klicken und ueber FritzBox waehlen statt nur `tel:` zu oeffnen.
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-200">
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={(e) => setConfig((prev) => ({ ...prev, enabled: e.target.checked }))}
              />
              FritzBox-Click-to-Dial aktivieren
            </label>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">Modus</label>
              <select
                value={config.provider}
                onChange={(e) => setConfig((prev) => ({ ...prev, provider: e.target.value === 'fritzbox' ? 'fritzbox' : 'tel' }))}
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-600"
              >
                <option value="tel">Nur tel:-Links</option>
                <option value="fritzbox">FritzBox Click-to-Dial</option>
              </select>
            </div>

            <div className="grid md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">FritzBox Host/IP</label>
                <input
                  type="text"
                  value={config.fritzHost}
                  onChange={(e) => setConfig((prev) => ({ ...prev, fritzHost: e.target.value }))}
                  placeholder="http://fritz.box"
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-slate-200"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Dial Port (optional)</label>
                <input
                  type="text"
                  value={config.fritzDialPort}
                  onChange={(e) => setConfig((prev) => ({ ...prev, fritzDialPort: e.target.value }))}
                  placeholder="z.B. 620"
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-slate-200"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Benutzername</label>
                <input
                  type="text"
                  value={config.fritzUsername}
                  onChange={(e) => setConfig((prev) => ({ ...prev, fritzUsername: e.target.value }))}
                  placeholder="FritzBox Benutzername"
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-slate-200"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Passwort</label>
                <input
                  type="password"
                  value={config.fritzPassword}
                  onChange={(e) => setConfig((prev) => ({ ...prev, fritzPassword: e.target.value }))}
                  placeholder={config.fritzPasswordSet ? '•••••••• (hinterlegt)' : 'Passwort'}
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-slate-200"
                />
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
