"use client";

type Att = { id: string; filename: string; contentType?: string | null; mimeType?: string | null; size?: number | null; linked?: boolean };

export default function AttachmentsPanel({ mailId, attachments, orderId, linkedPaths, onLinked }: {
  mailId: string;
  attachments: Array<Att>;
  orderId?: string | null;
  linkedPaths?: string[];
  onLinked?: ()=>void;
}) {
  const isLinked = (attId: string) => (linkedPaths || []).includes(`/api/attachments/${attId}`);

  return (
    <div className="rounded border border-slate-800 p-2">
      <div className="text-sm font-medium mb-2">Anhänge</div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
        {attachments.map((a) => {
          const linked = isLinked(a.id);
          return (
            <div key={a.id} className="rounded border border-slate-700 p-2 bg-slate-900">
              <div className="text-xs text-slate-300 truncate" title={a.filename}>{a.filename}</div>
              <div className="mt-1 h-20 overflow-hidden rounded bg-slate-800 flex items-center justify-center">
                <img src={`/api/attachments/${a.id}`} className="max-h-20" onError={(e)=>{ (e.target as HTMLImageElement).style.display='none'; }} />
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className={`text-[11px] ${linked ? 'text-emerald-400' : 'text-slate-400'}`}>{linked ? 'Verknüpft' : 'Nicht verknüpft'}</span>
                {!linked && orderId && (
                  <button
                    className="text-[11px] rounded border border-slate-700 px-2 py-0.5 hover:bg-slate-800"
                    title={orderId ? 'Anhang in Auftrag spiegeln' : 'Kein Auftrag gewählt'}
                    onClick={async ()=>{
                      const res = await fetch(`/api/mails/${mailId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId }) });
                      if (res.ok) onLinked?.();
                    }}
                  >Zum Auftrag verknüpfen</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {orderId && attachments.some(a => !a.linked) && (
        <div className="mt-2">
          <button
            className="text-[11px] rounded border border-slate-700 px-2 py-1 hover:bg-slate-800"
            onClick={async ()=>{
              const res = await fetch(`/api/mails/${mailId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId }) });
              if (res.ok) onLinked?.();
            }}
          >Alle übertragen</button>
        </div>
      )}
    </div>
  );
}


