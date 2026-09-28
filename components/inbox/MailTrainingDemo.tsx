'use client';

import { useState } from 'react';
import MailTrainingWorkspace from './MailTrainingWorkspace';
import type { Annotation, ReviewEvent, TrainingData } from '@/lib/mail-training/contracts';

/** Development-only fixture. No customer data, API calls, or database writes. */
export default function MailTrainingDemo({ initial }: { initial: TrainingData }) {
  const [data, setData] = useState(initial);
  return <main className="min-h-screen bg-slate-950 p-4 text-slate-100 sm:p-8"><div className="mx-auto max-w-6xl space-y-4">
    <div className="rounded border border-amber-700 bg-amber-950/30 p-3 text-sm text-amber-100">Trainingsmodus · Bedienprobe mit erfundenen Daten. Änderungen bleiben nur bis zum Neuladen dieser Seite erhalten.</div>
    <MailTrainingWorkspace data={data} onChange={setData} reload={async () => setData(initial)} mutate={async body => {
      if (body.revision !== data.revision) throw new Error('Der Stand hat sich geändert. Bitte neu laden.');
      const next = structuredClone(data);
      const event: ReviewEvent = { at: new Date().toISOString(), userId: 'demo-admin', action: body.action as 'review' | 'apply' };
      if (body.action === 'review') {
        const a = { ...(body.annotation as Annotation), reviewed: true, reason: body.reason as Annotation['reason'] };
        event.before = body.previous as Annotation | undefined; event.after = a; event.reason = a.reason; event.annotationId = a.id;
        next.annotations = [...next.annotations.filter(p => p.id !== a.id), a];
      } else if (body.action === 'apply') {
        const a = next.annotations.find(a => a.id === body.annotationId);
        if (!a?.reviewed || !['confirmed', 'change'].includes(a.intent) || a.dismissed) throw new Error('Bitte zuerst den Wunsch bestätigen.');
        if ((next.currentValues[a.field] || '') !== body.expectedValue) throw new Error('Der Auftragswert hat sich geändert.');
        Object.assign(event, { annotationId: a.id, orderId: next.orderId, field: a.field, oldValue: next.currentValues[a.field] || '', newValue: a.value });
        next.currentValues[a.field] = a.value;
      }
      next.history.push(event); next.revision++;
      return next;
    }} />
  </div></main>;
}
