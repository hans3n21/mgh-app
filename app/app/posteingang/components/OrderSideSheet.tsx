"use client";

import { useEffect, useRef, useState } from 'react';
import SpecFormCompact from '@/components/spec/SpecFormCompact';

type Mode = 'existing' | 'new';

export default function OrderSideSheet({ open, onClose, mail, context, onCreated, initialMode = 'existing' }: {
  open: boolean;
  onClose: ()=>void;
  mail: { id: string; subject?: string | null; attachments?: Array<{ id:string; filename:string; mimeType:string|null }> };
  context: { defaultOrderId: string | null; suggestedOrderTypes: Array<{ key:string; score:number }>; specSuggestions: Array<{ field:string; value:string }>; parsedContact?: { name?: string; email?: string; phone?: string; address?: string }; candidates?: Array<{id:string; title:string}> } | null;
  onCreated?: (orderId:string)=>void;
  initialMode?: Mode;
}) {
  const firstFocusable = useRef<HTMLButtonElement | null>(null);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [orderId, setOrderId] = useState<string | null>(context?.defaultOrderId || null);
  const [typeKey, setTypeKey] = useState<string>(context?.suggestedOrderTypes?.[0]?.key || 'GUITAR');
  const [contact, setContact] = useState<{ name?: string; email?: string; phone?: string; address?: string }>(context?.parsedContact || {});
  const [specKV, setSpecKV] = useState<Record<string,string>>({});

  useEffect(()=>{ if (open && firstFocusable.current) firstFocusable.current.focus(); }, [open]);
  useEffect(()=>{ setOrderId(context?.defaultOrderId || null); },[context?.defaultOrderId]);
  useEffect(()=>{ setTypeKey(context?.suggestedOrderTypes?.[0]?.key || 'GUITAR'); },[context?.suggestedOrderTypes]);
  useEffect(()=>{ setContact(context?.parsedContact || {}); },[context?.parsedContact]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/40 z-[999]" onClick={onClose}>
      <div className="absolute right-0 top-0 bottom-0 w-full max-w-xl bg-slate-950 border-l border-slate-800 p-4 overflow-auto" onClick={(e)=>e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <div className="text-lg font-semibold">{mode==='new' ? 'Neuen Auftrag erstellen' : 'Infos zu Auftrag hinzufügen'}</div>
          <button className="rounded border border-slate-700 px-2 py-1" onClick={onClose}>Schließen</button>
        </div>

        {/* Step 1: Modus */}
        <div className="mb-3 flex items-center gap-3">
          <button ref={firstFocusable} className={`rounded px-2 py-1 text-xs border ${mode==='existing'?'bg-sky-600 text-white border-sky-600':'bg-slate-900 text-slate-300 border-slate-700'}`} onClick={()=>setMode('existing')}>Bestehender Auftrag</button>
          <button className={`rounded px-2 py-1 text-xs border ${mode==='new'?'bg-sky-600 text-white border-sky-600':'bg-slate-900 text-slate-300 border-slate-700'}`} onClick={()=>setMode('new')}>Neuer Auftrag</button>
        </div>

        {/* Step 2: Auftrag wählen */}
        {mode==='existing' && (
          <div className="mb-3">
            <label className="block text-xs text-slate-400 mb-1">Auftrag</label>
            <select className="w-full rounded bg-slate-950 border border-slate-700 px-2 py-1 text-sm" value={orderId || ''} onChange={(e)=>setOrderId(e.target.value || null)}>
              <option value="">Nicht zugewiesen</option>
              {(context)?.candidates?.map((c)=> (
                <option key={c.id} value={c.id}>{c.id} {c.title?`– ${c.title}`:''}</option>
              ))}
            </select>
          </div>
        )}

        {/* Step 3: Kontakt (nur new) */}
        {mode==='new' && (
          <div className="mb-3 grid grid-cols-1 gap-2">
            <div className="text-sm font-medium">Kontakt</div>
            <input className="rounded bg-slate-950 border border-slate-700 px-2 py-1 text-sm" placeholder="Name" value={contact?.name||''} onChange={(e)=>setContact({...contact, name:e.target.value})} />
            <input className="rounded bg-slate-950 border border-slate-700 px-2 py-1 text-sm" placeholder="E-Mail" value={contact?.email||''} onChange={(e)=>setContact({...contact, email:e.target.value})} />
            <input className="rounded bg-slate-950 border border-slate-700 px-2 py-1 text-sm" placeholder="Telefon" value={contact?.phone||''} onChange={(e)=>setContact({...contact, phone:e.target.value})} />
            <textarea className="rounded bg-slate-950 border border-slate-700 px-2 py-1 text-sm" rows={2} placeholder="Adresse" value={contact?.address||''} onChange={(e)=>setContact({...contact, address:e.target.value})} />
          </div>
        )}

        {/* Step 4: Typ (nur new) */}
        {mode==='new' && (
          <div className="mb-3 flex flex-wrap gap-2">
            {(context?.suggestedOrderTypes||[]).slice(0,8).map((s)=> (
              <button key={s.key} onClick={()=>setTypeKey(s.key)} className={`text-xs rounded-full px-2 py-1 border ${typeKey===s.key?'bg-sky-600 text-white border-sky-600':'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800'}`}>{s.key}</button>
            ))}
          </div>
        )}

        {/* Step 5: Datenblatt */}
        <div className="mb-3">
          {mode==='existing' && orderId ? (
            <SpecFormCompact orderId={orderId} value={specKV} onChange={setSpecKV} />
          ) : (
            <SpecFormCompact typeKey={typeKey} value={specKV} onChange={setSpecKV} />
          )}
        </div>

        <div className="flex items-center gap-2">
          {mode==='new' ? (
            <button className="rounded bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 text-xs font-medium" onClick={async()=>{
              const res = await fetch(`/api/mails/${mail.id}/create-order`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ orderType:typeKey, spec: specKV, customer: contact }) });
              const data = await res.json().catch(()=>({}));
              if (res.ok) { onCreated?.(data.orderId); onClose(); } else { alert(data?.error || res.status); }
            }}>Anlegen</button>
          ) : (
            <button disabled={!orderId} className="rounded bg-sky-600 hover:bg-sky-500 px-3 py-1.5 text-xs font-medium disabled:opacity-50" onClick={async()=>{
              if (!orderId) return;
              const res = await fetch(`/api/orders/${orderId}/spec/autofill-from-mail`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ mailId: mail.id, strategy: 'emptyOnly', extra: specKV }) });
              const data = await res.json().catch(()=>({}));
              if (res.ok) { onCreated?.(orderId); onClose(); } else { alert(data?.error || res.status); }
            }}>Übernehmen</button>
          )}
          <button className="rounded border border-slate-700 px-3 py-1.5 text-xs" onClick={onClose}>Abbrechen</button>
        </div>
      </div>
    </div>
  );
}


