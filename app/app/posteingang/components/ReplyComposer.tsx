"use client";

import { useCallback, useRef, useState, useEffect } from 'react';
import VoiceInputButton from '@/components/VoiceInputButton';

type Mail = { 
  id: string; 
  subject?: string | null; 
  text?: string | null; 
  fromEmail?: string | null;
  fromName?: string | null;
};

type Customer = {
  id: string;
  name: string;
  email?: string | null;
} | null;

type Order = {
  id: string;
  title?: string | null;
  customer?: {
    name: string;
  } | null;
} | null;

type CurrentUser = {
  id?: string;
  name?: string | null;
  email?: string | null;
} | undefined;

type Template = { 
  id: string; 
  key: string; 
  lang: string; 
  subject?: string | null;
  body: string; 
  variables?: string[] 
};

function renderTemplate(tpl: string, values: Record<string, string>) {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (values[k] ?? `{{${k}}}`));
}

export default function ReplyComposer({ mail, customer, order, currentUser, onSent }: { 
  mail: Mail; 
  customer?: Customer;
  order?: Order;
  currentUser?: CurrentUser;
  onSent?: () => void 
}) {
  const [subject, setSubject] = useState(mail.subject ? `Re: ${mail.subject}` : '');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showLinkHelper, setShowLinkHelper] = useState(false);
  const [linkText, setLinkText] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [optimizing, setOptimizing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Templates laden
  useEffect(() => {
    fetch('/api/inbox/templates?lang=de')
      .then(res => res.ok ? res.json() : [])
      .then(setTemplates)
      .catch(() => setTemplates([]));
  }, []);

  // Template anwenden
  const applyTemplate = useCallback((template: Template) => {
    // Einfache Kundenname-Erkennung: Nur wenn klar verfügbar
    let kundenName = '';
    if (order?.customer?.name) {
      kundenName = order.customer.name;
    } else if (customer?.name) {
      kundenName = customer.name;
    } else if (mail.fromName) {
      kundenName = mail.fromName;
    }
    
    // Benutzername aus Session (sollte immer verfügbar sein)
    const benutzerName = currentUser?.name || 'Johannes';
    
    const values = {
      kundenName: kundenName || '', // Leer lassen wenn nicht verfügbar
      benutzerName,
    };
    
    let renderedBody = renderTemplate(template.body, values);
    
    // Wenn kein Kundenname verfügbar, "Hallo {{kundenName}}" zu "Hallo" ändern
    if (!kundenName) {
      renderedBody = renderedBody.replace(/Hallo\s*{{kundenName}},?/g, 'Hallo');
      renderedBody = renderedBody.replace(/Hallo\s*,/g, 'Hallo');
    }
    
    const renderedSubject = template.subject ? renderTemplate(template.subject, values) : subject;
    
    setText(renderedBody);
    setSubject(renderedSubject);
    setSelectedTemplate(template);
    setShowTemplates(false);
  }, [customer, order, mail.fromName, currentUser, subject]);

  // Text optimieren via N8N
  const optimizeText = useCallback(async () => {
    if (!text.trim() || optimizing) return;
    
    setOptimizing(true);
    try {
      const res = await fetch('/api/compose-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text,
          customerName: customer?.name || order?.customer?.name || mail.fromName,
          orderTitle: order?.title,
          language: 'de'
        }),
      });
      
      const data = await res.json();
      
      if (data.text && !data.fallback) {
        setText(data.text);
        if (data.subject) {
          setSubject(data.subject);
        }
      } else if (data.fallback) {
        alert('N8N nicht konfiguriert. Text bleibt unverändert.');
      } else {
        alert('Fehler bei der Text-Optimierung.');
      }
    } catch (error) {
      console.error('Text optimization error:', error);
      alert('Fehler bei der Text-Optimierung.');
    } finally {
      setOptimizing(false);
    }
  }, [text, customer, order, mail.fromName, subject, optimizing]);

  // Link einfügen
  const insertLink = useCallback(() => {
    if (!linkText || !linkUrl) return;
    
    const textarea = textareaRef.current;
    if (!textarea) return;
    
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const linkMarkdown = `[${linkText}](${linkUrl})`;
    
    const newText = text.substring(0, start) + linkMarkdown + text.substring(end);
    setText(newText);
    
    // Reset Link-Helper
    setLinkText('');
    setLinkUrl('');
    setShowLinkHelper(false);
    
    // Cursor nach dem Link positionieren
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + linkMarkdown.length, start + linkMarkdown.length);
    }, 0);
  }, [linkText, linkUrl, text]);

  // Schnell-Links für häufige URLs
  const insertQuickLink = useCallback((linkText: string, url: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const linkMarkdown = `[${linkText}](${url})`;
    
    setText(prev => prev.substring(0, start) + linkMarkdown + prev.substring(end));
    
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + linkMarkdown.length, start + linkMarkdown.length);
    }, 0);
  }, []);

  const quotePrev = useCallback(() => {
    const body = (mail.text || '').split('\n').map(l => `> ${l}`).join('\n');
    setText((t) => t ? `${t}\n\n${body}` : body);
  }, [mail.text]);

  async function filesToPayload(fs: File[]): Promise<Array<{ name: string; contentType: string; content: string }>> {
    const enc = (f: File) => new Promise<{ name: string; contentType: string; content: string }>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ name: f.name, contentType: f.type, content: String(reader.result).split(',').pop() || '' });
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(f);
    });
    return Promise.all(fs.map(enc));
  }

  // Markdown zu HTML konvertieren (einfache Implementierung)
  const markdownToHtml = useCallback((markdown: string) => {
    return markdown
      // Links: [text](url) -> <a href="url">text</a>
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
      // Zeilenumbrüche
      .replace(/\n/g, '<br>');
  }, []);

  const send = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const attachments = await filesToPayload(files);
      
      // HTML-Version erstellen wenn Links vorhanden
      const hasLinks = text.includes('[') && text.includes('](');
      const html = hasLinks ? markdownToHtml(text) : undefined;
      
      const res = await fetch(`/api/mails/${mail.id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, text, html, attachments }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || res.status);
      setText('');
      setFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
      alert('Gesendet');
      onSent?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(`Fehler: ${msg}`);
    } finally { setBusy(false); }
  }, [busy, files, mail.id, subject, text, onSent, markdownToHtml]);

  return (
    <div className="rounded border border-slate-800 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Antwort verfassen</div>
        <div className="flex items-center gap-2">
          <button 
            className="text-xs text-blue-400 hover:text-blue-300" 
            onClick={() => setShowTemplates(!showTemplates)}
          >
            📧 Vorlagen
          </button>
          <button 
            className="text-xs text-green-400 hover:text-green-300" 
            onClick={() => setShowLinkHelper(!showLinkHelper)}
          >
            🔗 Link
          </button>
          <button 
            className="text-xs text-purple-400 hover:text-purple-300" 
            onClick={optimizeText}
            disabled={!text.trim() || optimizing}
          >
            {optimizing ? '⏳ Optimiere...' : '✨ Nachricht optimieren'}
          </button>
          <button className="text-xs text-slate-400 hover:text-slate-300" onClick={quotePrev}>
            Vorherige Mail zitieren
          </button>
        </div>
      </div>

      {/* Template-Auswahl */}
      {showTemplates && templates.length > 0 && (
        <div className="border border-slate-700 rounded p-2 bg-slate-900">
          <div className="text-xs text-slate-300 mb-2">Vorlage auswählen:</div>
          <div className="flex flex-wrap gap-2">
            {templates.map((template) => (
              <button
                key={template.id}
                onClick={() => applyTemplate(template)}
                className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-500 rounded text-white"
              >
                {template.key}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Link-Helper */}
      {showLinkHelper && (
        <div className="border border-slate-700 rounded p-2 bg-slate-900">
          <div className="text-xs text-slate-300 mb-2">Link einfügen:</div>
          
          {/* Schnell-Links */}
          <div className="flex flex-wrap gap-2 mb-3">
            <button
              onClick={() => insertQuickLink('Google Rezension', 'https://g.page/r/CRBvY8QZ8QZJEBM/review')}
              className="px-2 py-1 text-xs bg-green-600 hover:bg-green-500 rounded text-white"
            >
              📝 Google Rezension
            </button>
            <button
              onClick={() => insertQuickLink('Website', 'https://mgh-guitars.de')}
              className="px-2 py-1 text-xs bg-green-600 hover:bg-green-500 rounded text-white"
            >
              🌐 Website
            </button>
            <button
              onClick={() => insertQuickLink('Pickguard Shop', 'https://dein-pickguard.de')}
              className="px-2 py-1 text-xs bg-green-600 hover:bg-green-500 rounded text-white"
            >
              🎸 Pickguard Shop
            </button>
          </div>
          
          {/* Eigener Link */}
          <div className="grid grid-cols-2 gap-2">
            <input
              className="rounded bg-slate-950 border border-slate-700 px-2 py-1 text-xs"
              placeholder="Link-Text"
              value={linkText}
              onChange={(e) => setLinkText(e.target.value)}
            />
            <input
              className="rounded bg-slate-950 border border-slate-700 px-2 py-1 text-xs"
              placeholder="URL (https://...)"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
            />
          </div>
          <div className="flex gap-2 mt-2">
            <button
              onClick={insertLink}
              disabled={!linkText || !linkUrl}
              className="px-2 py-1 text-xs bg-green-600 hover:bg-green-500 disabled:bg-slate-600 rounded text-white"
            >
              Link einfügen
            </button>
            <button
              onClick={() => setShowLinkHelper(false)}
              className="px-2 py-1 text-xs bg-slate-600 hover:bg-slate-500 rounded text-white"
            >
              Schließen
            </button>
          </div>
        </div>
      )}

      <input 
        className="w-full rounded bg-slate-950 border border-slate-700 px-2 py-1 text-sm" 
        placeholder="Betreff" 
        value={subject} 
        onChange={(e)=>setSubject(e.target.value)} 
        aria-label="Betreff" 
      />
      <textarea
        ref={textareaRef}
        className="w-full rounded bg-slate-950 border border-slate-700 px-2 py-2 text-sm"
        rows={6}
        placeholder="Nachricht (Links: [Text](URL))"
        value={text}
        onChange={(e)=>setText(e.target.value)}
        onKeyDown={(e)=>{
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); void send(); }
        }}
        aria-label="Nachricht"
      />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <input ref={fileInputRef} type="file" multiple className="text-xs" onChange={(e)=> setFiles(Array.from(e.target.files || []))} />
          <VoiceInputButton
            onTranscript={(transcript) => {
              setText((prev) => {
                const separator = prev.trim() ? '\n' : '';
                return prev + separator + transcript;
              });
            }}
            language="de"
            disabled={busy}
          />
        </div>
        <button disabled={busy || !subject || !text} onClick={()=>void send()} className="rounded bg-sky-600 hover:bg-sky-500 px-3 py-1.5 text-xs font-medium">
          Antwort senden
        </button>
      </div>
    </div>
  );
}


