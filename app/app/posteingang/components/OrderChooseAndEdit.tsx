"use client";

import { useState, useEffect } from 'react';
import InlineSpecEditor from '../InlineSpecEditor';

type Candidate = { 
  id: string; 
  title: string; 
  assignee?: { 
    id: string; 
    name: string; 
  } | null; 
};
type OrderTypeSuggestion = { key: string; score: number; reasons?: string[] };
type SpecSuggestion = { field: string; value: string };

export default function OrderChooseAndEdit({
  mail,
  initialOrderId,
  candidates,
  suggestedOrderTypes = [],
  specSuggestions = [],
}: {
  mail: { id: string; subject?: string | null; attachments?: Array<{ id: string; filename: string; mimeType: string | null }> };
  initialOrderId?: string | null;
  candidates: Candidate[];
  suggestedOrderTypes?: OrderTypeSuggestion[];
  specSuggestions?: SpecSuggestion[];
}) {
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(initialOrderId || null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    setSelectedOrderId(initialOrderId || null);
  }, [initialOrderId]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  async function persistAssignment(orderId: string | null) {
    try {
      const res = await fetch(`/api/mails/${mail.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      });
      if (!res.ok) throw new Error('Fehler');
      setToast(orderId ? `Mail zu ${orderId} zugeordnet` : 'Zuordnung aufgehoben');
    } catch {
      setToast('Fehler beim Speichern der Zuordnung');
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <label className="text-sm text-slate-300">Bearbeiten: Auftrag</label>
        <select
          className="rounded-lg bg-slate-900 border border-slate-700 text-slate-200 px-2 py-1"
          value={selectedOrderId || ''}
          onChange={(e) => {
            const val = e.target.value || null;
            setSelectedOrderId(val);
            persistAssignment(val);
          }}
        >
          <option value="">Neu</option>
          {candidates.map((o) => (
            <option key={o.id} value={o.id}>
              {o.id} {o.title ? `– ${o.title}` : ''}{o.assignee ? ` (${o.assignee.name})` : ''}
            </option>
          ))}
        </select>
        <button
          className="px-2 py-1 rounded-lg border border-slate-700 hover:bg-slate-800"
          onClick={() => {
            setSelectedOrderId(null);
            persistAssignment(null);
          }}
        >
          Neu
        </button>
        {toast && <span className="text-xs text-slate-400">{toast}</span>}
      </div>

      <InlineSpecEditor
        mail={mail}
        orderId={selectedOrderId}
        initialOrderType={suggestedOrderTypes?.[0]?.key}
        suggestions={specSuggestions.map(s => ({ field: s.field, value: String(s.value), sourceMailId: mail.id, sourceLabel: 'Mail', confidence: 0.9 }))}
        suggestedOrderTypes={suggestedOrderTypes.map(s => ({ key: s.key, score: s.score, reasons: s.reasons || [] }))}
      />
    </div>
  );
}


