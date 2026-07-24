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

export default function SuggestionBanner({ orderId }: { orderId: string }) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);

  const loadSuggestions = useCallback(async () => {
    try {
      const res = await fetch(`/api/orders/${orderId}/suggestions`);
      if (res.ok) {
        const data = await res.json();
        setSuggestions(data);
      }
    } catch { /* ignore */ }
  }, [orderId]);

  useEffect(() => {
    loadSuggestions();
    // Nach PDF-Import (CustomerDatasheetActions) sofort neu laden
    window.addEventListener('mgh:suggestions-updated', loadSuggestions);
    return () => window.removeEventListener('mgh:suggestions-updated', loadSuggestions);
  }, [loadSuggestions]);

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
      }
    } catch { /* ignore */ }
    setProcessing(null);
  };

  if (pending.length === 0) return null;

  return (
    <div className="rounded-lg border border-violet-700/50 bg-violet-950/30 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-violet-900/20 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-violet-400 text-sm">📬</span>
          <span className="text-sm text-violet-200">
            {pending.length} {pending.length === 1 ? 'Vorschlag' : 'Vorschläge'} (E-Mail / Datenblatt)
          </span>
        </div>
        <span className={`text-xs text-violet-400 transition-transform ${expanded ? 'rotate-180' : ''}`}>
          ▼
        </span>
      </button>

      {expanded && (
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
