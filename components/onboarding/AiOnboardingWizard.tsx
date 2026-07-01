"use client";

import React, { useState, useRef, useCallback } from "react";
import type { ProcessedMail, SuggestedTemplate, SuggestedKnowledgeEntry } from "@/lib/ai/mail-processor";

// ─── Typen ───────────────────────────────────────────────────────────────────

type ReviewItem<T> = {
  item: T;
  state: "accept" | "reject" | "edit";
  editValue: T;
};

type TestResult = {
  question: string;
  answer: string | null;
  loading: boolean;
  rating: "good" | "bad" | null;
  feedback: string;
};

type WizardState = {
  businessContext: string;
  websiteUrl: string;
  formality: string;
  tone: string;
  inputMails: string[];
  batchResult: { results: ProcessedMail[]; deduplicatedKnowledge: SuggestedKnowledgeEntry[] } | null;
  templateReviews: ReviewItem<SuggestedTemplate>[];
  knowledgeReviews: ReviewItem<SuggestedKnowledgeEntry>[];
  styleText: string;
  styleState: "accept" | "edit";
  styleEditValue: string;
  testResults: TestResult[];
};

// ─── Konstanten ──────────────────────────────────────────────────────────────

const TONE_OPTIONS = [
  { id: "PROFESSIONAL", label: "Professionell" },
  { id: "FRIENDLY", label: "Freundlich" },
  { id: "CASUAL", label: "Locker" },
  { id: "SHORT", label: "Kurz" },
  { id: "EMPATHIC", label: "Empathisch" },
];

const PLACEHOLDER_COLORS: Record<string, string> = {
  NAME: "bg-orange-900/40 text-orange-300 border border-orange-700/50",
  EMAIL: "bg-red-900/40 text-red-300 border border-red-700/50",
  PHONE: "bg-blue-900/40 text-blue-300 border border-blue-700/50",
  IBAN: "bg-purple-900/40 text-purple-300 border border-purple-700/50",
  ADDRESS: "bg-yellow-900/40 text-yellow-300 border border-yellow-700/50",
  POSTALCODE: "bg-green-900/40 text-green-300 border border-green-700/50",
  CUSTOMERNR: "bg-cyan-900/40 text-cyan-300 border border-cyan-700/50",
};

const STEP_LABELS = ["Dein Business", "Mails einspeisen", "Ergebnisse prüfen", "Live-Test"];

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

function extractEmlBody(text: string): string {
  // Einfache EML-Extraktion: nach leerem Header-Abschnitt suchen
  const headerEnd = text.indexOf("\n\n");
  if (headerEnd === -1) return text;
  const body = text.slice(headerEnd + 2);
  // Quoted-Printable-Encodierung grob auflösen
  return body.replace(/=\r?\n/g, "").replace(/=[0-9A-F]{2}/gi, (m) =>
    String.fromCharCode(parseInt(m.slice(1), 16))
  );
}

function highlightPlaceholders(text: string): React.ReactNode[] {
  const parts = text.split(/({{[A-Z_0-9]+}})/g);
  return parts.map((part, i) => {
    const match = part.match(/^{{([A-Z]+)_\d+}}$/);
    if (match) {
      const type = match[1];
      const colorClass = PLACEHOLDER_COLORS[type] ?? "bg-slate-700 text-slate-300 border border-slate-600";
      return (
        <span key={i} className={`inline-block rounded px-1 py-0.5 text-xs font-mono mx-0.5 ${colorClass}`}>
          {part}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

// ─── Props ───────────────────────────────────────────────────────────────────

type Props = {
  mailAccountId: string;
  existingAiProfile?: { generatedStyleProfile: string | null } | null;
  onClose: () => void;
  onComplete?: () => void;
};

// ─── Hauptkomponente ─────────────────────────────────────────────────────────

export default function AiOnboardingWizard({ mailAccountId, existingAiProfile, onClose, onComplete }: Props) {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processingIndex, setProcessingIndex] = useState<number | null>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [state, setState] = useState<WizardState>({
    businessContext: "",
    websiteUrl: "",
    formality: "SIE",
    tone: "PROFESSIONAL",
    inputMails: [],
    batchResult: null,
    templateReviews: [],
    knowledgeReviews: [],
    styleText: existingAiProfile?.generatedStyleProfile ?? "",
    styleState: "accept",
    styleEditValue: existingAiProfile?.generatedStyleProfile ?? "",
    testResults: [],
  });

  // ── Schritt 1: Profil speichern + weiter ─────────────────────────────────

  async function saveProfileAndNext() {
    if (!state.businessContext.trim()) {
      setError("Bitte beschreibe kurz dein Business.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await fetch(`/api/mail-accounts/${mailAccountId}/ai-profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessContext: state.businessContext,
          tone: state.tone,
          formality: state.formality,
        }),
      });
      setStep(2);
    } catch {
      setError("Speichern fehlgeschlagen. Bitte nochmal versuchen.");
    } finally {
      setSaving(false);
    }
  }

  // ── Schritt 2: Mail hinzufügen ────────────────────────────────────────────

  function addMailText(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    setState(s => ({ ...s, inputMails: [...s.inputMails, trimmed] }));
  }

  function removeMail(idx: number) {
    setState(s => ({ ...s, inputMails: s.inputMails.filter((_, i) => i !== idx) }));
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    const text = e.dataTransfer.getData("text/plain");

    if (text?.trim()) {
      addMailText(text);
      return;
    }

    files.forEach(file => {
      if (file.name.endsWith(".eml") || file.name.endsWith(".txt")) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const content = ev.target?.result as string;
          addMailText(file.name.endsWith(".eml") ? extractEmlBody(content) : content);
        };
        reader.readAsText(file, "utf-8");
      }
    });
  }, []);

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const content = ev.target?.result as string;
        addMailText(file.name.endsWith(".eml") ? extractEmlBody(content) : content);
      };
      reader.readAsText(file, "utf-8");
    });
    e.target.value = "";
  }

  async function analyzeMailBatch() {
    if (state.inputMails.length === 0) return;
    setError(null);
    setProcessingIndex(0);

    try {
      const res = await fetch("/api/ai/process-mail-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mailAccountId, mails: state.inputMails }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Fehler bei der Analyse");

      // Review-State aufbauen
      const allTemplates: SuggestedTemplate[] = data.results
        .map((r: ProcessedMail) => r.suggestedTemplate)
        .filter(Boolean) as SuggestedTemplate[];

      const templateReviews: ReviewItem<SuggestedTemplate>[] = allTemplates.map(t => ({
        item: t, state: "accept", editValue: { ...t },
      }));

      const knowledgeReviews: ReviewItem<SuggestedKnowledgeEntry>[] = data.deduplicatedKnowledge.map(
        (k: SuggestedKnowledgeEntry) => ({ item: k, state: "accept", editValue: { ...k } })
      );

      // Stil aus styleRelevant-Mails ermitteln
      const hasStyleRelevant = data.results.some((r: ProcessedMail) => r.styleRelevant);

      setState(s => ({
        ...s,
        batchResult: data,
        templateReviews,
        knowledgeReviews,
        styleText: hasStyleRelevant ? (s.styleText || "") : s.styleText,
      }));

      setStep(3);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setProcessingIndex(null);
    }
  }

  // ── Schritt 3: Speichern ─────────────────────────────────────────────────

  async function saveAndNext() {
    setError(null);
    setSaving(true);

    const acceptedTemplates = state.templateReviews
      .filter(r => r.state !== "reject")
      .map(r => r.state === "edit" ? r.editValue : r.item);

    const acceptedKnowledge = state.knowledgeReviews
      .filter(r => r.state !== "reject")
      .map(r => r.state === "edit" ? r.editValue : r.item);

    const styleChanged = state.styleState === "edit" && state.styleEditValue !== state.styleText;

    try {
      await fetch("/api/ai/confirm-processed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mailAccountId,
          templates: acceptedTemplates,
          knowledge: acceptedKnowledge,
          updateStyle: false,
        }),
      });

      // Stil separat speichern wenn geändert
      if (styleChanged) {
        await fetch(`/api/mail-accounts/${mailAccountId}/ai-profile`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ generatedStyleProfile: state.styleEditValue }),
        });
      }

      await generateTestQuestions();
      setStep(4);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  }

  // ── Schritt 4: Live-Test ─────────────────────────────────────────────────

  async function generateTestQuestions() {
    try {
      const res = await fetch("/api/ai/transform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mailAccountId,
          action: "summarize",
          inputText:
            `Erstelle 3 realistische Kundenanfragen für ein Unternehmen das: ${state.businessContext}. ` +
            `Verschiedene Typen: Preisanfrage, Reklamation, allgemeine Frage. ` +
            `Antworte NUR mit einem JSON-Array mit 3 Strings. Beispiel: ["Anfrage 1","Anfrage 2","Anfrage 3"]`,
          isPreview: false,
        }),
      });
      const data = await res.json();
      let questions: string[] = [];
      try {
        const cleaned = (data.result ?? "").replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        questions = JSON.parse(cleaned);
      } catch {
        questions = [
          "Was kostet eine Gitarren-Reparatur bei Ihnen?",
          "Ich habe ein Problem mit meiner letzten Bestellung.",
          "Wie lange dauert die Lieferung?",
        ];
      }

      const testResults: TestResult[] = questions.slice(0, 3).map(q => ({
        question: q, answer: null, loading: false, rating: null, feedback: "",
      }));
      setState(s => ({ ...s, testResults }));

      // Antworten parallel generieren
      testResults.forEach((_, i) => generateTestAnswer(questions[i], i));
    } catch {
      // Fallback-Fragen
      const fallbackQuestions = [
        "Was kostet eine Standard-Reparatur?",
        "Ich habe ein Problem mit meiner letzten Bestellung.",
        "Wie lange dauert die Lieferung?",
      ];
      const testResults: TestResult[] = fallbackQuestions.map(q => ({
        question: q, answer: null, loading: false, rating: null, feedback: "",
      }));
      setState(s => ({ ...s, testResults }));
      fallbackQuestions.forEach((q, i) => generateTestAnswer(q, i));
    }
  }

  async function generateTestAnswer(question: string, index: number) {
    setState(s => {
      const updated = [...s.testResults];
      if (updated[index]) updated[index] = { ...updated[index], loading: true };
      return { ...s, testResults: updated };
    });

    try {
      const res = await fetch("/api/ai/transform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mailAccountId,
          action: "template_reply",
          inputText: question,
        }),
      });
      const data = await res.json();
      setState(s => {
        const updated = [...s.testResults];
        if (updated[index]) updated[index] = { ...updated[index], answer: data.result ?? data.error, loading: false };
        return { ...s, testResults: updated };
      });
    } catch {
      setState(s => {
        const updated = [...s.testResults];
        if (updated[index]) updated[index] = { ...updated[index], answer: "Fehler beim Laden", loading: false };
        return { ...s, testResults: updated };
      });
    }
  }

  async function finalize() {
    // Negatives Feedback als customInstructions anhängen
    const badFeedback = state.testResults
      .filter(r => r.rating === "bad" && r.feedback.trim())
      .map(r => r.feedback.trim())
      .join("\n");

    if (badFeedback) {
      await fetch(`/api/mail-accounts/${mailAccountId}/ai-profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appendCustomInstructions: badFeedback }),
      }).catch(() => {});
    }

    onComplete?.();
    onClose();
  }

  const goodRatings = state.testResults.filter(r => r.rating === "good").length;
  const allRated = state.testResults.length > 0 && state.testResults.every(r => r.rating !== null);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700 shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-xl">🤖</span>
            <span className="font-semibold text-slate-100">KI-Onboarding</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100 transition-colors text-xl leading-none">&times;</button>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-2 px-6 py-3 border-b border-slate-700/50 shrink-0">
          {STEP_LABELS.map((label, i) => {
            const n = i + 1;
            const active = step === n;
            const done = step > n;
            return (
              <React.Fragment key={n}>
                <div className="flex items-center gap-1.5 shrink-0">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors
                    ${done ? "bg-emerald-600 text-white" : active ? "bg-blue-600 text-white" : "bg-slate-700 text-slate-400"}`}>
                    {done ? "✓" : n}
                  </div>
                  <span className={`text-xs hidden sm:block ${active ? "text-slate-100" : done ? "text-emerald-400" : "text-slate-500"}`}>
                    {label}
                  </span>
                </div>
                {i < STEP_LABELS.length - 1 && (
                  <div className={`flex-1 h-px ${done ? "bg-emerald-700" : "bg-slate-700"}`} />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Fehler */}
        {error && (
          <div className="mx-6 mt-3 px-3 py-2 bg-red-900/40 border border-red-700/50 rounded text-red-300 text-sm shrink-0">
            {error}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">

          {/* ── Schritt 1 ── */}
          {step === 1 && (
            <div className="space-y-5">
              <p className="text-slate-300 text-sm">
                Beschreibe kurz dein Business — damit die KI Mails in deinem Stil und Kontext formuliert.
              </p>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Was macht dein Laden? *</label>
                <textarea
                  value={state.businessContext}
                  onChange={e => setState(s => ({ ...s, businessContext: e.target.value }))}
                  rows={3}
                  placeholder="z.B. Wir sind eine Gitarren-Werkstatt und fertigen individuelle E-Gitarren und Akustikgitarren..."
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Website-URL (optional)</label>
                <input
                  type="url"
                  value={state.websiteUrl}
                  onChange={e => setState(s => ({ ...s, websiteUrl: e.target.value }))}
                  placeholder="https://meine-gitarrenwerkstatt.de"
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-2">Anrede</label>
                <div className="flex gap-2">
                  {[{ id: "DU", label: "Du" }, { id: "SIE", label: "Sie" }].map(opt => (
                    <button key={opt.id}
                      onClick={() => setState(s => ({ ...s, formality: opt.id }))}
                      className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors
                        ${state.formality === opt.id
                          ? "bg-blue-600 border-blue-600 text-white"
                          : "bg-slate-800 border-slate-600 text-slate-300 hover:border-slate-500"}`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-2">Ton</label>
                <div className="flex flex-wrap gap-2">
                  {TONE_OPTIONS.map(opt => (
                    <button key={opt.id}
                      onClick={() => setState(s => ({ ...s, tone: opt.id }))}
                      className={`px-3 py-1.5 rounded-lg text-sm border transition-colors
                        ${state.tone === opt.id
                          ? "bg-blue-600 border-blue-600 text-white"
                          : "bg-slate-800 border-slate-600 text-slate-300 hover:border-slate-500"}`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Schritt 2 ── */}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-slate-300 text-sm">
                Speise gesendete Mails ein — je mehr, desto besser lernt die KI deinen Stil.
              </p>

              {/* Dropzone */}
              <div
                ref={dropRef}
                onDragOver={e => { e.preventDefault(); dropRef.current?.classList.add("border-blue-500", "bg-blue-950/20"); }}
                onDragLeave={() => { dropRef.current?.classList.remove("border-blue-500", "bg-blue-950/20"); }}
                onDrop={e => { dropRef.current?.classList.remove("border-blue-500", "bg-blue-950/20"); handleDrop(e); }}
                onClick={() => textareaRef.current?.focus()}
                className="border-2 border-dashed border-slate-600 rounded-xl p-4 transition-colors cursor-text"
              >
                <p className="text-center text-slate-400 text-sm mb-3">
                  Ziehe hier .eml oder .txt Dateien rein — oder füge Text ein
                </p>
                <textarea
                  ref={textareaRef}
                  rows={4}
                  placeholder="Mail-Text hier einfügen und Enter drücken..."
                  className="w-full bg-slate-800/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none"
                  onKeyDown={e => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                      addMailText((e.target as HTMLTextAreaElement).value);
                      (e.target as HTMLTextAreaElement).value = "";
                    }
                  }}
                />
                <p className="text-center text-slate-500 text-xs mt-2">Ctrl+Enter zum Hinzufügen</p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs text-slate-400 hover:text-slate-200 border border-slate-600 hover:border-slate-500 rounded-lg px-3 py-1.5 transition-colors"
                >
                  📁 Dateien auswählen
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".eml,.txt"
                  multiple
                  className="hidden"
                  onChange={handleFileInput}
                />
                <span className={`ml-auto text-xs self-center font-medium ${state.inputMails.length >= 3 ? "text-emerald-400" : "text-slate-400"}`}>
                  {state.inputMails.length} von mindestens 3 Mails {state.inputMails.length >= 3 ? "✓" : ""}
                </span>
              </div>

              {/* Mail-Liste */}
              {state.inputMails.length > 0 && (
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {state.inputMails.map((mail, i) => (
                    <div key={i} className="flex items-center gap-2 bg-slate-800 rounded-lg px-3 py-2 text-sm">
                      <span className="text-slate-400 text-xs shrink-0">#{i + 1}</span>
                      <span className="flex-1 text-slate-300 truncate">{mail.slice(0, 80)}{mail.length > 80 ? "…" : ""}</span>
                      <button onClick={() => removeMail(i)} className="text-slate-500 hover:text-red-400 shrink-0 text-xs">✕</button>
                    </div>
                  ))}
                </div>
              )}

              {processingIndex !== null && (
                <div className="flex items-center gap-2 text-blue-400 text-sm">
                  <span className="animate-spin">⏳</span>
                  Verarbeite Mails... bitte warten
                </div>
              )}
            </div>
          )}

          {/* ── Schritt 3 ── */}
          {step === 3 && (
            <div className="space-y-5">

              {/* Stil */}
              {(state.styleText || state.batchResult?.results.some(r => r.styleRelevant)) && (
                <Section title="✍️ Schreibstil">
                  {state.styleState === "accept" ? (
                    <div className="space-y-2">
                      <p className="text-slate-300 text-sm whitespace-pre-line bg-slate-800 rounded-lg p-3">
                        {state.styleText || "Kein Stil-Profil generiert."}
                      </p>
                      <button
                        onClick={() => setState(s => ({ ...s, styleState: "edit", styleEditValue: s.styleText }))}
                        className="text-xs text-slate-400 hover:text-slate-200 border border-slate-600 rounded px-2 py-1 transition-colors"
                      >
                        ✎ Anpassen
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <textarea
                        value={state.styleEditValue}
                        onChange={e => setState(s => ({ ...s, styleEditValue: e.target.value }))}
                        rows={4}
                        className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500 resize-none"
                      />
                      <button
                        onClick={() => setState(s => ({ ...s, styleState: "accept", styleText: s.styleEditValue }))}
                        className="text-xs text-emerald-400 hover:text-emerald-300 border border-emerald-700 rounded px-2 py-1 transition-colors"
                      >
                        ✓ Übernehmen
                      </button>
                    </div>
                  )}
                </Section>
              )}

              {/* Vorlagen */}
              {state.templateReviews.length > 0 && (
                <Section title={`📋 Vorlagen (${state.templateReviews.filter(r => r.state !== "reject").length} von ${state.templateReviews.length})`}>
                  <div className="space-y-3">
                    {state.templateReviews.map((review, i) => (
                      <TemplateCard
                        key={i}
                        review={review}
                        onChange={updated => {
                          setState(s => {
                            const next = [...s.templateReviews];
                            next[i] = updated;
                            return { ...s, templateReviews: next };
                          });
                        }}
                      />
                    ))}
                  </div>
                </Section>
              )}

              {/* Wissen */}
              {state.knowledgeReviews.length > 0 && (
                <Section title={`💡 Wissen (${state.knowledgeReviews.filter(r => r.state !== "reject").length} von ${state.knowledgeReviews.length})`}>
                  <div className="space-y-2">
                    {state.knowledgeReviews.map((review, i) => (
                      <KnowledgeCard
                        key={i}
                        review={review}
                        onChange={updated => {
                          setState(s => {
                            const next = [...s.knowledgeReviews];
                            next[i] = updated;
                            return { ...s, knowledgeReviews: next };
                          });
                        }}
                      />
                    ))}
                  </div>
                </Section>
              )}

              {state.templateReviews.length === 0 && state.knowledgeReviews.length === 0 && (
                <p className="text-slate-400 text-sm text-center py-8">
                  Keine Ergebnisse aus der Analyse. Du kannst trotzdem fortfahren.
                </p>
              )}
            </div>
          )}

          {/* ── Schritt 4 ── */}
          {step === 4 && (
            <div className="space-y-5">
              <p className="text-slate-300 text-sm">
                Wie gut klingen die KI-Antworten auf typische Kundenanfragen?
              </p>

              {state.testResults.length === 0 && (
                <div className="flex items-center gap-2 text-blue-400 text-sm py-4">
                  <span className="animate-spin">⏳</span> Generiere Testfragen...
                </div>
              )}

              {state.testResults.map((result, i) => (
                <div key={i} className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-3">
                  <div className="text-xs font-medium text-slate-400">Kundenanfrage #{i + 1}</div>
                  <p className="text-slate-200 text-sm">{result.question}</p>

                  <div className="border-t border-slate-700/50 pt-3">
                    <div className="text-xs font-medium text-slate-400 mb-1.5">KI-Antwort</div>
                    {result.loading ? (
                      <div className="text-blue-400 text-sm animate-pulse">Generiere Antwort...</div>
                    ) : (
                      <p className="text-slate-300 text-sm whitespace-pre-line leading-relaxed">{result.answer}</p>
                    )}
                  </div>

                  {!result.loading && result.answer && (
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => setState(s => {
                          const updated = [...s.testResults];
                          updated[i] = { ...updated[i], rating: "good" };
                          return { ...s, testResults: updated };
                        })}
                        className={`px-3 py-1 rounded-lg text-sm border transition-colors ${result.rating === "good" ? "bg-emerald-600 border-emerald-600 text-white" : "bg-slate-700 border-slate-600 text-slate-300 hover:border-emerald-600"}`}
                      >
                        👍 Gut
                      </button>
                      <button
                        onClick={() => setState(s => {
                          const updated = [...s.testResults];
                          updated[i] = { ...updated[i], rating: "bad" };
                          return { ...s, testResults: updated };
                        })}
                        className={`px-3 py-1 rounded-lg text-sm border transition-colors ${result.rating === "bad" ? "bg-red-700 border-red-600 text-white" : "bg-slate-700 border-slate-600 text-slate-300 hover:border-red-600"}`}
                      >
                        👎 Nachbessern
                      </button>

                      {result.rating === "bad" && (
                        <input
                          value={result.feedback}
                          onChange={e => setState(s => {
                            const updated = [...s.testResults];
                            updated[i] = { ...updated[i], feedback: e.target.value };
                            return { ...s, testResults: updated };
                          })}
                          placeholder="Was war falsch?"
                          className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-2 py-1 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                        />
                      )}
                    </div>
                  )}
                </div>
              ))}

              {allRated && (
                <div className={`rounded-xl p-4 text-center ${goodRatings >= 2 ? "bg-emerald-900/30 border border-emerald-700/50" : "bg-amber-900/30 border border-amber-700/50"}`}>
                  {goodRatings >= 2 ? (
                    <p className="text-emerald-300 font-medium">🎉 Deine KI ist bereit!</p>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-amber-300 font-medium">Lass uns nachbessern</p>
                      <p className="text-amber-400/80 text-xs">Du kannst jederzeit mehr Mails einspeisen um den Stil zu verbessern.</p>
                      <button
                        onClick={() => setStep(3)}
                        className="text-xs text-amber-400 hover:text-amber-300 border border-amber-700/50 rounded px-3 py-1 transition-colors"
                      >
                        ← Zurück zu Schritt 3
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-700 shrink-0">
          <button
            onClick={() => step > 1 ? setStep(s => s - 1) : onClose()}
            className="text-sm text-slate-400 hover:text-slate-200 transition-colors"
          >
            {step === 1 ? "Abbrechen" : "← Zurück"}
          </button>

          {step === 1 && (
            <button
              onClick={saveProfileAndNext}
              disabled={saving || !state.businessContext.trim()}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
            >
              {saving ? "Speichern…" : "Weiter →"}
            </button>
          )}

          {step === 2 && (
            <button
              onClick={analyzeMailBatch}
              disabled={state.inputMails.length === 0 || processingIndex !== null}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
            >
              {processingIndex !== null ? "Analysiere…" : "🤖 KI analysieren lassen"}
            </button>
          )}

          {step === 3 && (
            <button
              onClick={saveAndNext}
              disabled={saving}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {saving ? "Speichern…" : "Auswahl speichern →"}
            </button>
          )}

          {step === 4 && (
            <button
              onClick={finalize}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Zur Inbox →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Hilfskomponenten ─────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border border-slate-700 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-800/50 hover:bg-slate-800 transition-colors text-left"
      >
        <span className="text-sm font-medium text-slate-200">{title}</span>
        <span className="text-slate-400 text-xs">{open ? "▲" : "▼"}</span>
      </button>
      {open && <div className="p-4">{children}</div>}
    </div>
  );
}

function TemplateCard({
  review,
  onChange,
}: {
  review: ReviewItem<SuggestedTemplate>;
  onChange: (r: ReviewItem<SuggestedTemplate>) => void;
}) {
  const { item, state, editValue } = review;
  const rejected = state === "reject";

  return (
    <div className={`border rounded-xl p-3 transition-opacity ${rejected ? "opacity-40 border-slate-700" : "border-slate-600"}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-mono bg-slate-700 text-slate-300 rounded px-1.5 py-0.5">{item.key}</span>
        <span className="text-sm font-medium text-slate-200">{item.name}</span>
        <div className="ml-auto flex gap-1">
          <ReviewButtons state={state}
            onAccept={() => onChange({ ...review, state: "accept" })}
            onReject={() => onChange({ ...review, state: "reject" })}
            onEdit={() => onChange({ ...review, state: "edit" })}
          />
        </div>
      </div>

      {state === "edit" ? (
        <div className="space-y-2 mt-2">
          <input value={editValue.name} onChange={e => onChange({ ...review, editValue: { ...editValue, name: e.target.value } })}
            placeholder="Name" className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-blue-500" />
          <input value={editValue.key} onChange={e => onChange({ ...review, editValue: { ...editValue, key: e.target.value } })}
            placeholder="key (kebab-case)" className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs font-mono text-slate-100 focus:outline-none focus:border-blue-500" />
          <textarea value={editValue.body} onChange={e => onChange({ ...review, editValue: { ...editValue, body: e.target.value } })}
            rows={3} className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-blue-500 resize-none" />
        </div>
      ) : (
        <p className="text-slate-400 text-xs leading-relaxed line-clamp-3">
          {highlightPlaceholders(item.body)}
        </p>
      )}
    </div>
  );
}

function KnowledgeCard({
  review,
  onChange,
}: {
  review: ReviewItem<SuggestedKnowledgeEntry>;
  onChange: (r: ReviewItem<SuggestedKnowledgeEntry>) => void;
}) {
  const { item, state, editValue } = review;
  const rejected = state === "reject";

  return (
    <div className={`flex items-start gap-2 border rounded-xl p-3 transition-opacity ${rejected ? "opacity-40 border-slate-700" : "border-slate-600"}`}>
      {state === "edit" ? (
        <div className="flex-1 space-y-2">
          <input value={editValue.title} onChange={e => onChange({ ...review, editValue: { ...editValue, title: e.target.value } })}
            placeholder="Titel" className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-blue-500" />
          <input value={editValue.keywords.join(", ")}
            onChange={e => onChange({ ...review, editValue: { ...editValue, keywords: e.target.value.split(",").map(k => k.trim()).filter(Boolean) } })}
            placeholder="Keywords (kommagetrennt)" className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-blue-500" />
          <textarea value={editValue.content} onChange={e => onChange({ ...review, editValue: { ...editValue, content: e.target.value } })}
            rows={2} className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-blue-500 resize-none" />
        </div>
      ) : (
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-slate-200 truncate">{item.title}</span>
            {item.category && (
              <span className="text-xs bg-slate-700 text-slate-300 rounded px-1.5 py-0.5">{item.category}</span>
            )}
          </div>
          <div className="flex flex-wrap gap-1 mt-1.5">
            {item.keywords.map((kw, i) => (
              <span key={i} className="text-xs bg-blue-900/40 text-blue-300 border border-blue-700/40 rounded px-1.5 py-0.5">{kw}</span>
            ))}
          </div>
        </div>
      )}
      <div className="flex gap-1 shrink-0">
        <ReviewButtons state={state}
          onAccept={() => onChange({ ...review, state: "accept" })}
          onReject={() => onChange({ ...review, state: "reject" })}
          onEdit={() => onChange({ ...review, state: "edit" })}
        />
      </div>
    </div>
  );
}

function ReviewButtons({
  state,
  onAccept,
  onReject,
  onEdit,
}: {
  state: "accept" | "reject" | "edit";
  onAccept: () => void;
  onReject: () => void;
  onEdit: () => void;
}) {
  return (
    <>
      <button onClick={onAccept} title="Übernehmen"
        className={`w-6 h-6 flex items-center justify-center rounded text-xs transition-colors
          ${state === "accept" ? "bg-emerald-600 text-white" : "bg-slate-700 text-slate-400 hover:bg-emerald-700 hover:text-white"}`}>
        ✓
      </button>
      <button onClick={onEdit} title="Bearbeiten"
        className={`w-6 h-6 flex items-center justify-center rounded text-xs transition-colors
          ${state === "edit" ? "bg-blue-600 text-white" : "bg-slate-700 text-slate-400 hover:bg-blue-700 hover:text-white"}`}>
        ✎
      </button>
      <button onClick={onReject} title="Verwerfen"
        className={`w-6 h-6 flex items-center justify-center rounded text-xs transition-colors
          ${state === "reject" ? "bg-red-700 text-white" : "bg-slate-700 text-slate-400 hover:bg-red-700 hover:text-white"}`}>
        ✗
      </button>
    </>
  );
}
