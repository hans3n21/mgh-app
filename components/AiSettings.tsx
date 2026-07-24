'use client';

import { useState, useEffect } from 'react';

interface AiConfig {
  provider: string;
  apiKey: string;
  apiKeySet: boolean;
  model: string;
  baseUrl: string;
}

const PROVIDER_OPTIONS = [
  { value: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com', models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'] },
  { value: 'anthropic', label: 'Anthropic (Claude)', baseUrl: 'https://api.anthropic.com', models: ['claude-3-5-haiku-latest', 'claude-3-5-sonnet-latest', 'claude-3-opus-latest'] },
  { value: 'custom', label: 'Eigene URL (OpenAI-kompatibel)', baseUrl: '', models: [] },
];

export default function AiSettings() {
  const [config, setConfig] = useState<AiConfig>({
    provider: 'openai',
    apiKey: '',
    apiKeySet: false,
    model: 'gpt-4o-mini',
    baseUrl: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [fetchedModels, setFetchedModels] = useState<string[] | null>(null);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [configRes, sessionRes] = await Promise.all([
          fetch('/api/settings/ai'),
          fetch('/api/auth/session'),
        ]);
        if (configRes.ok) {
          const data = await configRes.json();
          setConfig(data);
        }
        if (sessionRes.ok) {
          const session = await sessionRes.json();
          const role = session?.user?.role || '';
          setIsAdmin(role === 'admin' || role === 'admin_no_feedback');
        }
      } catch { /* ignore */ }
      setLoading(false);
    }
    load();
  }, []);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch('/api/settings/ai', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Speichern fehlgeschlagen');
      }
      setSaved(true);
      // Reload to get masked key
      const fresh = await fetch('/api/settings/ai').then(r => r.json()).catch(() => null);
      if (fresh) setConfig(fresh);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unbekannter Fehler');
    }
    setSaving(false);
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/settings/ai/test', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setTestResult({ ok: true, message: `Verbindung erfolgreich. Modell: ${data.model || config.model}` });
      } else {
        setTestResult({ ok: false, message: data.error || 'Verbindung fehlgeschlagen' });
      }
    } catch (e) {
      setTestResult({ ok: false, message: e instanceof Error ? e.message : 'Fehler beim Testen' });
    }
    setTesting(false);
  }

  const selectedProvider = PROVIDER_OPTIONS.find(p => p.value === config.provider) || PROVIDER_OPTIONS[0];

  async function handleFetchModels() {
    setModelsLoading(true);
    setModelsError(null);
    try {
      const res = await fetch('/api/settings/ai/models');
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error || 'Modelle konnten nicht geladen werden');
      setFetchedModels(data.models ?? []);
      // Falls aktuelles Modell nicht in der Liste: erstes verfügbares wählen
      if (data.models?.length && !data.models.includes(config.model)) {
        setConfig(prev => ({ ...prev, model: data.models[0] }));
      }
    } catch (e) {
      setModelsError(e instanceof Error ? e.message : 'Fehler');
    }
    setModelsLoading(false);
  }

  return (
    <details className="group rounded-xl border border-slate-800 bg-slate-900/60">
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold select-none flex items-center justify-between">
        <span>KI-Integration</span>
        {config.apiKeySet && (
          <span className="text-[10px] bg-emerald-900/40 border border-emerald-800/50 text-emerald-300 px-2 py-0.5 rounded-full">
            Konfiguriert
          </span>
        )}
      </summary>

      <div className="px-4 pb-4 space-y-4">
        {loading ? (
          <div className="text-xs text-slate-500">Lade Einstellungen…</div>
        ) : !isAdmin ? (
          <div className="text-xs text-slate-400 rounded-lg border border-slate-700 p-3">
            KI-Einstellungen können nur von Admins bearbeitet werden.
            {config.apiKeySet && ' Ein API-Key ist hinterlegt.'}
          </div>
        ) : (
          <>
            <div className="text-xs text-slate-400">
              Der API-Key ermöglicht Kurzfassungen, Übersetzungen und KI-Antworten direkt ohne N8N.
            </div>

            {/* Provider */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">KI-Provider</label>
              <div className="space-y-2">
                {PROVIDER_OPTIONS.map(opt => (
                  <label key={opt.value} className="flex items-start gap-3 rounded-lg border border-slate-700 p-3 cursor-pointer hover:bg-slate-800/30 transition-colors">
                    <input
                      type="radio"
                      name="ai-provider"
                      value={opt.value}
                      checked={config.provider === opt.value}
                      onChange={() => setConfig(prev => ({
                        ...prev,
                        provider: opt.value,
                        baseUrl: opt.baseUrl || prev.baseUrl,
                        model: opt.models[0] || prev.model,
                      }))}
                      className="mt-0.5"
                    />
                    <div>
                      <div className="text-sm font-medium">{opt.label}</div>
                      {opt.value === 'openai' && (
                        <div className="text-xs text-slate-400 mt-0.5">OpenAI GPT-Modelle. API-Key unter platform.openai.com</div>
                      )}
                      {opt.value === 'anthropic' && (
                        <div className="text-xs text-slate-400 mt-0.5">Anthropic Claude-Modelle. API-Key unter console.anthropic.com</div>
                      )}
                      {opt.value === 'custom' && (
                        <div className="text-xs text-slate-400 mt-0.5">Eigener Server mit OpenAI-kompatibler API (z.B. LM Studio, Ollama, Azure)</div>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* API Key */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">API-Key</label>
              <input
                type="password"
                value={config.apiKey}
                onChange={e => setConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                placeholder={config.apiKeySet ? '••••••••••••• (hinterlegt)' : config.provider === 'anthropic' ? 'sk-ant-...' : 'sk-...'}
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-600"
              />
              {config.apiKeySet && (
                <div className="text-[10px] text-slate-500">
                  Aktuell gespeicherter Key: {config.apiKey || '(maskiert)'}. Neuen Key eingeben um zu überschreiben.
                </div>
              )}
            </div>

            {/* Modell */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-slate-300">Modell</label>
                {config.apiKeySet && config.provider !== 'custom' && (
                  <button
                    type="button"
                    onClick={handleFetchModels}
                    disabled={modelsLoading}
                    className="flex items-center gap-1 text-[11px] text-violet-400 hover:text-violet-300 transition-colors disabled:opacity-50"
                    title="Aktuelle Modelle vom Provider laden"
                  >
                    <svg className={`w-3 h-3 ${modelsLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    {modelsLoading ? 'Lade…' : 'Modelle aktualisieren'}
                  </button>
                )}
              </div>

              {(() => {
                const displayModels = fetchedModels ?? selectedProvider.models;
                if (displayModels.length > 0) {
                  return (
                    <select
                      value={config.model}
                      onChange={e => setConfig(prev => ({ ...prev, model: e.target.value }))}
                      className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-600"
                    >
                      {displayModels.map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  );
                }
                return (
                  <input
                    type="text"
                    value={config.model}
                    onChange={e => setConfig(prev => ({ ...prev, model: e.target.value }))}
                    placeholder="z.B. llama3, mistral, gpt-4"
                    className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-600"
                  />
                );
              })()}

              {modelsError && (
                <div className="text-[11px] text-red-400">{modelsError}</div>
              )}
              {fetchedModels && (
                <div className="text-[10px] text-slate-500">{fetchedModels.length} Modelle geladen vom Provider.</div>
              )}
            </div>

            {/* Base URL (nur bei custom) */}
            {config.provider === 'custom' && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Base URL</label>
                <input
                  type="text"
                  value={config.baseUrl}
                  onChange={e => setConfig(prev => ({ ...prev, baseUrl: e.target.value }))}
                  placeholder="http://localhost:1234"
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-600"
                />
                <div className="text-[10px] text-slate-500">Muss OpenAI-kompatible /v1/chat/completions API haben.</div>
              </div>
            )}

            {/* Test + Speichern */}
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
              >
                {saving ? 'Speichern…' : saved ? '✓ Gespeichert' : 'Speichern'}
              </button>
              <button
                type="button"
                onClick={handleTest}
                disabled={testing || !config.apiKeySet}
                className="px-3 py-2 rounded-lg border border-slate-700 text-slate-300 text-sm hover:bg-slate-800 transition-colors disabled:opacity-40"
                title={!config.apiKeySet ? 'Erst speichern, dann testen' : undefined}
              >
                {testing ? 'Teste…' : 'Verbindung testen'}
              </button>
            </div>

            {testResult && (
              <div className={`text-xs rounded-lg px-3 py-2 border ${testResult.ok ? 'bg-emerald-900/20 border-emerald-800/50 text-emerald-300' : 'bg-red-900/20 border-red-800/50 text-red-300'}`}>
                {testResult.ok ? '✓ ' : '✗ '}{testResult.message}
              </div>
            )}

            {error && (
              <div className="text-xs text-red-400 rounded-lg border border-red-800/50 bg-red-900/20 px-3 py-2">{error}</div>
            )}

            <div className="text-[10px] text-slate-500 pt-1">
              Der API-Key wird sicher in der Datenbank gespeichert und nur serverseitig verwendet.
            </div>
          </>
        )}
      </div>
    </details>
  );
}
