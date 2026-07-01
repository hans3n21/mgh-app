"use client";

type Att = { id: string; filename: string; contentType?: string | null; mimeType?: string | null; size?: number | null; linked?: boolean };

const fileIcon = (mime: string | null | undefined, fn: string) => {
  const mt = (mime || '').toLowerCase();
  const ext = (fn || '').split('.').pop()?.toLowerCase();
  if (mt.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '')) return '🖼️';
  if (['xlsx', 'xls'].includes(ext || '') || mt.includes('spreadsheet')) return '📊';
  if (['pdf'].includes(ext || '') || mt.includes('pdf')) return '📄';
  if (['doc', 'docx'].includes(ext || '') || mt.includes('word')) return '📝';
  if (['zip', 'rar', '7z'].includes(ext || '')) return '📦';
  return '📎';
};

const formatSize = (bytes?: number | null) => bytes != null ? (bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`) : '';

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
      <div className="flex flex-col gap-1.5">
        {attachments.map((a) => {
          const linked = isLinked(a.id);
          const url = `/api/attachments/${a.id}`;
          return (
            <a
              key={a.id}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-2 py-2 px-3 rounded-lg border border-slate-700 bg-slate-800/50 hover:border-emerald-500/60 hover:bg-slate-800 transition-colors text-left"
            >
              <span className="text-xl flex-shrink-0">{fileIcon(a.mimeType || a.contentType, a.filename)}</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm text-slate-100 truncate" title={a.filename}>{a.filename}</div>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  {a.size != null ? <span>{formatSize(a.size)}</span> : null}
                  <span className={linked ? 'text-emerald-400' : ''}>{linked ? 'Verknüpft' : ''}</span>
                </div>
              </div>
              <span className="text-slate-500 group-hover:text-emerald-400 transition-colors flex-shrink-0" title="Öffnen / Herunterladen">↓</span>
              {!linked && orderId && (
                <button
                  className="text-xs rounded border border-slate-700 px-2 py-1 hover:bg-slate-700 flex-shrink-0"
                  title="Zum Auftrag verknüpfen"
                  onClick={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const res = await fetch(`/api/mails/${mailId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId }) });
                    if (res.ok) onLinked?.();
                  }}
                >Verknüpfen</button>
              )}
            </a>
          );
        })}
      </div>
      {orderId && attachments.some(a => !isLinked(a.id)) && (
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


