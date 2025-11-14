"use client";

import { useState } from 'react';
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

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <label className="text-sm text-slate-300">Bearbeiten: Auftrag</label>
        <select
          className="rounded-lg bg-slate-900 border border-slate-700 text-slate-200 px-2 py-1"
          value={selectedOrderId || ''}
          onChange={(e)=> setSelectedOrderId(e.target.value || null)}
        >
          <option value="">Neu</option>
          {candidates.map((o) => (
            <option key={o.id} value={o.id}>
              {o.id} {o.title ? `– ${o.title}` : ''}{o.assignee ? ` (${o.assignee.name})` : ''}
            </option>
          ))}
        </select>
        <button className="px-2 py-1 rounded-lg border border-slate-700 hover:bg-slate-800" onClick={()=> setSelectedOrderId(null)}>Neu</button>
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


