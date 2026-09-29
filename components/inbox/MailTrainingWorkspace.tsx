'use client';

import { useMemo, useRef, useState } from 'react';
import { INTENTS, PRIVACY_FIELDS, REASONS, type Annotation, type TrainingData } from '@/lib/mail-training/contracts';
import { highlightSegments } from '@/lib/mail-training/highlight';
import { CONTACT_LABELS, type ContactField } from '@/lib/mail/contact-fields';

type Action = Record<string, unknown>;
export type TrainingMutation = (body: Action) => Promise<TrainingData | { annotations: Annotation[]; context?: TrainingData['context'] }>;
const control = 'w-full rounded border border-slate-600 bg-slate-950 px-2 py-1.5 text-sm text-slate-100';
const button = 'rounded border border-slate-600 px-3 py-1.5 text-xs text-slate-100 hover:bg-slate-700 disabled:opacity-40';
const ORIGINS = { rules: 'Regelerkennung', model: 'Lokales Modell', example: 'Geprüftes Beispiel', manual: 'Manuell markiert' };

export default function MailTrainingWorkspace({ data, onChange, mutate, reload }: {
  data: TrainingData; onChange: (data: TrainingData) => void; mutate: TrainingMutation; reload: () => Promise<void>;
}) {
  const [selected, setSelected] = useState<Annotation | null>(null);
  const [original, setOriginal] = useState<Annotation | null>(null);
  const [reason, setReason] = useState<keyof typeof REASONS>('correct');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [filter, setFilter] = useState<'all' | 'privacy' | 'order'>('all');
  const [preview, setPreview] = useState(false);
  const [confirmApply, setConfirmApply] = useState(false);
  const [selection, setSelection] = useState<{ start: number; end: number; text: string } | null>(null);
  const textRef = useRef<HTMLPreElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const annotations = data.annotations.filter(a => filter === 'all' || a.kind === filter);
  const chunks = useMemo(() => highlightSegments(data.plaintext, data.annotations), [data.plaintext, data.annotations]);
  const label = (a: Annotation) => a.kind === 'privacy' ? PRIVACY_FIELDS[a.field] : data.fields.find(f => f.key === a.field)?.label || a.field;

  function choose(a: Annotation, scroll = true) {
    if (busy) return;
    setSelected({ ...a }); setOriginal({ ...a }); setReason(a.reviewed ? a.reason || 'correct' : 'correct');
    setConfirmApply(false); setError(''); setMessage('');
    if (scroll) editorRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function captureSelection() {
    if (busy) return;
    const selection = window.getSelection();
    const root = textRef.current;
    if (!selection?.rangeCount || selection.isCollapsed || !root || preview) return;
    const range = selection.getRangeAt(0);
    if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return;
    const prefix = range.cloneRange(); prefix.selectNodeContents(root); prefix.setEnd(range.startContainer, range.startOffset);
    const raw = range.toString(); const text = raw.trim();
    if (!text || text.length > 1000) return;
    const start = prefix.toString().length + raw.indexOf(text);
    setSelection({ start, end: start + text.length, text });
  }
  function add(kind: Annotation['kind']) {
    if (!selection) return;
    const a: Annotation = { ...selection, id: crypto.randomUUID(), kind, field: kind === 'privacy' ? 'name' : data.fields[0]?.key || '',
      value: selection.text, intent: 'unclear', masked: kind === 'privacy', dismissed: false, reviewed: false, origin: 'manual' };
    setSelected(a); setOriginal(null); setReason('missed'); setSelection(null); setConfirmApply(false); setMessage(''); setError('');
    window.getSelection()?.removeAllRanges();
  }
  async function run(action: Action) {
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await mutate({ revision: data.revision, sourceHash: data.sourceHash, orderId: data.orderId, ...action });
      if ('mailId' in result) {
        onChange(result);
        if (selected) {
          const saved = result.annotations.find(a => a.id === selected.id);
          setSelected(saved || null); setOriginal(saved || null);
        }
        setMessage(action.action === 'apply' ? 'Auftrag aktualisiert. Alter und neuer Wert stehen im Verlauf.'
          : action.action === 'model' ? 'Modellvorschläge geladen. Bitte einzeln prüfen.' : 'Korrektur lokal gespeichert.');
      } else {
        const reviewed = data.annotations.filter(a => a.reviewed || a.origin === 'example');
        const additions = result.annotations.filter(a => !reviewed.some(r => r.id === a.id || (r.kind === a.kind && r.field === a.field && r.start === a.start)));
        const ids = new Set(additions.map(a => a.id));
        onChange({ ...data, context: result.context, annotations: [...data.annotations.filter(a => !ids.has(a.id) && (a.origin !== 'model' || a.reviewed)), ...additions] });
        setSelected(null); setOriginal(null); setMessage('Modellvorschläge geladen. Bitte einzeln prüfen.');
      }
      setConfirmApply(false);
    } catch (e) { setError(e instanceof Error ? e.message : 'Aktion fehlgeschlagen.'); }
    finally { setBusy(false); }
  }
  const dirty = selected && JSON.stringify(selected) !== JSON.stringify(original);
  const applicable = selected?.kind === 'order' && selected.reviewed && !selected.dismissed && ['confirmed', 'change'].includes(selected.intent) && !dirty;
  const applied = selected && data.history.some(e => e.action === 'apply' && e.annotationId === selected.id && (e.sourceValue ?? e.newValue) === selected.value && e.orderId === data.orderId);
  const maskedRanges = data.annotations.filter(a => a.kind === 'privacy' && a.masked && !a.dismissed && (a.reviewed || a.origin !== 'example'));
  const describe = (a: Annotation) => `${label(a)}: ${a.value} (${a.dismissed ? 'verworfen' : a.kind === 'privacy' ? a.masked ? 'zensieren' : 'freigeben' : INTENTS[a.intent]})`;

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h3 className="font-semibold text-slate-100">Mail gemeinsam prüfen</h3>
        <p className="text-xs text-slate-400">{data.annotations.filter(a => a.reviewed).length} geprüft · {data.exampleCount} lokale Beispiele im selben Postfach</p></div>
      <div className="flex gap-2"><button className={button} disabled={busy} onClick={async () => { setBusy(true); setError(''); try { await reload(); setSelected(null); setOriginal(null); } catch { setError('Neu laden fehlgeschlagen.'); } finally { setBusy(false); } }}>Neu laden</button>
        {data.modelEnabled && data.orderId && <button className={button} disabled={busy} onClick={() => run({ action: 'model' })}>Lokales Modell prüfen</button>}</div>
    </div>
    <p className="text-xs text-slate-400">Korrekturen bleiben intern. Lernfälle und lokale Modelle verwaltest du im Adminbereich KI-Training. Modellgewichte werden hier nicht verändert.</p>
    {data.context && <details className="rounded border border-slate-700 p-3 text-xs"><summary className="cursor-pointer text-sky-300">Gesprächsverlauf für diese Auswertung ({data.context.messages.length} Mails)</summary><div className="mt-2 space-y-3">{data.context.messages.map(m => <div key={m.id}><p className="text-slate-400">{m.role === 'staff' ? 'MGH' : m.role === 'customer' ? 'Kunde' : 'Unklar'} · {new Date(m.date).toLocaleString('de-DE')}{m.id === data.mailId ? ' · aktuell' : ''}</p><pre className="whitespace-pre-wrap break-words font-sans text-slate-200">{m.text}</pre></div>)}{data.context.omitted > 0 && <p className="text-amber-200">Mindestens {data.context.omitted} ältere Mails liegen außerhalb dieses Ausschnitts.</p>}</div></details>}
    {data.notice && <p className="text-sm text-amber-200">{data.notice}</p>}
    {!data.orderId && <p className="text-sm text-amber-200">Für Auftragsfelder bitte zuerst einen Auftrag zuordnen. Datenschutzstellen kannst du bereits prüfen.</p>}
    {error && <p role="alert" className="rounded border border-rose-700 p-2 text-sm text-rose-200">{error}</p>}
    <p role="status" className="text-sm text-emerald-300">{busy ? 'Wird verarbeitet …' : message}</p>
    <div className="flex flex-wrap gap-3 text-xs"><span className="text-violet-300">● Datenschutz / Zensierung</span><span className="text-cyan-300">● Auftragsfeld</span><span className="text-amber-300">● Frage / unklar / Änderung</span></div>
    <div className="grid gap-4 xl:grid-cols-2">
      <div className="min-w-0 space-y-2">
        <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={preview} onChange={e => setPreview(e.target.checked)} />Zensierungsvorschau der Markierungen</label>
        {preview && <p className="text-xs text-amber-200">Zeigt die markierten Bereiche. Zusätzlicher KI-Kontext und unerkannte Angaben sind hier nicht geprüft.</p>}
        <pre ref={textRef} tabIndex={0} aria-label="Mailtext mit Markierungen" onMouseUp={captureSelection} onKeyUp={captureSelection}
          className="max-h-[32rem] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-700 bg-slate-950 p-3 font-sans text-sm leading-7 text-slate-200">
          {chunks.map(chunk => {
            const marks = data.annotations.filter(a => chunk.ids.includes(a.id));
            const visible = marks.filter(a => filter === 'all' || a.kind === filter);
            const active = marks.some(a => a.id === selected?.id);
            const privacy = visible.some(a => a.kind === 'privacy' && a.masked);
            const uncertain = visible.some(a => a.kind === 'order' && a.intent !== 'confirmed');
            const masked = maskedRanges.find(a => a.start <= chunk.start && a.end >= chunk.end);
            const className = active ? 'bg-sky-700 text-white underline decoration-2' : privacy ? 'bg-violet-500/20 text-violet-200 underline decoration-violet-400' : uncertain ? 'bg-amber-500/15 text-amber-200 underline decoration-amber-400' : visible.length ? 'bg-cyan-500/15 text-cyan-200 underline decoration-cyan-400' : '';
            return <span key={chunk.start} className={className} role={visible.length ? 'button' : undefined} tabIndex={visible.length ? 0 : undefined}
              title={visible.map(a => `${label(a)}: ${a.kind === 'privacy' ? (a.masked ? 'zensieren' : 'nicht zensieren') : INTENTS[a.intent]}`).join(' · ')}
              onClick={() => { if (!window.getSelection()?.isCollapsed) return; if (visible[0]) choose(visible[0]); }}
              onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && visible[0]) { e.preventDefault(); choose(visible[0]); } }}>
              {preview && masked ? `[${PRIVACY_FIELDS[masked.field]}]` : data.plaintext.slice(chunk.start, chunk.end)}
            </span>;
          })}
        </pre>
        <p className="text-xs text-slate-400">Text mit Maus oder Tastatur auswählen, um eine übersehene Stelle zu markieren. Markierungen anklicken, um sie zu prüfen.</p>
        {selection && !preview && <div className="rounded border border-slate-600 p-2 space-y-2"><p className="break-words text-xs text-slate-200">Ausgewählt: „{selection.text}“</p>
          <div className="flex gap-2"><button className={button} disabled={busy} onClick={() => add('privacy')}>Als Datenschutzstelle</button>
            <button className={button} disabled={busy || !data.fields.length} onClick={() => add('order')}>Als Auftragsfeld</button></div></div>}
        <div className="flex flex-wrap gap-2" aria-label="Markierungen filtern">{(['all', 'privacy', 'order'] as const).map(f => <button key={f} aria-pressed={filter === f} className={`${button} ${filter === f ? 'bg-slate-700' : ''}`} onClick={() => setFilter(f)}>{f === 'all' ? 'Alle' : f === 'privacy' ? 'Datenschutz' : 'Auftrag'}</button>)}</div>
        <div className="max-h-64 space-y-1 overflow-auto">{annotations.map(a => <button key={a.id} onClick={() => choose(a)} className={`block w-full rounded border p-2 text-left text-xs ${selected?.id === a.id ? 'border-sky-400 bg-sky-950' : 'border-slate-700 bg-slate-900'}`}>
          <span className={a.kind === 'privacy' ? 'text-violet-300' : 'text-cyan-300'}>{label(a)}</span><span className="text-slate-200"> · {a.text}</span>
          <span className="mt-1 block text-slate-400">{a.dismissed ? 'Verworfen' : a.kind === 'privacy' ? a.masked ? a.origin === 'example' && !a.reviewed ? 'Zensierung vorgeschlagen' : 'Wird zensiert' : 'Nicht zensieren' : INTENTS[a.intent]} · {a.reviewed ? '✓ Geprüft' : ORIGINS[a.origin]}</span>
        </button>)}</div>
      </div>
      <div ref={editorRef} className="min-w-0 rounded-lg border border-slate-700 bg-slate-900/70 p-3">
        {!selected ? <div className="space-y-2 py-8 text-sm text-slate-400"><p>Wähle eine Markierung im Mailtext oder in der Liste.</p><p>Mehrere Vorschläge an derselben Stelle können unterschiedliche Felder betreffen. Prüfe jeden einzeln.</p></div> : <div className="space-y-3">
          <h4 className="font-medium text-slate-100">{selected.kind === 'privacy' ? 'Datenschutzstelle prüfen' : 'Auftragsangabe prüfen'}</h4>
          <blockquote className="break-words border-l-2 border-sky-500 pl-2 text-sm text-slate-300">{selected.text}</blockquote>
          {selected.evidence?.map((e, i) => <p key={i} className="break-words text-xs text-sky-200">Gesprächsbeleg: „{e.quote}“</p>)}
          <p className="text-xs text-slate-400">{ORIGINS[selected.origin]}{selected.modelRevision ? ` · ${selected.modelRevision.slice(0, 12)}` : ''}</p>
          <label className="block text-xs text-slate-300">{selected.kind === 'privacy' ? 'Datenschutzkategorie' : 'Auftragsfeld'}
            <select aria-label={selected.kind === 'privacy' ? 'Datenschutzkategorie' : 'Auftragsfeld'} className={control} value={selected.field} disabled={busy} onChange={e => { setSelected({ ...selected, field: e.target.value }); setReason('field'); setConfirmApply(false); }}>
              {(selected.kind === 'privacy' ? Object.entries(PRIVACY_FIELDS).map(([key, label]) => ({ key, label })) : data.fields).map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select></label>
          {selected.kind === 'privacy' ? <label className="flex items-center gap-2 text-sm text-slate-200"><input type="checkbox" checked={selected.masked} disabled={busy} onChange={e => { setSelected({ ...selected, masked: e.target.checked }); setReason('privacy'); }} />Bei externen KI-Anfragen zensieren</label> : <>
            <label className="block text-xs text-slate-300">Erkannter Wert<input aria-label="Erkannter Wert" className={control} value={selected.value} disabled={busy} onChange={e => { setSelected({ ...selected, value: e.target.value }); setReason('value'); setConfirmApply(false); }} /></label>
            <label className="block text-xs text-slate-300">Aussage des Kunden<select aria-label="Aussage des Kunden" className={control} value={selected.intent} disabled={busy} onChange={e => { setSelected({ ...selected, intent: e.target.value as Annotation['intent'] }); setReason('intent'); setConfirmApply(false); }}>{Object.entries(INTENTS).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label>
            <div className="rounded border border-slate-700 p-2 text-sm"><p className="text-slate-400">Im Auftrag: <strong className="text-slate-100">{data.currentValues[selected.field] || 'Noch leer'}</strong></p><p className="text-cyan-200">Vorschlag: {selected.value || '—'}</p>
              {data.currentValues[selected.field] && data.currentValues[selected.field] !== selected.value && <p className="mt-1 text-xs text-amber-200">Abweichung: Bestehender Wert würde ersetzt. Bitte prüfen, ob der Kunde eine Änderung beauftragt.</p>}</div>
          </>}
          <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={selected.dismissed} disabled={busy} onChange={e => { setSelected({ ...selected, dismissed: e.target.checked }); setReason(selected.kind === 'privacy' ? 'privacy' : 'field'); setConfirmApply(false); }} />Erkennung verwerfen</label>
          <label className="block text-xs text-slate-300">Feedback für dieses Beispiel<select aria-label="Feedback für dieses Beispiel" className={control} value={reason} disabled={busy} onChange={e => setReason(e.target.value as keyof typeof REASONS)}>{Object.entries(REASONS).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label>
          <button className={`${button} border-sky-600 bg-sky-900/40`} disabled={busy} onClick={() => run({ action: 'review', annotation: selected, previous: original || undefined, reason })}>Korrektur / Bestätigung speichern</button>
          {selected.kind === 'privacy' && <p className="text-xs text-slate-400">Speichern aktualisiert die Zensierung dieser Mail. Freigaben werden nicht automatisch auf andere Mails übertragen.</p>}
          {selected.kind === 'order' && <div className="border-t border-slate-700 pt-3 space-y-2"><p className="text-xs text-slate-400">Das Feedback ändert den Auftrag erst nach separater Bestätigung.</p>
            <button className={button} disabled={busy || !applicable || !!applied} onClick={() => setConfirmApply(true)}>{applied ? 'Bereits übernommen' : 'Auftragsänderung prüfen'}</button>
            {confirmApply && <div role="group" aria-label="Auftragsänderung bestätigen" className="rounded border border-amber-600 p-3 space-y-2"><p className="text-sm text-amber-100">{label(selected)}: „{data.currentValues[selected.field] || 'Leer'}“ → „{selected.value}“</p>
              <p className="text-xs text-slate-300">Soll dieser Wert jetzt im Auftrag {data.orderId} gespeichert werden?</p><div className="flex gap-2"><button className={button} disabled={busy} onClick={() => run({ action: 'apply', annotationId: selected.id, expectedValue: data.currentValues[selected.field] || '' })}>Jetzt übernehmen</button><button className={button} onClick={() => setConfirmApply(false)}>Abbrechen</button></div></div>}
          </div>}
        </div>}
      </div>
    </div>
    <details className="rounded border border-slate-700 p-3 text-xs text-slate-300"><summary className="cursor-pointer">Prüfverlauf ({data.history.length})</summary><div className="mt-2 space-y-2">{[...data.history].reverse().map((e, i) => <div key={i} className="border-b border-slate-800 pb-2"><p>{new Date(e.at).toLocaleString('de-DE')} · {e.action === 'apply' ? 'Auftrag geändert' : e.action === 'contact' ? 'Kontaktdaten bestätigt' : REASONS[e.reason as keyof typeof REASONS] || 'Prüfung'}</p><p className="break-words">{e.action === 'apply' ? `${data.fields.find(f => f.key === e.field)?.label || e.field}: ${e.oldValue || 'Leer'} → ${e.newValue}` : e.action === 'contact' ? `${CONTACT_LABELS[e.field as ContactField] || e.field}: ${e.oldValue || 'nicht erkannt'} → ${e.newValue || 'entfernt'}` : `${e.before ? describe(e.before) : 'Neue Markierung'} → ${e.after ? describe(e.after) : ''}`}</p></div>)}</div></details>
  </div>;
}
