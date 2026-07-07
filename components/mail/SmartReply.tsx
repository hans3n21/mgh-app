"use client";

import React, { useEffect, useMemo, useState } from 'react';
import PriceCheckBanner from './PriceCheckBanner';
import type { PriceValidationHint } from '@/lib/ai/price-matcher';

type EmailTemplate = {
  id: string;
  key: string;
  name: string;
  isActive: boolean;
};

type Props = {
  mailAccountId: string | null;
  hasAiProfile: boolean;
  incomingMail: string;
  customerName?: string;
  mailId?: string;
  onInsert: (text: string) => void;
  getCurrentText: () => string;
};

type TransformResponse = {
  result?: string;
  error?: string;
  knowledgeHits?: string[];
  priceHits?: string[];
  priceValidation?: PriceValidationHint[];
  piiAnonymized?: boolean;
  tokensUsed?: number;
};

type ReplyTrace = {
  templateName: string;
  templateKey: string;
  knowledgeHits: string[];
  priceHits: string[];
  priceValidation: PriceValidationHint[];
  generatedText: string;
  piiAnonymized: boolean;
  tokensUsed?: number;
};

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function hasAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function isRejectionTemplate(label: string) {
  return hasAny(label, ['absage', 'ablehnung', 'ablehnen']);
}

function scoreTemplate(template: EmailTemplate, incomingMail: string) {
  const input = normalizeText(incomingMail);
  const label = normalizeText(`${template.name} ${template.key}`);
  let score = 0;

  const pickguardInquiry = hasAny(input, ['pickguard', 'schlagbrett', 'schlagbretter', 'jaguar', 'bass']);
  if (label.includes('pickguard') && pickguardInquiry) score += 8;
  if (pickguardInquiry && hasAny(label, ['angebot', 'standard'])) score += 6;
  if (label.includes('custom') && hasAny(input, ['custom', 'sonder', 'anfertigung'])) score += 4;

  const priceIntent = hasAny(input, ['preis', 'preise', 'kostet', 'kosten', 'angebot', 'eur', 'euro']);
  if (hasAny(label, ['preis', 'preise', 'kosten'])) score += priceIntent ? 5 : -6;

  const rejectionIntent = hasAny(input, ['leider nicht', 'koennen wir nicht', 'absage', 'ablehnen']);
  if (isRejectionTemplate(label)) {
    if (!rejectionIntent) return Number.NEGATIVE_INFINITY;
    score += 4;
  }

  for (const token of label.split(/\s+/).filter((word) => word.length >= 5)) {
    if (input.includes(token)) score += 1;
  }

  return score;
}

export default function SmartReply({ mailAccountId, hasAiProfile, incomingMail, customerName, mailId, onInsert, getCurrentText }: Props) {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [lastTrace, setLastTrace] = useState<ReplyTrace | null>(null);

  useEffect(() => {
    setLastTrace(null);
  }, [mailId, incomingMail]);

  useEffect(() => {
    if (!hasAiProfile || !mailAccountId || !incomingMail.trim()) return;
    fetch(`/api/mail-accounts/${mailAccountId}/email-templates`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: EmailTemplate[]) => setTemplates(data.filter((t) => t.isActive)))
      .catch(() => {});
  }, [hasAiProfile, mailAccountId, incomingMail]);

  const suggestedTemplates = useMemo(() => {
    const normalizedIncoming = normalizeText(incomingMail);
    const pickguardInquiry = hasAny(normalizedIncoming, ['pickguard', 'schlagbrett', 'schlagbretter']);
    const maxSuggestions = pickguardInquiry ? 1 : 3;

    return [...templates]
      .map((template, index) => ({
        template,
        index,
        score: scoreTemplate(template, incomingMail),
      }))
      .filter((item) => Number.isFinite(item.score) && item.score > -4)
      .sort((left, right) => right.score - left.score || left.index - right.index)
      .slice(0, maxSuggestions)
      .map((item) => item.template);
  }, [templates, incomingMail]);

  if (!hasAiProfile || templates.length === 0 || suggestedTemplates.length === 0) return null;

  async function applyTemplate(tpl: EmailTemplate) {
    if (!mailAccountId) return;
    setLoadingKey(tpl.key);
    try {
      const res = await fetch('/api/ai/transform', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mailAccountId,
          action: 'template_reply',
          inputText: incomingMail,
          originalMail: incomingMail,
          templateKey: tpl.key,
          customerName,
          mailId,
        }),
      });
      const data = await res.json() as TransformResponse;
      if (!res.ok) throw new Error(data.error || 'Fehler');
      if (!data.result) throw new Error('Keine KI-Antwort erhalten');
      onInsert(data.result);
      setLastTrace({
        templateName: tpl.name,
        templateKey: tpl.key,
        knowledgeHits: data.knowledgeHits ?? [],
        priceHits: data.priceHits ?? [],
        priceValidation: data.priceValidation ?? [],
        generatedText: data.result,
        piiAnonymized: !!data.piiAnonymized,
        tokensUsed: data.tokensUsed,
      });
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'KI-Fehler');
    } finally {
      setLoadingKey(null);
    }
  }

  return (
    <div className="py-1.5 space-y-1.5">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span
          className="text-[10px] text-slate-500 flex-shrink-0"
          title="Empfohlene KI-Antworten aus den aktiven Postfach-Vorlagen."
        >
          Antwortvorschlag:
        </span>
        {suggestedTemplates.map((tpl) => (
          <button
            key={tpl.key}
            type="button"
            onClick={() => applyTemplate(tpl)}
            disabled={!!loadingKey}
            className="px-2 py-0.5 rounded-full text-[11px] border border-emerald-700/50 bg-emerald-900/20 text-emerald-300 hover:bg-emerald-900/40 hover:border-emerald-600/70 disabled:opacity-40 transition-colors"
            title="Erstellt eine KI-Antwort mit dieser Postfach-Vorlage und passendem Wissen."
          >
            {loadingKey === tpl.key ? '...' : ''} {tpl.name}
          </button>
        ))}
      </div>

      {lastTrace && (
        <div className="flex items-center gap-1.5 flex-wrap rounded border border-slate-800/80 bg-slate-950/30 px-2 py-1">
          <span className="text-[10px] text-slate-500">Genutzt:</span>
          <span className="px-1.5 py-0.5 rounded-full bg-violet-900/30 border border-violet-700/40 text-violet-300 text-[10px]">
            Vorlage: {lastTrace.templateName}
          </span>
          {lastTrace.knowledgeHits.map((hit) => (
            <span key={hit} className="px-1.5 py-0.5 rounded-full bg-emerald-900/30 border border-emerald-700/40 text-emerald-300 text-[10px]">
              Wissen: {hit}
            </span>
          ))}
          {lastTrace.priceHits.map((hit) => (
            <span key={hit} className="px-1.5 py-0.5 rounded-full bg-amber-900/30 border border-amber-700/40 text-amber-300 text-[10px]">
              Preis: {hit}
            </span>
          ))}
          {lastTrace.piiAnonymized && (
            <span className="px-1.5 py-0.5 rounded-full bg-sky-900/30 border border-sky-700/40 text-sky-300 text-[10px]">
              PII anonymisiert
            </span>
          )}
          {typeof lastTrace.tokensUsed === 'number' && (
            <span className="px-1.5 py-0.5 rounded-full bg-slate-900/60 border border-slate-700/60 text-slate-400 text-[10px]">
              ~{lastTrace.tokensUsed} Tokens
            </span>
          )}
        </div>
      )}

      {lastTrace && lastTrace.priceValidation.length > 0 && (
        <PriceCheckBanner
          text={lastTrace.generatedText}
          hints={lastTrace.priceValidation}
          getCurrentText={getCurrentText}
          onFix={onInsert}
        />
      )}
    </div>
  );
}
