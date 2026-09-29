'use client';

import { useState, useEffect, useCallback } from 'react';
import { FIELD_LABELS as SPEC_FIELD_LABELS } from '@/lib/order-presets';

interface Suggestion {
  id: string;
  orderId: string;
  field: string;
  value: string;
  mailId: string | null;
  status: string;
  acceptedBy: string | null;
  acceptedAt: string | null;
  createdAt: string;
}

const FIELD_LABELS: Record<string, string> = {
  'customer.email': 'Kunden-E-Mail',
  'customer.phone': 'Telefonnummer',
  'customer.name': 'Kundenname',
  'customer.addressLine1': 'Straße',
  'customer.postalCode': 'PLZ',
  'customer.city': 'Stadt',
  'customer.country': 'Land',
  'order.iban': 'IBAN',
  'order.type': 'Auftragstyp',
};

function labelFor(field: string): string {
  if (FIELD_LABELS[field]) return FIELD_LABELS[field];
  if (field.startsWith('order.')) {
    const key = field.slice('order.'.length);
    if (SPEC_FIELD_LABELS[key]) return SPEC_FIELD_LABELS[key];
  }
  return field;
}

// Vorschlaege der lokalen Mail-Analyse (lib/mail-ai/decisions.ts).
interface MailSuggestion {
  mailId: string; annotationId: string; revision: number; sourceHash: string;
  field: string; value: string; intent: Intent; currentValue: string;
  // Listenwert, der statt des Mailworts eingetragen wird, und Notiz fuer den Rest (lib/spec-options/match.ts).
  target?: string; note?: string;
  snippet: { before: string; match: string; after: string }; mailDate: string; mailSubject: string;
}
type Intent = 'confirmed' | 'question' | 'change' | 'rejected' | 'unclear';
const INTENT_LABELS: Record<Intent, string> = {
  confirmed: 'Wunsch', change: 'Änderung', question: 'Frage', rejected: 'Nicht gewünscht', unclear: 'Unklar',
};
const INTENT_STYLES: Record<Intent, string> = {
  confirmed: 'border-emerald-700 text-emerald-300', change: 'border-sky-700 text-sky-300',
  question: 'border-amber-700 text-amber-300', rejected: 'border-rose-800 text-rose-300', unclear: 'border-slate-600 text-slate-300',
};
const applies = (intent: Intent) => intent === 'confirmed' || intent === 'change';

export function MailSuggestionRow({ orderId, item, fields, current, onDone }: {
  orderId: string; item: MailSuggestion; fields: { key: string; label: string }[]; current: Record<string, string>;
  onDone: (applied: boolean) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [field, setField] = useState(item.field);
  const [value, setValue] = useState(item.value);
  const [intent, setIntent] = useState<Intent>(item.intent);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const label = fields.find((f) => f.key === item.field)?.label || SPEC_FIELD_LABELS[item.field] || item.field;
  const shown = item.target || item.value;

  const decide = async (action: 'accept' | 'acknowledge' | 'reject', edits?: { field: string; value: string; intent: Intent; current: string }) => {
    setBusy(true); setError('');
    try {
      const res = await fetch(`/api/orders/${orderId}/mail-suggestions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mailId: item.mailId, annotationId: item.annotationId, revision: item.revision, sourceHash: item.sourceHash,
          action, expectedValue: edits ? edits.current : item.currentValue,
          ...(edits ? { field: edits.field, value: edits.value, intent: edits.intent } : {}) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Speichern fehlgeschlagen.');
      onDone(!!data.applied);
    } catch (e) { setError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen.'); }
    finally { setBusy(false); }
  };

  const button = 'px-2 py-1 rounded text-xs border disabled:opacity-50 transition-colors';
  return (
    <div className="px-3 py-2 space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-violet-400">{label}</span>
        <span className={`rounded border px-1.5 text-[11px] ${INTENT_STYLES[item.intent]}`}>{INTENT_LABELS[item.intent]}</span>
        <span className="text-sm text-slate-200">
          {applies(item.intent) && item.currentValue && item.currentValue !== shown
            ? <><span className="text-slate-500 line-through">{item.currentValue}</span> → <strong>{shown}</strong></>
            : <strong>{shown}</strong>}
        </span>
        {item.target && <span className="text-xs text-slate-500" title="Eingetragen wird der Wert aus der Auswahlliste des Datenblatts">aus „{item.value}“</span>}
      </div>
      {item.note && <p className="text-xs text-slate-400">+ Notiz: „{item.note}“</p>}
      <p className="text-xs text-slate-400">
        „{item.snippet.before}<mark className="bg-violet-800/60 text-slate-100 rounded px-0.5">{item.snippet.match}</mark>{item.snippet.after}“
        <span className="text-slate-500"> · Mail vom {new Date(item.mailDate).toLocaleDateString('de-DE')}</span>
      </p>
      {editing ? (
        <div className="flex flex-wrap items-end gap-2">
          <select aria-label="Feld" value={field} onChange={(e) => setField(e.target.value)} className="rounded border border-slate-600 bg-slate-950 px-1.5 py-1 text-xs">
            {fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
          <input aria-label="Wert" value={value} onChange={(e) => setValue(e.target.value)} className="min-w-[10rem] flex-1 rounded border border-slate-600 bg-slate-950 px-1.5 py-1 text-xs" />
          <select aria-label="Aussage" value={intent} onChange={(e) => setIntent(e.target.value as Intent)} className="rounded border border-slate-600 bg-slate-950 px-1.5 py-1 text-xs">
            {(Object.keys(INTENT_LABELS) as Intent[]).map((k) => <option key={k} value={k}>{INTENT_LABELS[k]}</option>)}
          </select>
          <button disabled={busy || !value.trim()} className={`${button} border-emerald-700 bg-emerald-900/30 text-emerald-300`}
            onClick={() => decide('accept', { field, value: value.trim(), intent, current: current[field] || '' })}>
            {applies(intent) ? 'Speichern & übernehmen' : 'Speichern'}
          </button>
          <button disabled={busy} className={`${button} border-slate-600 text-slate-300`} onClick={() => setEditing(false)}>Abbrechen</button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {applies(item.intent)
            ? <button disabled={busy} onClick={() => decide('accept')} className={`${button} border-emerald-700 bg-emerald-900/30 text-emerald-300 hover:bg-emerald-800/40`}>✓ Übernehmen</button>
            : <button disabled={busy} onClick={() => decide('acknowledge')} className={`${button} border-slate-600 text-slate-200 hover:bg-slate-800`}>✓ Erledigt</button>}
          <button disabled={busy} onClick={() => setEditing(true)} className={`${button} border-sky-700 text-sky-300 hover:bg-sky-900/30`}>✎ Ändern</button>
          <button disabled={busy} onClick={() => decide('reject')} className={`${button} border-rose-700 bg-rose-900/30 text-rose-300 hover:bg-rose-800/40`}>✕ Falsch erkannt</button>
        </div>
      )}
      {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
    </div>
  );
}

export default function SuggestionBanner({ orderId }: { orderId: string }) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [mailData, setMailData] = useState<{ fields: { key: string; label: string }[]; current: Record<string, string>; items: MailSuggestion[]; analyzing: boolean }>({ fields: [], current: {}, items: [], analyzing: false });
  // null = noch nicht angefasst: KI-Vorschlaege aus Mails klappen von selbst auf.
  const [expandedChoice, setExpanded] = useState<boolean | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMessage, setBulkMessage] = useState('');

  const loadSuggestions = useCallback(async () => {
    try {
      const [res, mailRes] = await Promise.all([
        fetch(`/api/orders/${orderId}/suggestions`),
        fetch(`/api/orders/${orderId}/mail-suggestions`, { cache: 'no-store' }),
      ]);
      if (res.ok) {
        const data = await res.json();
        setSuggestions(data);
      }
      if (mailRes.ok) setMailData(await mailRes.json());
    } catch { /* ignore */ }
  }, [orderId]);

  useEffect(() => {
    loadSuggestions();
    // Nach PDF-Import (CustomerDatasheetActions) sofort neu laden
    window.addEventListener('mgh:suggestions-updated', loadSuggestions);
    return () => window.removeEventListener('mgh:suggestions-updated', loadSuggestions);
  }, [loadSuggestions]);

  // Solange die lokale KI Mails dieses Auftrags liest, regelmaessig nachsehen.
  useEffect(() => {
    if (!mailData.analyzing) return;
    const timer = setTimeout(() => { void loadSuggestions(); }, 10_000);
    return () => clearTimeout(timer);
  }, [mailData, loadSuggestions]);

  const pending = suggestions.filter((s) => s.status === 'suggested');

  const handleAction = async (suggestionId: string, action: 'accept' | 'reject') => {
    setProcessing(suggestionId);
    try {
      const res = await fetch(`/api/orders/${orderId}/suggestions`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suggestionId, action }),
      });
      if (res.ok) {
        const updated = await res.json();
        setSuggestions(updated);
        if (action === 'accept') {
          // Formulare, die den Auftrag anzeigen, muessen den neuen Wert nachladen.
          window.dispatchEvent(new CustomEvent('mgh:suggestions-applied'));
        }
      }
    } catch { /* ignore */ }
    setProcessing(null);
  };

  const total = pending.length + mailData.items.length;
  const expanded = expandedChoice ?? mailData.items.length > 0;
  if (total === 0 && !mailData.analyzing) {
    // Nach "Alle uebernehmen" ist die Liste leer; die Bestaetigung soll trotzdem zu sehen sein.
    return bulkMessage
      ? <p role="status" className="rounded-lg border border-emerald-800/50 bg-emerald-950/20 px-3 py-2 text-sm text-emerald-300">✓ {bulkMessage}</p>
      : null;
  }
  if (total === 0) {
    return (
      <div role="status" className="rounded-lg border border-violet-700/40 bg-violet-950/20 px-3 py-2 text-sm text-violet-300">
        🔍 Die Mails zu diesem Auftrag werden gerade lokal ausgewertet. Vorschläge erscheinen gleich hier.
      </div>
    );
  }

  const afterMailDecision = (applied: boolean) => {
    void loadSuggestions();
    if (applied) window.dispatchEvent(new CustomEvent('mgh:suggestions-applied'));
  };

  // "Alle Wuensche uebernehmen": nur Wunsch/Aenderung, und nur Felder mit genau
  // einem offenen Vorschlag. Widerspruechliche Vorschlaege bleiben zur Einzelentscheidung.
  const applicable = mailData.items.filter((i) => applies(i.intent));
  const perField = applicable.reduce<Record<string, number>>((n, i) => ({ ...n, [i.field]: (n[i.field] || 0) + 1 }), {});
  const bulkItems = applicable.filter((i) => perField[i.field] === 1);
  const acceptAll = async () => {
    setBulkBusy(true); setBulkMessage('');
    try {
      const res = await fetch(`/api/orders/${orderId}/mail-suggestions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'accept-all', items: bulkItems.map((i) => ({
          mailId: i.mailId, annotationId: i.annotationId, revision: i.revision, sourceHash: i.sourceHash, expectedValue: i.currentValue })) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Übernehmen fehlgeschlagen.');
      setBulkMessage(data.failed ? `${data.applied} übernommen, ${data.failed} bitte einzeln prüfen.` : `${data.applied} übernommen.`);
      afterMailDecision(data.applied > 0);
    } catch (e) { setBulkMessage(e instanceof Error ? e.message : 'Übernehmen fehlgeschlagen.'); }
    finally { setBulkBusy(false); }
  };

  return (
    <div className="rounded-lg border border-violet-700/50 bg-violet-950/30 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-violet-900/20 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-violet-400 text-sm">📬</span>
          <span className="text-sm text-violet-200">
            {total} {total === 1 ? 'Vorschlag' : 'Vorschläge'} (E-Mail / Datenblatt)
            {mailData.analyzing && <span className="text-violet-400"> · weitere Mails werden ausgewertet …</span>}
          </span>
        </div>
        <span className={`text-xs text-violet-400 transition-transform ${expanded ? 'rotate-180' : ''}`}>
          ▼
        </span>
      </button>

      {expanded && mailData.items.length > 0 && (
        <div className="border-t border-violet-800/50">
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 pt-2">
            <p className="text-[11px] uppercase tracking-wide text-violet-400">Aus Mails erkannt · lokal geprüft</p>
            {bulkItems.length >= 2 && (
              <button type="button" disabled={bulkBusy} onClick={acceptAll}
                className="px-2 py-1 rounded text-xs border border-emerald-700 bg-emerald-900/30 text-emerald-300 hover:bg-emerald-800/40 disabled:opacity-50">
                {bulkBusy ? 'Übernimmt …' : `✓ Alle Wünsche übernehmen (${bulkItems.length})`}
              </button>
            )}
          </div>
          {bulkMessage && <p role="status" className="px-3 pt-1 text-xs text-slate-300">{bulkMessage}</p>}
          <div className="divide-y divide-violet-800/30">
            {mailData.items.map((item) => (
              <MailSuggestionRow key={`${item.mailId}:${item.annotationId}`} orderId={orderId} item={item} fields={mailData.fields} current={mailData.current} onDone={afterMailDecision} />
            ))}
          </div>
        </div>
      )}

      {expanded && pending.length > 0 && (
        <div className="border-t border-violet-800/50 divide-y divide-violet-800/30">
          {pending.map((s) => (
            <div key={s.id} className="px-3 py-2 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-violet-400">{labelFor(s.field)}</p>
                <p className="text-sm text-slate-200 truncate">{s.value}</p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  onClick={() => handleAction(s.id, 'accept')}
                  disabled={processing === s.id}
                  className="px-2 py-1 rounded text-xs border border-emerald-700 bg-emerald-900/30 text-emerald-300 hover:bg-emerald-800/40 disabled:opacity-50 transition-colors"
                >
                  {processing === s.id ? '...' : '✓'}
                </button>
                <button
                  onClick={() => handleAction(s.id, 'reject')}
                  disabled={processing === s.id}
                  className="px-2 py-1 rounded text-xs border border-rose-700 bg-rose-900/30 text-rose-300 hover:bg-rose-800/40 disabled:opacity-50 transition-colors"
                >
                  {processing === s.id ? '...' : '✕'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
