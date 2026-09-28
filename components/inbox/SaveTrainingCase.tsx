'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { TrainingData } from '@/lib/mail-training/contracts';
import { trainingRequest } from '@/components/AiTrainingAdmin';

export default function SaveTrainingCase({ data }: { data: TrainingData }) {
  const [open, setOpen] = useState(false); const [title, setTitle] = useState('');
  const [partition, setPartition] = useState('test'); const [complete, setComplete] = useState(false);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  useEffect(() => { setComplete(false); }, [data.revision, data.sourceHash]);
  const button = 'rounded border border-slate-600 px-3 py-2 text-xs disabled:opacity-40';
  return <div className="mt-4 border-t border-slate-700 pt-3 text-slate-200">
    <div className="flex flex-wrap items-center gap-3"><button className={button} disabled={!data.orderId} onClick={() => { setOpen(!open); setComplete(false); }}>Als Prüffall speichern</button><Link href="/app/ki-training" className="text-xs text-sky-300 underline">Zum Adminbereich KI-Training</Link></div>
    {open && <div className="mt-3 space-y-3 rounded border border-slate-700 p-3 text-sm">
      <p>Der Fall speichert den bisherigen Gesprächsausschnitt und deine gespeicherten, aktiven Markierungen. Spätere Mails und heutige Auftragswerte werden nicht als historische Wahrheit beigefügt.</p>
      <label className="block">Fallbezeichnung (ohne Kundennamen)<input aria-label="Fallbezeichnung" maxLength={100} className="mt-1 w-full rounded border border-slate-600 bg-slate-950 p-2" value={title} onChange={e => setTitle(e.target.value)} /></label>
      <label className="block">Verwendung<select aria-label="Verwendung des Prüffalls" className="mt-1 w-full rounded border border-slate-600 bg-slate-950 p-2" value={partition} onChange={e => setPartition(e.target.value)}><option value="test">Unabhängiger Testfall</option><option value="train">Freigegebenes Lernbeispiel</option></select></label>
      <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={complete} onChange={e => setComplete(e.target.checked)} />Ich habe die aktuelle Mail vollständig geprüft: Alle gewünschten Auftrags- und Datenschutzstellen sind gespeichert, falsche Vorschläge verworfen. Auch ein Fall ohne relevante Angaben ist bewusst geprüft.</label>
      <button className={button} disabled={busy || !complete || !title.trim()} onClick={async () => {
        setBusy(true); setMessage(''); try { await trainingRequest({ action: 'create', mailId: data.mailId, title, partition, complete: true, revision: data.revision, sourceHash: data.sourceHash }); setMessage('Prüffall im Adminbereich gespeichert.'); setOpen(false); }
        catch (e) { setMessage(e instanceof Error ? e.message : 'Speichern fehlgeschlagen.'); } finally { setBusy(false); }
      }}>{busy ? 'Wird gespeichert …' : 'Geprüften Stand einfrieren'}</button>
    </div>}
    <p role="status" className="mt-2 text-xs text-sky-200">{message}</p>
  </div>;
}
