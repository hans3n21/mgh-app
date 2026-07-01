'use client';

import { useState, useEffect } from 'react';

type SpeechProvider = 'web-speech' | 'whisper';

export default function SpeechSettings() {
  const [provider, setProvider] = useState<SpeechProvider>('web-speech');
  const [webSpeechAvailable, setWebSpeechAvailable] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('speech-provider') as SpeechProvider | null;
    if (stored === 'web-speech' || stored === 'whisper') setProvider(stored);
    setWebSpeechAvailable(!!(window.SpeechRecognition || window.webkitSpeechRecognition));
  }, []);

  const handleChange = (value: SpeechProvider) => {
    setProvider(value);
    localStorage.setItem('speech-provider', value);
  };

  return (
    <details className="group rounded-xl border border-slate-800 bg-slate-900/60">
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold select-none">
        Spracherkennung
      </summary>
      <div className="px-4 pb-4 space-y-3">
        <div className="text-xs text-slate-400">
          Wähle den Provider für die Spracheingabe (Mikrofon-Button).
        </div>

        <div className="space-y-2">
          <label className="flex items-start gap-3 rounded-lg border border-slate-700 p-3 cursor-pointer hover:bg-slate-800/30 transition-colors">
            <input
              type="radio"
              name="speech-provider"
              value="web-speech"
              checked={provider === 'web-speech'}
              onChange={() => handleChange('web-speech')}
              className="mt-0.5"
            />
            <div>
              <div className="text-sm font-medium">Web Speech API (Browser)</div>
              <div className="text-xs text-slate-400 mt-0.5">
                Kostenlos, läuft direkt im Browser. Funktioniert am besten in Chrome.
              </div>
              {!webSpeechAvailable && (
                <div className="text-xs text-amber-400 mt-1">
                  Dein Browser unterstützt die Web Speech API nicht. Bitte Chrome verwenden oder Whisper wählen.
                </div>
              )}
            </div>
          </label>

          <label className="flex items-start gap-3 rounded-lg border border-slate-700 p-3 cursor-pointer hover:bg-slate-800/30 transition-colors">
            <input
              type="radio"
              name="speech-provider"
              value="whisper"
              checked={provider === 'whisper'}
              onChange={() => handleChange('whisper')}
              className="mt-0.5"
            />
            <div>
              <div className="text-sm font-medium">Whisper (Server)</div>
              <div className="text-xs text-slate-400 mt-0.5">
                OpenAI Whisper via Server-Backend. Höhere Genauigkeit, benötigt laufenden Whisper-Service.
              </div>
            </div>
          </label>
        </div>

        <div className="text-[10px] text-slate-500">
          Einstellung wird lokal im Browser gespeichert.
        </div>
      </div>
    </details>
  );
}
