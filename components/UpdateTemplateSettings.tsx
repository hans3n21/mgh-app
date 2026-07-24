'use client';

import { useState, useEffect } from 'react';

const DEFAULT_TEMPLATE = `Hallo {kundenname},

hier ein kurzes Update:



Bei Fragen melde dich gerne.

Viele Grüße
{mitarbeiter}`;

const STORAGE_KEY = 'update-template';

export default function UpdateTemplateSettings() {
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) setTemplate(stored);
  }, []);

  const handleSave = () => {
    localStorage.setItem(STORAGE_KEY, template);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    localStorage.removeItem(STORAGE_KEY);
    setTemplate(DEFAULT_TEMPLATE);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <details className="group rounded-xl border border-slate-800 bg-slate-900/60">
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold select-none">
        Update-Nachricht Vorlage
      </summary>
      <div className="px-4 pb-4 space-y-3">
        <div className="text-xs text-slate-400">
          Definiere die Vorlage für den &quot;Update&quot;-Button im Kommunikations-Tab.
          Nutze Platzhalter, die beim Einfügen ersetzt werden:
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <code className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-sky-300">{'{kundenname}'}</code>
          <span className="text-slate-500">→ Vorname des Kunden</span>
          <code className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-sky-300">{'{mitarbeiter}'}</code>
          <span className="text-slate-500">→ Vorname des aktuellen Mitarbeiters</span>
        </div>

        <textarea
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm resize-y font-mono"
          rows={10}
        />

        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            className="px-3 py-1.5 text-xs rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
          >
            Speichern
          </button>
          <button
            onClick={handleReset}
            className="px-3 py-1.5 text-xs rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
          >
            Standard wiederherstellen
          </button>
          {saved && <span className="text-xs text-emerald-400">Gespeichert!</span>}
        </div>

        <div className="text-[10px] text-slate-500">
          Einstellung wird lokal im Browser gespeichert.
        </div>
      </div>
    </details>
  );
}
