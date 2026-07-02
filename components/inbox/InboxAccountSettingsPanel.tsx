"use client";

import React, { useEffect, useState, useRef, useCallback } from 'react';
import AiOnboardingWizard from '@/components/onboarding/AiOnboardingWizard';
import type { ProcessedMail } from '@/lib/ai/mail-processor';

type MailAccount = {
  id: string;
  name: string;
  email: string;
  profile?: { displayName?: string | null } | null;
};

type MailAccountProfile = {
  mailAccountId: string;
  displayName: string | null;
  aiSystemPrompt: string | null;
  backgroundInfo: string | null;
  defaultLanguage: string;
  defaultOrderType: string | null;
  templateIds: string[];
  pinnedFolders: string[];
};

type AiProfile = {
  id?: string;
  tone: string;
  formality: string;
  signatureName: string;
  customInstructions: string | null;
  businessContext: string | null;
  generatedStyleProfile: string | null;
  preferredModel: string;
  preferredProvider: string;
  apiKey: string | null;
};

type EmailTemplate = {
  id: string;
  key: string;
  name: string;
  subject: string | null;
  body: string;
  placeholders: string[];
  isActive: boolean;
  sortOrder: number;
};

type KnowledgeEntry = {
  id: string;
  title: string;
  keywords: string[];
  content: string;
  category: string | null;
  isActive: boolean;
};

type ImapFolder = {
  path: string;
  name: string;
};

type Props = {
  account: MailAccount | null;
  open: boolean;
  onClose: () => void;
};

const TONE_OPTIONS = [
  { id: 'PROFESSIONAL', label: 'Professionell' },
  { id: 'FRIENDLY', label: 'Freundlich' },
  { id: 'CASUAL', label: 'Locker' },
  { id: 'SHORT', label: 'Kurz' },
  { id: 'EMPATHIC', label: 'Empathisch' },
];

const FORMALITY_OPTIONS = [
  { id: 'DU', label: 'Du' },
  { id: 'SIE', label: 'Sie' },
  { id: 'AUTO', label: 'Auto' },
];

const TEMPLATE_KEY_SUGGESTIONS = ['versand', 'reklamation', 'anfrage', 'angebot', 'allgemein'];

const KNOWLEDGE_CATEGORIES = ['preise', 'produkte', 'lieferung', 'sonstiges'];

const DEFAULT_AI_PROFILE: AiProfile = {
  tone: 'FRIENDLY',
  formality: 'DU',
  signatureName: '',
  customInstructions: null,
  businessContext: null,
  generatedStyleProfile: null,
  preferredModel: 'gpt-4o-mini',
  preferredProvider: 'openai',
  apiKey: null,
};

export default function InboxAccountSettingsPanel({ account, open, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<'ai' | 'templates' | 'knowledge' | 'company' | 'folders'>('ai');

  // Profile state
  const [profile, setProfile] = useState<MailAccountProfile | null>(null);
  const [aiProfile, setAiProfile] = useState<AiProfile>(DEFAULT_AI_PROFILE);
  const [folders, setFolders] = useState<ImapFolder[]>([]);

  // Template state
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>([]);
  const [newTemplate, setNewTemplate] = useState({ key: '', name: '', subject: '', body: '' });
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<Partial<EmailTemplate>>({});

  // Knowledge state
  const [knowledgeEntries, setKnowledgeEntries] = useState<KnowledgeEntry[]>([]);
  const [showNewKnowledge, setShowNewKnowledge] = useState(false);
  const [newKnowledge, setNewKnowledge] = useState({ title: '', keywords: '', content: '', category: '' });
  const [keywordInput, setKeywordInput] = useState('');
  const [editingKnowledgeId, setEditingKnowledgeId] = useState<string | null>(null);
  const [editingKnowledge, setEditingKnowledge] = useState<Partial<KnowledgeEntry & { keywordsRaw: string }>>({});

  // UI state
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [generatingStyle, setGeneratingStyle] = useState(false);
  const [showOnboardingWizard, setShowOnboardingWizard] = useState(false);

  // Drop-Handler State (Chunk D)
  const [isProcessingDrop, setIsProcessingDrop] = useState(false);
  const [processedResult, setProcessedResult] = useState<ProcessedMail | null>(null);
  const [dropKnowledgeAccepted, setDropKnowledgeAccepted] = useState<boolean[]>([]);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  // CSV-Import State (Wissen-Tab)
  const [csvPreview, setCsvPreview] = useState<{
    markdown: string;
    rows: string[][];
    headers: string[];
    title: string;
    keywords: string;
    category: string;
    warningSize: boolean;
  } | null>(null);
  const csvDropRef = useRef<HTMLDivElement>(null);
  const csvFileRef = useRef<HTMLInputElement>(null);

  // CompanyData State (Firma-Tab)
  const [companyData, setCompanyData] = useState<Array<{
    key: string; label: string; value: string; isSecret: boolean; category: string | null; sortOrder: number;
  }>>([]);
  const [companyDataSaving, setCompanyDataSaving] = useState(false);
  const [companyDataMsg, setCompanyDataMsg] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewResult, setPreviewResult] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [settingsChanged, setSettingsChanged] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  useEffect(() => {
    if (!open || !account?.id) return;
    let active = true;
    setLoading(true);
    Promise.all([
      fetch(`/api/mail-accounts/${account.id}/profile`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/mail-accounts/${account.id}/folders`).then((r) => (r.ok ? r.json() : [])),
      fetch(`/api/mail-accounts/${account.id}/ai-profile`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/mail-accounts/${account.id}/email-templates`).then((r) => (r.ok ? r.json() : [])),
      fetch(`/api/mail-accounts/${account.id}/knowledge`).then((r) => (r.ok ? r.json() : [])),
      fetch(`/api/mail-accounts/${account.id}/company-data`).then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([profileData, folderData, aiData, templatesData, knowledgeData, companyDataRaw]) => {
        if (!active) return;
        setProfile(profileData);
        setFolders(folderData || []);
        setAiProfile(aiData ? { ...DEFAULT_AI_PROFILE, ...aiData } : DEFAULT_AI_PROFILE);
        setEmailTemplates(templatesData || []);
        setKnowledgeEntries(knowledgeData || []);
        setCompanyData(companyDataRaw || []);
        setSettingsChanged(false);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [open, account?.id]);

  // ── CSV-Import Hilfsfunktionen ──────────────────────────────────────────

  function parseCSV(text: string): { headers: string[]; rows: string[][] } {
    const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
    if (lines.length === 0) return { headers: [], rows: [] };

    // Delimiter auto-erkennen: Semikolon > Tab > Komma
    const sample = lines[0];
    const delimiter = sample.includes(';') ? ';' : sample.includes('\t') ? '\t' : ',';

    const parseLine = (line: string) => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') { inQuotes = !inQuotes; continue; }
        if (ch === delimiter && !inQuotes) { result.push(current.trim()); current = ''; continue; }
        current += ch;
      }
      result.push(current.trim());
      return result;
    };

    const headers = parseLine(lines[0]);
    const rows = lines.slice(1).map(parseLine);
    return { headers, rows };
  }

  function csvToMarkdown(headers: string[], rows: string[][]): string {
    const col = (s: string) => s.replace(/\|/g, '\\|');
    const header = '| ' + headers.map(col).join(' | ') + ' |';
    const sep = '|' + headers.map(() => '------').join('|') + '|';
    const body = rows.map(r => '| ' + headers.map((_, i) => col(r[i] ?? '')).join(' | ') + ' |').join('\n');
    return [header, sep, body].join('\n');
  }

  function autoDetectCategory(headers: string[]): string {
    const h = headers.join(' ').toLowerCase();
    if (/preis|€|eur|kosten|betrag/.test(h)) return 'preise';
    if (/produkt|artikel|item|bezeichn/.test(h)) return 'produkte';
    return 'sonstiges';
  }

  function handleCsvFile(file: File) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const { headers, rows } = parseCSV(text);
      if (headers.length === 0) return;
      const markdown = csvToMarkdown(headers, rows);
      const title = file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
      const keywords = [...headers.map(h => h.toLowerCase()), 'tabelle', 'liste'].filter(Boolean);
      setCsvPreview({
        markdown,
        rows,
        headers,
        title,
        keywords: keywords.join(', '),
        category: autoDetectCategory(headers),
        warningSize: markdown.length > 3000,
      });
    };
    reader.readAsText(file, 'utf-8');
  }

  async function saveCsvAsKnowledge() {
    if (!csvPreview || !account?.id) return;
    if (csvPreview.markdown.length > 8000) return;
    setSaving(true);
    try {
      const keywords = csvPreview.keywords.split(',').map(k => k.trim()).filter(Boolean);
      await fetch(`/api/mail-accounts/${account.id}/knowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: csvPreview.title,
          keywords,
          content: csvPreview.markdown,
          category: csvPreview.category || null,
        }),
      });
      const updated = await fetch(`/api/mail-accounts/${account.id}/knowledge`).then(r => r.ok ? r.json() : []);
      setKnowledgeEntries(updated);
      setCsvPreview(null);
    } catch {
      alert('Speichern fehlgeschlagen');
    } finally {
      setSaving(false);
    }
  }

  // ── CompanyData speichern ──────────────────────────────────────────────────

  async function saveCompanyData() {
    if (!account?.id) return;
    setCompanyDataSaving(true);
    try {
      const res = await fetch(`/api/mail-accounts/${account.id}/company-data`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: companyData }),
      });
      if (!res.ok) throw new Error('Speichern fehlgeschlagen');
      const updated = await res.json();
      setCompanyData(updated);
      setCompanyDataMsg('Gespeichert ✓');
      setTimeout(() => setCompanyDataMsg(''), 2500);
    } catch {
      alert('Firmendaten konnten nicht gespeichert werden.');
    } finally {
      setCompanyDataSaving(false);
    }
  }

  function addCompanyField(key: string, label: string, isSecret: boolean, category: string) {
    if (companyData.find(e => e.key === key)) return;
    setCompanyData(prev => [...prev, {
      key, label, value: '', isSecret, category, sortOrder: prev.length,
    }]);
  }

  const handleMailDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    dropZoneRef.current?.classList.remove('border-sky-500', 'bg-sky-950/20');
    const rawText = e.dataTransfer.getData('text/plain');
    if (!rawText?.trim() || !account?.id) return;

    setIsProcessingDrop(true);
    try {
      const res = await fetch('/api/ai/process-mail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mailAccountId: account.id, rawMailText: rawText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Analyse fehlgeschlagen');
      setProcessedResult(data);
      setDropKnowledgeAccepted(data.suggestedKnowledge?.map(() => true) ?? []);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Fehler bei der KI-Analyse');
    } finally {
      setIsProcessingDrop(false);
    }
  }, [account?.id]);

  async function confirmDropResult(onlyTemplate: boolean) {
    if (!processedResult || !account?.id) return;
    setSaving(true);
    try {
      const templates = processedResult.suggestedTemplate ? [processedResult.suggestedTemplate] : [];
      const knowledge = onlyTemplate
        ? []
        : (processedResult.suggestedKnowledge ?? []).filter((_, i) => dropKnowledgeAccepted[i]);

      await fetch('/api/ai/confirm-processed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mailAccountId: account.id, templates, knowledge }),
      });

      // Liste aktualisieren
      const [tplData, kwData] = await Promise.all([
        fetch(`/api/mail-accounts/${account.id}/email-templates`).then(r => r.ok ? r.json() : []),
        fetch(`/api/mail-accounts/${account.id}/knowledge`).then(r => r.ok ? r.json() : []),
      ]);
      setEmailTemplates(tplData || []);
      setKnowledgeEntries(kwData || []);
      setProcessedResult(null);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Speichern fehlgeschlagen');
    } finally {
      setSaving(false);
    }
  }

  async function saveAiProfile() {
    if (!account?.id) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/mail-accounts/${account.id}/ai-profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(aiProfile),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Speichern fehlgeschlagen (${res.status})`);
      }
      const updated = await res.json();
      setAiProfile({ ...DEFAULT_AI_PROFILE, ...updated });
      setSettingsChanged(false);
      setSaveMsg('Gespeichert ✓');
      setTimeout(() => setSaveMsg(''), 2500);
    } catch (error) {
      console.error(error);
      alert('AI-Profil konnte nicht gespeichert werden.');
    } finally {
      setSaving(false);
    }
  }

  async function saveFolderProfile() {
    if (!profile || !account?.id) return;
    setSaving(true);
    try {
      await fetch(`/api/mail-accounts/${account.id}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      });
      setSaveMsg('Gespeichert ✓');
      setTimeout(() => setSaveMsg(''), 2500);
    } finally {
      setSaving(false);
    }
  }

  async function generateStyle() {
    if (!account?.id) return;
    setGeneratingStyle(true);
    try {
      // Zuerst AI-Profil sicherstellen (Upsert mit aktuellen Werten)
      const saveRes = await fetch(`/api/mail-accounts/${account.id}/ai-profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(aiProfile),
      });
      if (!saveRes.ok) {
        const saveData = await saveRes.json().catch(() => ({}));
        throw new Error(saveData.error || 'Profil konnte nicht gespeichert werden');
      }

      const res = await fetch('/api/ai/analyze-style', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mailAccountId: account.id }),
      });

      let data: Record<string, string> = {};
      try {
        data = await res.json();
      } catch {
        throw new Error('Server-Antwort konnte nicht gelesen werden (Status ' + res.status + ')');
      }

      if (!res.ok) {
        if (res.status === 404) {
          throw new Error('Kein AI-Profil gefunden. Bitte zuerst speichern.');
        }
        if (res.status === 400 && data.error?.includes('Keine aktiven Vorlagen')) {
          throw new Error('Keine Vorlagen vorhanden. Lege zuerst Vorlagen im Tab "📋 Vorlagen" an — der Stil wird aus diesen Beispielen gelernt.');
        }
        if (data.error?.includes('API-Key') || data.error?.includes('konfiguriert')) {
          throw new Error('Kein API-Key konfiguriert. Trage einen API-Key im Bereich "Modell" ein und speichere.');
        }
        throw new Error(data.error || 'Generierung fehlgeschlagen');
      }

      setAiProfile((prev) => ({ ...prev, generatedStyleProfile: data.generatedStyleProfile }));
      setSettingsChanged(true);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Unbekannter Fehler');
    } finally {
      setGeneratingStyle(false);
    }
  }

  async function generatePreview() {
    if (!account?.id) return;
    setPreviewLoading(true);
    setPreviewResult(null);
    try {
      const res = await fetch('/api/ai/transform', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mailAccountId: account.id, isPreview: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Fehler');
      setPreviewResult(data.result);
      setSettingsChanged(false);
    } catch (err: unknown) {
      setPreviewResult(`Fehler: ${err instanceof Error ? err.message : 'Unbekannt'}`);
    } finally {
      setPreviewLoading(false);
    }
  }

  // --- EmailTemplate CRUD ---
  async function createEmailTemplate() {
    if (!account?.id || !newTemplate.key.trim() || !newTemplate.name.trim() || !newTemplate.body.trim()) return;
    const res = await fetch(`/api/mail-accounts/${account.id}/email-templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newTemplate),
    });
    if (res.ok) {
      const created = await res.json();
      setEmailTemplates((prev) => [...prev, created]);
      setNewTemplate({ key: '', name: '', subject: '', body: '' });
    } else {
      const data = await res.json();
      alert(data.error || 'Fehler beim Erstellen');
    }
  }

  async function toggleTemplate(tpl: EmailTemplate) {
    const res = await fetch(`/api/mail-accounts/${account!.id}/email-templates/${tpl.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !tpl.isActive }),
    });
    if (res.ok) {
      setEmailTemplates((prev) => prev.map((t) => t.id === tpl.id ? { ...t, isActive: !t.isActive } : t));
    }
  }

  async function saveEditingTemplate() {
    if (!editingTemplateId || !account?.id) return;
    const res = await fetch(`/api/mail-accounts/${account.id}/email-templates/${editingTemplateId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editingTemplate),
    });
    if (res.ok) {
      const updated = await res.json();
      setEmailTemplates((prev) => prev.map((t) => t.id === editingTemplateId ? updated : t));
      setEditingTemplateId(null);
    }
  }

  async function deleteTemplate(id: string) {
    if (!account?.id || !confirm('Vorlage wirklich löschen?')) return;
    const res = await fetch(`/api/mail-accounts/${account.id}/email-templates/${id}`, { method: 'DELETE' });
    if (res.ok) setEmailTemplates((prev) => prev.filter((t) => t.id !== id));
  }

  // --- KnowledgeEntry CRUD ---
  async function createKnowledge() {
    if (!account?.id || !newKnowledge.title.trim() || !newKnowledge.content.trim()) return;
    const keywords = newKnowledge.keywords
      ? newKnowledge.keywords.split(',').map((k) => k.trim()).filter(Boolean)
      : [];
    const res = await fetch(`/api/mail-accounts/${account.id}/knowledge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newKnowledge, keywords }),
    });
    if (res.ok) {
      const created = await res.json();
      setKnowledgeEntries((prev) => [...prev, created]);
      setNewKnowledge({ title: '', keywords: '', content: '', category: '' });
      setKeywordInput('');
      setShowNewKnowledge(false);
    }
  }

  async function toggleKnowledge(entry: KnowledgeEntry) {
    const res = await fetch(`/api/mail-accounts/${account!.id}/knowledge/${entry.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !entry.isActive }),
    });
    if (res.ok) {
      setKnowledgeEntries((prev) => prev.map((e) => e.id === entry.id ? { ...e, isActive: !e.isActive } : e));
    }
  }

  async function saveEditingKnowledge() {
    if (!editingKnowledgeId || !account?.id) return;
    const data: Record<string, unknown> = { ...editingKnowledge };
    if (typeof editingKnowledge.keywordsRaw === 'string') {
      data.keywords = editingKnowledge.keywordsRaw.split(',').map((k) => k.trim()).filter(Boolean);
      delete data.keywordsRaw;
    }
    const res = await fetch(`/api/mail-accounts/${account.id}/knowledge/${editingKnowledgeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      const updated = await res.json();
      setKnowledgeEntries((prev) => prev.map((e) => e.id === editingKnowledgeId ? updated : e));
      setEditingKnowledgeId(null);
    }
  }

  async function deleteKnowledge(id: string) {
    if (!account?.id || !confirm('Eintrag wirklich löschen?')) return;
    const res = await fetch(`/api/mail-accounts/${account.id}/knowledge/${id}`, { method: 'DELETE' });
    if (res.ok) setKnowledgeEntries((prev) => prev.filter((e) => e.id !== id));
  }

  if (!open) return null;

  return (
    <>
    <aside
      data-inbox-settings-panel="true"
      className={`w-full h-full flex flex-col border-r border-slate-800 bg-slate-950/95 overflow-hidden transition-all duration-180 ease-out ${
        open ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2'
      }`}
    >
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-slate-800 bg-slate-950">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-100">Postfach-Einstellungen</div>
            <div className="text-xs text-slate-400">{account?.profile?.displayName || account?.name || account?.email}</div>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-200 text-lg leading-none">✕</button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-3">
          {([
            { id: 'ai', label: '✨ KI' },
            { id: 'templates', label: '📋 Vorlagen' },
            { id: 'knowledge', label: '🧠 Wissen' },
            { id: 'company', label: '🏢 Firma' },
            { id: 'folders', label: '📁 Ordner' },
          ] as const).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-2.5 py-1 rounded text-[11px] transition-colors ${
                activeTab === tab.id
                  ? 'bg-violet-600/30 border border-violet-500/60 text-violet-200'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="px-4 py-4 text-sm text-slate-400">Lade Einstellungen…</div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {/* ── KI-Tab ── */}
          {activeTab === 'ai' && (
            <div className="p-4 space-y-5">
              {/* Onboarding-CTA */}
              {!aiProfile.generatedStyleProfile ? (
                <button
                  onClick={() => setShowOnboardingWizard(true)}
                  className="w-full py-3 px-4 border-2 border-dashed border-violet-600/60 rounded-xl text-sm text-violet-300 hover:text-violet-100 hover:border-violet-500 hover:bg-violet-950/20 transition-colors text-center"
                >
                  🤖 Du hast die KI noch nicht eingerichtet — jetzt in 3 Minuten starten →
                </button>
              ) : (
                <button
                  onClick={() => setShowOnboardingWizard(true)}
                  className="w-full mb-1 py-2 px-4 border border-dashed border-slate-600 rounded-lg text-sm text-slate-400 hover:text-slate-200 hover:border-slate-500 transition-colors"
                >
                  🤖 KI-Onboarding durchführen (Mails einspeisen, Stil lernen, Wissen aufbauen)
                </button>
              )}

              {/* Tonalität */}
              <section className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tonalität</div>
                <div className="flex flex-wrap gap-1.5">
                  {TONE_OPTIONS.map((tone) => (
                    <button
                      key={tone.id}
                      type="button"
                      onClick={() => { setAiProfile((p) => ({ ...p, tone: tone.id })); setSettingsChanged(true); }}
                      className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                        aiProfile.tone === tone.id
                          ? 'bg-violet-600/30 border-violet-500 text-violet-200'
                          : 'border-slate-700 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      {tone.label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {FORMALITY_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => { setAiProfile((p) => ({ ...p, formality: opt.id })); setSettingsChanged(true); }}
                      className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                        aiProfile.formality === opt.id
                          ? 'bg-sky-600/30 border-sky-500 text-sky-200'
                          : 'border-slate-700 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </section>

              {/* Signatur-Name */}
              <section className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Signatur / Name</label>
                <input
                  value={aiProfile.signatureName}
                  onChange={(e) => { setAiProfile((p) => ({ ...p, signatureName: e.target.value })); setSettingsChanged(true); }}
                  placeholder="z.B. Das MGH-Team"
                  className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-200 placeholder-slate-500"
                />
              </section>

              {/* Auto-generiertes Stil-Profil */}
              <section className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Auto-generiertes Stil-Profil</div>
                  <button
                    type="button"
                    onClick={generateStyle}
                    disabled={generatingStyle}
                    className="text-[11px] px-2 py-0.5 rounded border border-violet-600/60 bg-violet-900/20 text-violet-300 hover:bg-violet-900/40 disabled:opacity-50 flex items-center gap-1"
                  >
                    {generatingStyle ? <><span className="animate-spin">⟳</span> Generiere…</> : '✨ Neu generieren'}
                  </button>
                </div>
                <textarea
                  readOnly
                  value={aiProfile.generatedStyleProfile ?? ''}
                  rows={4}
                  placeholder="Noch kein Stil-Profil generiert. Lege zuerst Vorlagen an und klicke 'Neu generieren'."
                  className="w-full rounded border border-slate-700 bg-slate-900/40 px-2 py-1.5 text-xs text-slate-400 resize-none cursor-default"
                />
              </section>

              {/* Eigene Anweisungen */}
              <section className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Eigene Anweisungen</label>
                <textarea
                  value={aiProfile.customInstructions ?? ''}
                  onChange={(e) => { setAiProfile((p) => ({ ...p, customInstructions: e.target.value || null })); setSettingsChanged(true); }}
                  rows={3}
                  placeholder="z.B. Wir sagen immer Moin statt Hallo, Preise immer netto nennen"
                  className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-200 placeholder-slate-500"
                />
              </section>

              {/* Hintergrundwissen */}
              <section className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Geschäfts-Kontext</label>
                <textarea
                  value={aiProfile.businessContext ?? ''}
                  onChange={(e) => { setAiProfile((p) => ({ ...p, businessContext: e.target.value || null })); setSettingsChanged(true); }}
                  rows={3}
                  placeholder="Was macht euer Laden? Welche Produkte, Policies, Besonderheiten?"
                  className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-200 placeholder-slate-500"
                />
              </section>

              {/* Preview */}
              <section className="border-t border-slate-800 pt-4 space-y-2">
                <button
                  type="button"
                  onClick={() => setPreviewOpen((v) => !v)}
                  className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200"
                >
                  <span className={`transition-transform ${previewOpen ? 'rotate-90' : ''}`}>▶</span>
                  Vorschau
                </button>
                {previewOpen && (
                  <div className="space-y-2">
                    <div className="text-[11px] text-slate-500">
                      Generiert eine Beispielantwort mit den aktuellen gespeicherten Einstellungen.
                    </div>
                    {settingsChanged && (
                      <div className="text-[11px] text-amber-400 bg-amber-900/20 border border-amber-700/40 rounded px-2 py-1">
                        Einstellungen geändert — zuerst speichern, dann Vorschau aktualisieren.
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={generatePreview}
                      disabled={previewLoading || settingsChanged}
                      className="px-2.5 py-1 rounded border border-sky-600/60 bg-sky-900/20 text-sky-300 text-xs hover:bg-sky-900/40 disabled:opacity-50"
                    >
                      {previewLoading ? '⟳ Generiere…' : '▶ Vorschau generieren'}
                    </button>
                    {previewResult && (
                      <div className="rounded border border-slate-700 bg-slate-900/60 p-2.5 text-xs text-slate-200 whitespace-pre-wrap">
                        {previewResult}
                      </div>
                    )}
                  </div>
                )}
              </section>

              <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                {saveMsg ? <span className="text-xs text-emerald-400">{saveMsg}</span> : <span />}
                <button
                  type="button"
                  onClick={saveAiProfile}
                  disabled={saving}
                  className="rounded bg-violet-600 hover:bg-violet-500 px-3 py-1.5 text-xs text-white disabled:opacity-50"
                >
                  {saving ? 'Speichert…' : 'Speichern'}
                </button>
              </div>
            </div>
          )}

          {/* ── Vorlagen-Tab ── */}
          {activeTab === 'templates' && (
            <div className="p-4 space-y-4">
              <div className="text-xs text-slate-400">
                Postfach-spezifische Vorlagen für die KI. Diese werden als Stil-Beispiele verwendet.
              </div>

              {/* Vorlagen-Liste */}
              <div className="space-y-2">
                {emailTemplates.length === 0 && (
                  <div className="text-xs text-slate-500 italic">Noch keine Vorlagen vorhanden.</div>
                )}
                {emailTemplates.map((tpl) => (
                  <div key={tpl.id} className="rounded border border-slate-700/80 bg-slate-900/40 overflow-hidden">
                    {editingTemplateId === tpl.id ? (
                      <div className="p-2.5 space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[11px] text-slate-400">Key</label>
                            <input
                              value={editingTemplate.key ?? ''}
                              onChange={(e) => setEditingTemplate((p) => ({ ...p, key: e.target.value }))}
                              className="w-full mt-0.5 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200"
                            />
                          </div>
                          <div>
                            <label className="text-[11px] text-slate-400">Name</label>
                            <input
                              value={editingTemplate.name ?? ''}
                              onChange={(e) => setEditingTemplate((p) => ({ ...p, name: e.target.value }))}
                              className="w-full mt-0.5 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="text-[11px] text-slate-400">Betreff (optional)</label>
                          <input
                            value={editingTemplate.subject ?? ''}
                            onChange={(e) => setEditingTemplate((p) => ({ ...p, subject: e.target.value }))}
                            className="w-full mt-0.5 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] text-slate-400">Text</label>
                          <textarea
                            value={editingTemplate.body ?? ''}
                            onChange={(e) => setEditingTemplate((p) => ({ ...p, body: e.target.value }))}
                            rows={5}
                            className="w-full mt-0.5 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200"
                          />
                        </div>
                        <div className="flex gap-2 justify-end">
                          <button type="button" onClick={() => setEditingTemplateId(null)} className="text-xs text-slate-400 hover:text-slate-200">Abbrechen</button>
                          <button type="button" onClick={saveEditingTemplate} className="text-xs px-2 py-0.5 rounded bg-sky-600 hover:bg-sky-500 text-white">Speichern</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 px-2.5 py-2">
                        <button
                          type="button"
                          title={tpl.isActive ? 'Deaktivieren' : 'Aktivieren'}
                          onClick={() => toggleTemplate(tpl)}
                          className={`w-8 h-4 rounded-full transition-colors flex-shrink-0 ${tpl.isActive ? 'bg-violet-600' : 'bg-slate-700'}`}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-slate-200 truncate">{tpl.name}</div>
                          <div className="text-[11px] text-slate-500">{tpl.key}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => { setEditingTemplateId(tpl.id); setEditingTemplate(tpl); }}
                          className="text-slate-500 hover:text-slate-300 text-xs"
                        >✏</button>
                        <button
                          type="button"
                          onClick={() => deleteTemplate(tpl.id)}
                          className="text-slate-600 hover:text-red-400 text-xs"
                        >✕</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* KI-Drop-Zone */}
              <div
                ref={dropZoneRef}
                onDragOver={e => { e.preventDefault(); dropZoneRef.current?.classList.add('border-sky-500', 'bg-sky-950/20'); }}
                onDragLeave={() => { dropZoneRef.current?.classList.remove('border-sky-500', 'bg-sky-950/20'); }}
                onDrop={handleMailDrop}
                className="rounded border-2 border-dashed border-slate-700 p-3 transition-colors text-center"
              >
                {isProcessingDrop ? (
                  <div className="flex items-center justify-center gap-2 text-sky-400 text-xs py-1">
                    <span className="animate-spin">⏳</span> KI analysiert die Mail…
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">
                    📥 Mail hierher ziehen um KI-Vorlage zu erstellen
                  </p>
                )}
              </div>

              {/* KI-Drop-Review */}
              {processedResult && (
                <div className="rounded border border-sky-700/50 bg-sky-950/20 p-3 space-y-3">
                  <div className="text-xs font-semibold text-sky-300 uppercase tracking-wide">KI hat folgendes aus der Mail extrahiert:</div>

                  {processedResult.suggestedTemplate && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono bg-slate-700 text-slate-300 rounded px-1.5 py-0.5">
                          {processedResult.suggestedTemplate.key}
                        </span>
                        <span className="text-sm font-medium text-slate-200">{processedResult.suggestedTemplate.name}</span>
                      </div>
                      <p className="text-xs text-slate-400 bg-slate-800/50 rounded p-2 line-clamp-4 whitespace-pre-line">
                        {processedResult.suggestedTemplate.body}
                      </p>
                    </div>
                  )}

                  {processedResult.suggestedKnowledge?.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-xs text-slate-400 font-medium">Auch als Wissen erkannt:</div>
                      {processedResult.suggestedKnowledge.map((k, i) => (
                        <label key={i} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={dropKnowledgeAccepted[i] ?? true}
                            onChange={e => setDropKnowledgeAccepted(prev => { const next = [...prev]; next[i] = e.target.checked; return next; })}
                            className="rounded border-slate-600"
                          />
                          <span className="text-xs text-slate-300">{k.title}</span>
                          {k.keywords.slice(0, 3).map((kw, j) => (
                            <span key={j} className="text-[10px] bg-blue-900/40 text-blue-300 rounded px-1">{kw}</span>
                          ))}
                        </label>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => confirmDropResult(false)}
                      disabled={saving}
                      className="text-xs px-2.5 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-white disabled:opacity-50"
                    >
                      Alles übernehmen
                    </button>
                    <button
                      type="button"
                      onClick={() => confirmDropResult(true)}
                      disabled={saving}
                      className="text-xs px-2.5 py-1 rounded bg-sky-700 hover:bg-sky-600 text-white disabled:opacity-50"
                    >
                      Nur Vorlage
                    </button>
                    <button
                      type="button"
                      onClick={() => setProcessedResult(null)}
                      className="text-xs px-2 py-1 text-slate-400 hover:text-slate-200"
                    >
                      Verwerfen
                    </button>
                  </div>
                </div>
              )}

              {/* Neue Vorlage */}
              <div className="rounded border border-dashed border-slate-700 bg-slate-900/30 p-3 space-y-2">
                <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Neue Vorlage</div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] text-slate-400">Key</label>
                    <div className="relative mt-0.5">
                      <input
                        list="template-key-suggestions"
                        value={newTemplate.key}
                        onChange={(e) => setNewTemplate((p) => ({ ...p, key: e.target.value }))}
                        placeholder="z.B. versand"
                        className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200 placeholder-slate-500"
                      />
                      <datalist id="template-key-suggestions">
                        {TEMPLATE_KEY_SUGGESTIONS.map((s) => <option key={s} value={s} />)}
                      </datalist>
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400">Name</label>
                    <input
                      value={newTemplate.name}
                      onChange={(e) => setNewTemplate((p) => ({ ...p, name: e.target.value }))}
                      placeholder="Anzeigename"
                      className="w-full mt-0.5 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200 placeholder-slate-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[11px] text-slate-400">Betreff (optional)</label>
                  <input
                    value={newTemplate.subject}
                    onChange={(e) => setNewTemplate((p) => ({ ...p, subject: e.target.value }))}
                    placeholder="Re: {betreff}"
                    className="w-full mt-0.5 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200 placeholder-slate-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400">Text <span className="text-slate-500">(Platzhalter: {'{kundenname}'}, {'{bestellnr}'}, …)</span></label>
                  <textarea
                    value={newTemplate.body}
                    onChange={(e) => setNewTemplate((p) => ({ ...p, body: e.target.value }))}
                    rows={5}
                    placeholder="Hallo {kundenname},&#10;&#10;vielen Dank für deine Nachricht…"
                    className="w-full mt-0.5 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200 placeholder-slate-500"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={createEmailTemplate}
                    disabled={!newTemplate.key.trim() || !newTemplate.name.trim() || !newTemplate.body.trim()}
                    className="rounded bg-sky-600 hover:bg-sky-500 px-2.5 py-1 text-xs text-white disabled:opacity-40"
                  >
                    Vorlage anlegen
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Wissen-Tab ── */}
          {activeTab === 'knowledge' && (
            <div className="p-4 space-y-4">
              <div className="text-xs text-slate-400">
                Wissens-Einträge werden automatisch erkannt wenn Keywords in einer Mail vorkommen und in den KI-Prompt injiziert.
                Diese Einträge gelten <span className="text-slate-300">nur für dieses Postfach</span> und überschreiben globale
                Einträge mit gleichem Titel/Kategorie. Allgemeines Wissen für alle Postfächer pflegst du unter{' '}
                <a href="/app/wissen" className="text-sky-400 hover:underline">Wissen</a> im Hauptmenü.
              </div>

              {/* CSV-Import */}
              {!csvPreview ? (
                <div
                  ref={csvDropRef}
                  onDragOver={e => { e.preventDefault(); csvDropRef.current?.classList.add('border-emerald-500', 'bg-emerald-950/20'); }}
                  onDragLeave={() => csvDropRef.current?.classList.remove('border-emerald-500', 'bg-emerald-950/20')}
                  onDrop={e => {
                    e.preventDefault();
                    csvDropRef.current?.classList.remove('border-emerald-500', 'bg-emerald-950/20');
                    const file = Array.from(e.dataTransfer.files).find(f => f.name.endsWith('.csv') || f.name.endsWith('.tsv'));
                    if (file) handleCsvFile(file);
                  }}
                  onClick={() => csvFileRef.current?.click()}
                  className="rounded border-2 border-dashed border-slate-700 p-3 text-center cursor-pointer hover:border-slate-600 transition-colors"
                >
                  <p className="text-xs text-slate-500">📄 CSV oder TSV-Tabelle hier reinziehen oder klicken</p>
                  <input ref={csvFileRef} type="file" accept=".csv,.tsv" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleCsvFile(f); e.target.value = ''; }} />
                </div>
              ) : (
                <div className="rounded border border-emerald-700/50 bg-emerald-950/20 p-3 space-y-3">
                  <div className="text-xs font-semibold text-emerald-300 uppercase tracking-wide">CSV-Vorschau</div>

                  {/* HTML-Tabellen-Vorschau */}
                  <div className="overflow-x-auto max-h-40 rounded border border-slate-700 bg-slate-900/50">
                    <table className="text-xs w-full">
                      <thead className="bg-slate-800">
                        <tr>{csvPreview.headers.map((h, i) => (
                          <th key={i} className="px-2 py-1 text-left text-slate-300 font-medium border-b border-slate-700 whitespace-nowrap">{h}</th>
                        ))}</tr>
                      </thead>
                      <tbody>
                        {csvPreview.rows.slice(0, 8).map((row, i) => (
                          <tr key={i} className={i % 2 === 0 ? 'bg-slate-900/30' : ''}>
                            {csvPreview.headers.map((_, j) => (
                              <td key={j} className="px-2 py-1 text-slate-400 border-b border-slate-800/50 whitespace-nowrap">{row[j] ?? ''}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {csvPreview.rows.length > 8 && (
                      <p className="text-center text-slate-600 text-xs py-1">… {csvPreview.rows.length - 8} weitere Zeilen</p>
                    )}
                  </div>

                  {csvPreview.warningSize && csvPreview.markdown.length <= 8000 && (
                    <p className="text-amber-400 text-xs">⚠ Diese Tabelle ist sehr groß und verbraucht viel Kontext pro KI-Anfrage. Eventuell aufteilen?</p>
                  )}
                  {csvPreview.markdown.length > 8000 && (
                    <p className="text-red-400 text-xs">✕ Tabelle zu groß ({csvPreview.markdown.length} Zeichen). Bitte in mehrere kleinere Tabellen aufteilen.</p>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] text-slate-400">Titel</label>
                      <input value={csvPreview.title}
                        onChange={e => setCsvPreview(p => p ? { ...p, title: e.target.value } : p)}
                        className="w-full mt-0.5 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200" />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-400">Kategorie</label>
                      <select value={csvPreview.category}
                        onChange={e => setCsvPreview(p => p ? { ...p, category: e.target.value } : p)}
                        className="w-full mt-0.5 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200">
                        {KNOWLEDGE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400">Keywords (kommagetrennt)</label>
                    <input value={csvPreview.keywords}
                      onChange={e => setCsvPreview(p => p ? { ...p, keywords: e.target.value } : p)}
                      className="w-full mt-0.5 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200" />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button type="button" onClick={saveCsvAsKnowledge} disabled={saving || csvPreview.markdown.length > 8000}
                      className="text-xs px-2.5 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-white disabled:opacity-50">
                      Als Wissens-Eintrag speichern
                    </button>
                    <button type="button" onClick={() => setCsvPreview(null)} className="text-xs text-slate-400 hover:text-slate-200">Verwerfen</button>
                  </div>
                </div>
              )}

              {/* Einträge-Liste */}
              <div className="space-y-2">
                {knowledgeEntries.length === 0 && (
                  <div className="text-xs text-slate-500 italic">Noch keine Einträge vorhanden.</div>
                )}
                {knowledgeEntries.map((entry) => (
                  <div key={entry.id} className="rounded border border-slate-700/80 bg-slate-900/40 overflow-hidden">
                    {editingKnowledgeId === entry.id ? (
                      <div className="p-2.5 space-y-2">
                        <div>
                          <label className="text-[11px] text-slate-400">Titel</label>
                          <input
                            value={editingKnowledge.title ?? ''}
                            onChange={(e) => setEditingKnowledge((p) => ({ ...p, title: e.target.value }))}
                            className="w-full mt-0.5 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] text-slate-400">Keywords (kommagetrennt)</label>
                          <input
                            value={editingKnowledge.keywordsRaw ?? (editingKnowledge.keywords ?? []).join(', ')}
                            onChange={(e) => setEditingKnowledge((p) => ({ ...p, keywordsRaw: e.target.value }))}
                            placeholder="hals, neck, preis, kosten"
                            className="w-full mt-0.5 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] text-slate-400">Kategorie</label>
                          <select
                            value={editingKnowledge.category ?? ''}
                            onChange={(e) => setEditingKnowledge((p) => ({ ...p, category: e.target.value || null }))}
                            className="w-full mt-0.5 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200"
                          >
                            <option value="">—</option>
                            {KNOWLEDGE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-[11px] text-slate-400">Inhalt</label>
                          <textarea
                            value={editingKnowledge.content ?? ''}
                            onChange={(e) => setEditingKnowledge((p) => ({ ...p, content: e.target.value }))}
                            rows={4}
                            className="w-full mt-0.5 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200"
                          />
                        </div>
                        <div className="flex gap-2 justify-end">
                          <button type="button" onClick={() => setEditingKnowledgeId(null)} className="text-xs text-slate-400 hover:text-slate-200">Abbrechen</button>
                          <button type="button" onClick={saveEditingKnowledge} className="text-xs px-2 py-0.5 rounded bg-sky-600 hover:bg-sky-500 text-white">Speichern</button>
                        </div>
                      </div>
                    ) : (
                      <div className="px-2.5 py-2">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => toggleKnowledge(entry)}
                            className={`w-8 h-4 rounded-full transition-colors flex-shrink-0 ${entry.isActive ? 'bg-emerald-600' : 'bg-slate-700'}`}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium text-slate-200 truncate">{entry.title}</div>
                            {entry.category && <div className="text-[10px] text-slate-500">{entry.category}</div>}
                          </div>
                          <button
                            type="button"
                            onClick={() => { setEditingKnowledgeId(entry.id); setEditingKnowledge(entry); }}
                            className="text-slate-500 hover:text-slate-300 text-xs"
                          >✏</button>
                          <button
                            type="button"
                            onClick={() => deleteKnowledge(entry.id)}
                            className="text-slate-600 hover:text-red-400 text-xs"
                          >✕</button>
                        </div>
                        {entry.keywords.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5 pl-10">
                            {entry.keywords.map((kw) => (
                              <span key={kw} className="px-1.5 py-0.5 rounded-full bg-slate-800 text-[10px] text-slate-400 border border-slate-700">
                                {kw}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Neuer Eintrag */}
              {showNewKnowledge ? (
                <div className="rounded border border-dashed border-slate-700 bg-slate-900/30 p-3 space-y-2">
                  <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Neuer Eintrag</div>
                  <div>
                    <label className="text-[11px] text-slate-400">Titel</label>
                    <input
                      value={newKnowledge.title}
                      onChange={(e) => setNewKnowledge((p) => ({ ...p, title: e.target.value }))}
                      placeholder="z.B. Hals-Preise"
                      className="w-full mt-0.5 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200 placeholder-slate-500"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400">Keywords (kommagetrennt, Enter = hinzufügen)</label>
                    <input
                      value={newKnowledge.keywords}
                      onChange={(e) => setNewKnowledge((p) => ({ ...p, keywords: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const kw = keywordInput.trim();
                          if (kw && !newKnowledge.keywords.split(',').map(k => k.trim()).includes(kw)) {
                            setNewKnowledge((p) => ({ ...p, keywords: p.keywords ? `${p.keywords}, ${kw}` : kw }));
                            setKeywordInput('');
                          }
                        }
                      }}
                      placeholder="hals, neck, preis, kosten"
                      className="w-full mt-0.5 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200 placeholder-slate-500"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400">Kategorie</label>
                    <select
                      value={newKnowledge.category}
                      onChange={(e) => setNewKnowledge((p) => ({ ...p, category: e.target.value }))}
                      className="w-full mt-0.5 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200"
                    >
                      <option value="">—</option>
                      {KNOWLEDGE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400">Inhalt</label>
                    <textarea
                      value={newKnowledge.content}
                      onChange={(e) => setNewKnowledge((p) => ({ ...p, content: e.target.value }))}
                      rows={4}
                      placeholder="Der Wissenstext der in den Prompt injiziert wird…"
                      className="w-full mt-0.5 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200 placeholder-slate-500"
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button type="button" onClick={() => setShowNewKnowledge(false)} className="text-xs text-slate-400 hover:text-slate-200">Abbrechen</button>
                    <button
                      type="button"
                      onClick={createKnowledge}
                      disabled={!newKnowledge.title.trim() || !newKnowledge.content.trim()}
                      className="rounded bg-emerald-700 hover:bg-emerald-600 px-2.5 py-1 text-xs text-white disabled:opacity-40"
                    >
                      Eintrag anlegen
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowNewKnowledge(true)}
                  className="w-full py-1.5 rounded border border-dashed border-slate-700 text-xs text-slate-400 hover:text-slate-200 hover:border-slate-600 transition-colors"
                >
                  + Neuer Eintrag
                </button>
              )}
            </div>
          )}

          {/* ── Firma-Tab ── */}
          {activeTab === 'company' && (
            <div className="p-4 space-y-5">
              <div className="text-xs text-slate-400">
                Firmendaten werden <strong className="text-slate-300">nach</strong> dem KI-Call lokal eingefügt.
                Felder mit 🔒 verlassen die App nie — nur Platzhalter wie{' '}
                <code className="text-emerald-400 bg-slate-800 px-1 rounded">{'{firmen_iban}'}</code> werden an die KI gesendet.
              </div>

              {/* Standard-Felder */}
              <section className="space-y-2">
                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Kontakt &amp; Bank</div>
                {[
                  { key: 'firmenname', label: 'Firmenname', isSecret: false, category: 'kontakt' },
                  { key: 'email_firma', label: 'Kontakt-E-Mail (Signatur)', isSecret: false, category: 'kontakt' },
                  { key: 'telefon', label: 'Telefon', isSecret: true, category: 'kontakt' },
                  { key: 'adresse', label: 'Adresse', isSecret: true, category: 'kontakt' },
                  { key: 'website', label: 'Website', isSecret: false, category: 'kontakt' },
                  { key: 'kontoinhaber', label: 'Kontoinhaber', isSecret: true, category: 'bank' },
                  { key: 'iban', label: 'IBAN', isSecret: true, category: 'bank' },
                  { key: 'bic', label: 'BIC', isSecret: true, category: 'bank' },
                  { key: 'steuernr', label: 'Steuernummer', isSecret: true, category: 'bank' },
                  { key: 'ustid', label: 'USt-ID', isSecret: false, category: 'bank' },
                ].map(field => {
                  const entry = companyData.find(e => e.key === field.key);
                  if (!entry) {
                    return (
                      <button key={field.key} type="button"
                        onClick={() => addCompanyField(field.key, field.label, field.isSecret, field.category)}
                        className="w-full text-left text-xs text-slate-500 hover:text-slate-300 border border-dashed border-slate-800 rounded px-2 py-1 transition-colors">
                        + {field.label} hinzufügen
                      </button>
                    );
                  }
                  return (
                    <div key={field.key} className="flex items-center gap-2">
                      <span className="w-28 text-[11px] text-slate-400 shrink-0 truncate" title={field.label}>
                        {field.isSecret ? '🔒 ' : ''}{field.label}
                      </span>
                      <input
                        value={entry.value}
                        onChange={e => setCompanyData(prev => prev.map(d => d.key === field.key ? { ...d, value: e.target.value } : d))}
                        placeholder={`{firmen_${field.key}}`}
                        className="flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200 placeholder-slate-600"
                      />
                      <button type="button" title="Entfernen"
                        onClick={() => setCompanyData(prev => prev.filter(d => d.key !== field.key))}
                        className="text-slate-600 hover:text-red-400 text-xs shrink-0">✕</button>
                    </div>
                  );
                })}
              </section>

              {/* Custom-Felder */}
              {companyData.filter(e => !['firmenname','email_firma','telefon','adresse','website','kontoinhaber','iban','bic','steuernr','ustid'].includes(e.key) && e.category !== 'signatur').map(entry => (
                <div key={entry.key} className="flex items-center gap-2">
                  <span className="w-28 text-[11px] text-slate-400 shrink-0 truncate" title={entry.label}>
                    {entry.isSecret ? '🔒 ' : ''}{entry.label}
                  </span>
                  <input value={entry.value}
                    onChange={e => setCompanyData(prev => prev.map(d => d.key === entry.key ? { ...d, value: e.target.value } : d))}
                    className="flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200" />
                  <button type="button" onClick={() => setCompanyData(prev => prev.filter(d => d.key !== entry.key))}
                    className="text-slate-600 hover:text-red-400 text-xs shrink-0">✕</button>
                </div>
              ))}

              <AddCustomFieldForm onAdd={(key, label, isSecret) => addCompanyField(key, label, isSecret, 'sonstiges')} />

              {/* Signaturen */}
              <section className="space-y-2 pt-2 border-t border-slate-800">
                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Signaturen</div>
                <div className="text-xs text-slate-500">
                  Nutze Platzhalter wie <code className="text-emerald-400 bg-slate-800 px-1 rounded">{'{firmen_signatur_de}'}</code> in Mails.
                </div>
                {companyData.filter(e => e.category === 'signatur').map(entry => (
                  <div key={entry.key} className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-300 font-medium">{entry.label}</span>
                      <code className="text-[10px] text-emerald-400 bg-slate-800 rounded px-1">{`{firmen_${entry.key}}`}</code>
                      <button type="button" onClick={() => setCompanyData(prev => prev.filter(d => d.key !== entry.key))}
                        className="ml-auto text-slate-600 hover:text-red-400 text-xs">✕</button>
                    </div>
                    <textarea value={entry.value} rows={3}
                      onChange={e => setCompanyData(prev => prev.map(d => d.key === entry.key ? { ...d, value: e.target.value } : d))}
                      placeholder="Mit freundlichen Grüßen&#10;Max Mustermann&#10;Gitarrenwerkstatt GmbH"
                      className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200 resize-none" />
                    {entry.value && (
                      <pre className="text-[10px] text-slate-500 bg-slate-900 rounded p-2 whitespace-pre-wrap border border-slate-800">{entry.value}</pre>
                    )}
                  </div>
                ))}
                <button type="button"
                  onClick={() => {
                    const name = prompt('Name der Signatur (z.B. "Deutsch", "Englisch"):');
                    if (!name?.trim()) return;
                    const key = `signatur_${name.toLowerCase().replace(/\s+/g, '_')}`;
                    addCompanyField(key, `Signatur (${name})`, false, 'signatur');
                  }}
                  className="w-full py-1.5 rounded border border-dashed border-slate-700 text-xs text-slate-400 hover:text-slate-200 hover:border-slate-600 transition-colors">
                  + Neue Signatur hinzufügen
                </button>
              </section>

              {/* Speichern */}
              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
                {companyDataMsg && <span className="text-xs text-emerald-400 mr-auto">{companyDataMsg}</span>}
                <button type="button" onClick={saveCompanyData} disabled={companyDataSaving}
                  className="rounded bg-violet-600 hover:bg-violet-500 px-3 py-1.5 text-xs text-white disabled:opacity-50">
                  {companyDataSaving ? 'Speichern…' : 'Speichern'}
                </button>
              </div>
            </div>
          )}

          {/* ── Ordner-Tab ── */}
          {activeTab === 'folders' && (
            <div className="p-4 space-y-4">
              <div className="text-xs text-slate-400">UI-Favoriten: Ordner die in der Sidebar hervorgehoben werden.</div>
              <div className="max-h-64 overflow-y-auto rounded border border-slate-800 bg-slate-900/40 p-2 space-y-1">
                {folders.map((folder) => {
                  const checked = (profile?.pinnedFolders || []).includes(folder.path);
                  return (
                    <label key={folder.path} className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setProfile((prev) => {
                            if (!prev) return prev;
                            const next = checked
                              ? prev.pinnedFolders.filter((f) => f !== folder.path)
                              : [...prev.pinnedFolders, folder.path];
                            return { ...prev, pinnedFolders: next };
                          });
                        }}
                      />
                      <span className="truncate">{folder.path}</span>
                    </label>
                  );
                })}
              </div>
              <div className="flex justify-end pt-2 border-t border-slate-800">
                {saveMsg && <span className="text-xs text-emerald-400 mr-auto">{saveMsg}</span>}
                <button
                  type="button"
                  onClick={saveFolderProfile}
                  disabled={saving}
                  className="rounded bg-violet-600 hover:bg-violet-500 px-3 py-1.5 text-xs text-white disabled:opacity-50"
                >
                  {saving ? 'Speichert…' : 'Speichern'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </aside>

    {/* Onboarding-Wizard Modal */}
    
    {showOnboardingWizard && account?.id && (
      <AiOnboardingWizard
        mailAccountId={account.id}
        existingAiProfile={aiProfile}
        onClose={() => setShowOnboardingWizard(false)}
        onComplete={() => {
          setShowOnboardingWizard(false);
          if (account?.id) {
            Promise.all([
              fetch(`/api/mail-accounts/${account.id}/ai-profile`).then(r => r.ok ? r.json() : null),
              fetch(`/api/mail-accounts/${account.id}/email-templates`).then(r => r.ok ? r.json() : []),
              fetch(`/api/mail-accounts/${account.id}/knowledge`).then(r => r.ok ? r.json() : []),
            ]).then(([aiData, templatesData, knowledgeData]) => {
              if (aiData) setAiProfile({ ...DEFAULT_AI_PROFILE, ...aiData });
              setEmailTemplates(templatesData || []);
              setKnowledgeEntries(knowledgeData || []);
            });
          }
        }}
      />
    )}
    </>
  );
}

function AddCustomFieldForm({ onAdd }: { onAdd: (key: string, label: string, isSecret: boolean) => void }) {
  const [show, setShow] = useState(false);
  const [label, setLabel] = useState('');
  const [key, setKey] = useState('');
  const [isSecret, setIsSecret] = useState(true);

  if (!show) {
    return (
      <button type="button" onClick={() => setShow(true)}
        className="w-full py-1.5 rounded border border-dashed border-slate-700 text-xs text-slate-400 hover:text-slate-200 hover:border-slate-600 transition-colors">
        + Weiteres Feld hinzufügen
      </button>
    );
  }

  return (
    <div className="rounded border border-slate-700 bg-slate-900/40 p-2.5 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[11px] text-slate-400">Anzeigename</label>
          <input value={label} onChange={e => { setLabel(e.target.value); setKey(e.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')); }}
            placeholder="z.B. Kontonummer"
            className="w-full mt-0.5 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200 placeholder-slate-500" />
        </div>
        <div>
          <label className="text-[11px] text-slate-400">Key (Platzhalter)</label>
          <input value={key} onChange={e => setKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
            placeholder="kontonummer"
            className="w-full mt-0.5 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs font-mono text-slate-200 placeholder-slate-500" />
        </div>
      </div>
      <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
        <input type="checkbox" checked={isSecret} onChange={e => setIsSecret(e.target.checked)} className="rounded border-slate-600" />
        🔒 Nicht an KI senden (vertraulich)
      </label>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={() => { setShow(false); setLabel(''); setKey(''); }}
          className="text-xs text-slate-400 hover:text-slate-200">Abbrechen</button>
        <button type="button" disabled={!key.trim() || !label.trim()}
          onClick={() => { onAdd(key.trim(), label.trim(), isSecret); setShow(false); setLabel(''); setKey(''); }}
          className="text-xs px-2.5 py-1 rounded bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-40">
          Hinzufügen
        </button>
      </div>
    </div>
  );
}
