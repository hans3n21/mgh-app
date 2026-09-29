'use client';

import { useEffect, useState } from 'react';
import type { TrainingData } from '@/lib/mail-training/contracts';
import MailTrainingWorkspace from './MailTrainingWorkspace';

export default function MailTrainingPanel({ mailId }: { mailId: string }) {
  const [admin, setAdmin] = useState(false);
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<TrainingData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/auth/session', { signal: controller.signal }).then(r => r.json())
      .then(s => { if (!controller.signal.aborted) setAdmin(['admin', 'admin_no_feedback'].includes(s?.user?.role)); }).catch(() => {});
    return () => controller.abort();
  }, []);
  async function load() {
    const res = await fetch(`/api/mails/${encodeURIComponent(mailId)}/training`, { cache: 'no-store' });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Laden fehlgeschlagen.');
    setData(result);
  }
  async function toggle() {
    if (open) { setOpen(false); return; }
    setOpen(true); setLoading(true); setError('');
    try { await load(); } catch (e) { setError(e instanceof Error ? e.message : 'Laden fehlgeschlagen.'); }
    finally { setLoading(false); }
  }
  if (!admin) return null;
  return <section className="mb-4 rounded-lg border border-sky-800 bg-slate-900/60 p-3">
    <button type="button" aria-expanded={open} onClick={toggle} className="text-sm font-medium text-sky-200">{open ? 'Trainingsmodus schließen' : 'Trainingsmodus öffnen'} <span className="ml-2 text-xs text-slate-400">Nur Admins · lokal</span></button>
    {open && <div className="mt-3">
      {loading && <p role="status" className="text-sm text-slate-300">Markierungen werden geladen …</p>}
      {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
      {!loading && data && <MailTrainingWorkspace data={data} onChange={setData} reload={load} mutate={async body => {
        const res = await fetch(`/api/mails/${encodeURIComponent(mailId)}/training`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Speichern fehlgeschlagen.');
        if (body.action !== 'model') window.dispatchEvent(new CustomEvent('mgh:extraction-updated', { detail: { mailId } }));
        if (body.action === 'apply') {
          window.dispatchEvent(new CustomEvent('mgh:suggestions-updated'));
          window.dispatchEvent(new CustomEvent('mgh:suggestions-applied'));
        }
        return result;
      }} />}
    </div>}
  </section>;
}
