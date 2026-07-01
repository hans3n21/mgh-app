"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';

type EmailTemplate = {
  id: string;
  key: string;
  name: string;
};

type DiffResult = {
  original: string;
  suggestion: string;
  knowledgeHits: string[];
  priceHits: string[];
  piiAnonymized: boolean;
  templateKey?: string;
  tokensUsed?: number;
};

type Props = {
  mailAccountId: string | null;
  hasAiProfile: boolean;
  getText: () => string;
  setText: (text: string) => void;
  originalMail?: string;
  customerName?: string;
  mailId?: string;
};

const TRANSLATE_LANGS = ['Englisch', 'Deutsch', 'Franzoesisch', 'Spanisch', 'Italienisch'];

export default function AiToolbar({
  mailAccountId,
  hasAiProfile,
  getText,
  setText,
  originalMail,
  customerName,
  mailId,
}: Props) {
  const [loading, setLoading] = useState<string | null>(null);
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null);
  const [showTranslatePicker, setShowTranslatePicker] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>([]);
  const translateRef = useRef<HTMLDivElement>(null);
  const templateRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showTemplatePicker || !mailAccountId) return;
    fetch(`/api/mail-accounts/${mailAccountId}/email-templates`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) =>
        setEmailTemplates((data as Array<EmailTemplate & { isActive?: boolean }>).filter((t) => t.isActive !== false))
      )
      .catch(() => {});
  }, [showTemplatePicker, mailAccountId]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (translateRef.current && !translateRef.current.contains(e.target as Node)) {
        setShowTranslatePicker(false);
      }
      if (templateRef.current && !templateRef.current.contains(e.target as Node)) {
        setShowTemplatePicker(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (!hasAiProfile || !mailAccountId) return;
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.shiftKey) {
        if (e.key === 'R' || e.key === 'r') {
          e.preventDefault();
          runAction('rewrite');
        }
        if (e.key === 'T' || e.key === 't') {
          e.preventDefault();
          setShowTranslatePicker((v) => !v);
        }
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAiProfile, mailAccountId]);

  const runAction = useCallback(async (
    action: string,
    opts?: { targetLanguage?: string; templateKey?: string }
  ) => {
    if (!mailAccountId) return;
    const inputText = getText();
    if (!inputText.trim() && action !== 'template_reply') return;

    setLoading(action);
    setDiffResult(null);
    setShowTranslatePicker(false);
    setShowTemplatePicker(false);

    try {
      const res = await fetch('/api/ai/transform', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mailAccountId,
          action,
          inputText,
          originalMail,
          customerName,
          mailId,
          ...opts,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Fehler');

      setDiffResult({
        original: inputText,
        suggestion: data.result,
        knowledgeHits: data.knowledgeHits ?? [],
        priceHits: data.priceHits ?? [],
        piiAnonymized: !!data.piiAnonymized,
        templateKey: opts?.templateKey,
        tokensUsed: data.tokensUsed,
      });
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'KI-Fehler');
    } finally {
      setLoading(null);
    }
  }, [mailAccountId, getText, originalMail, customerName, mailId]);

  if (!hasAiProfile) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[10px] text-slate-500 mr-1 flex-shrink-0">Entwurf bearbeiten:</span>

        <button
          type="button"
          title="Vorhandenen Antworttext sprachlich verbessern"
          onClick={() => runAction('rewrite')}
          disabled={!!loading}
          className="px-2 py-0.5 rounded text-[11px] border border-slate-700 bg-slate-900/50 text-slate-300 hover:bg-slate-800 hover:text-slate-100 disabled:opacity-40 transition-colors"
        >
          {loading === 'rewrite' ? '...' : ''} Verbessern
        </button>

        <button
          type="button"
          title="Stichpunkte oder Rohtext zu einer fertigen Antwort machen"
          onClick={() => runAction('cleanup')}
          disabled={!!loading}
          className="px-2 py-0.5 rounded text-[11px] border border-slate-700 bg-slate-900/50 text-slate-300 hover:bg-slate-800 hover:text-slate-100 disabled:opacity-40 transition-colors"
        >
          {loading === 'cleanup' ? '...' : ''} Ausformulieren
        </button>

        <div className="relative" ref={translateRef}>
          <button
            type="button"
            title="Antworttext uebersetzen"
            onClick={() => setShowTranslatePicker((v) => !v)}
            disabled={!!loading}
            className="px-2 py-0.5 rounded text-[11px] border border-slate-700 bg-slate-900/50 text-slate-300 hover:bg-slate-800 hover:text-slate-100 disabled:opacity-40 transition-colors"
          >
            {loading === 'translate' ? '...' : ''} Uebersetzen
          </button>
          {showTranslatePicker && (
            <div className="absolute top-full left-0 mt-1 z-50 rounded border border-slate-700 bg-slate-900 shadow-lg py-1 min-w-32">
              {TRANSLATE_LANGS.map((lang) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => runAction('translate', { targetLanguage: lang })}
                  className="w-full text-left px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 hover:text-slate-100"
                >
                  {lang}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="relative" ref={templateRef}>
          <button
            type="button"
            title="KI-Antwort mit einer Postfach-Vorlage erstellen"
            onClick={() => setShowTemplatePicker((v) => !v)}
            disabled={!!loading}
            className="px-2 py-0.5 rounded text-[11px] border border-slate-700 bg-slate-900/50 text-slate-300 hover:bg-slate-800 hover:text-slate-100 disabled:opacity-40 transition-colors"
          >
            {loading === 'template_reply' ? '...' : ''} KI-Vorlage
          </button>
          {showTemplatePicker && (
            <div className="absolute top-full left-0 mt-1 z-50 rounded border border-slate-700 bg-slate-900 shadow-lg py-1 min-w-44">
              {emailTemplates.length === 0 ? (
                <div className="px-3 py-2 text-xs text-slate-500">Keine KI-Vorlagen vorhanden</div>
              ) : (
                emailTemplates.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => runAction('template_reply', { templateKey: tpl.key })}
                    className="w-full text-left px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 hover:text-slate-100"
                  >
                    {tpl.name}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {diffResult && (
        <AiDiffView
          diffResult={diffResult}
          onAccept={() => { setText(diffResult.suggestion); setDiffResult(null); }}
          onDiscard={() => setDiffResult(null)}
          onRetry={() => runAction('rewrite')}
        />
      )}
    </div>
  );
}

function AiDiffView({
  diffResult,
  onAccept,
  onDiscard,
  onRetry,
}: {
  diffResult: DiffResult;
  onAccept: () => void;
  onDiscard: () => void;
  onRetry: () => void;
}) {
  const hasTrace =
    !!diffResult.templateKey ||
    diffResult.knowledgeHits.length > 0 ||
    diffResult.priceHits.length > 0 ||
    diffResult.piiAnonymized ||
    typeof diffResult.tokensUsed === 'number';

  return (
    <div className="rounded border border-slate-600/60 bg-slate-900/70 overflow-hidden text-xs">
      {hasTrace && (
        <div className="px-2.5 py-1.5 border-b border-slate-700/60 bg-slate-800/30 flex items-center gap-1.5 flex-wrap">
          <span className="text-slate-500">Genutzt:</span>
          {diffResult.templateKey && (
            <span className="px-1.5 py-0.5 rounded-full bg-violet-900/30 border border-violet-700/40 text-violet-300 text-[10px]">
              Vorlage: {diffResult.templateKey}
            </span>
          )}
          {diffResult.knowledgeHits.map((hit) => (
            <span key={hit} className="px-1.5 py-0.5 rounded-full bg-emerald-900/30 border border-emerald-700/40 text-emerald-300 text-[10px]">
              Wissen: {hit}
            </span>
          ))}
          {diffResult.priceHits.map((hit) => (
            <span key={hit} className="px-1.5 py-0.5 rounded-full bg-amber-900/30 border border-amber-700/40 text-amber-300 text-[10px]">
              Preis: {hit}
            </span>
          ))}
          {diffResult.piiAnonymized && (
            <span className="px-1.5 py-0.5 rounded-full bg-sky-900/30 border border-sky-700/40 text-sky-300 text-[10px]">
              PII anonymisiert
            </span>
          )}
          {typeof diffResult.tokensUsed === 'number' && (
            <span className="px-1.5 py-0.5 rounded-full bg-slate-900/60 border border-slate-700/60 text-slate-400 text-[10px]">
              ~{diffResult.tokensUsed} Tokens
            </span>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-700/60">
        <div className="p-2.5">
          <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wide mb-1.5">Original</div>
          <div className="text-slate-400 whitespace-pre-wrap max-h-36 overflow-y-auto scrollbar-minimal leading-relaxed">
            {diffResult.original}
          </div>
        </div>
        <div className="p-2.5">
          <div className="text-[10px] text-emerald-500 font-semibold uppercase tracking-wide mb-1.5">KI-Vorschlag</div>
          <div className="text-slate-200 whitespace-pre-wrap max-h-36 overflow-y-auto scrollbar-minimal leading-relaxed">
            {diffResult.suggestion}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 px-2.5 py-1.5 border-t border-slate-700/60 bg-slate-800/20">
        <button type="button" onClick={onRetry} className="text-slate-400 hover:text-slate-200 transition-colors">
          Nochmal
        </button>
        <button type="button" onClick={onDiscard} className="text-slate-400 hover:text-slate-200 transition-colors">
          Verwerfen
        </button>
        <button
          type="button"
          onClick={onAccept}
          className="px-2.5 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-white transition-colors"
        >
          Uebernehmen
        </button>
      </div>
    </div>
  );
}
