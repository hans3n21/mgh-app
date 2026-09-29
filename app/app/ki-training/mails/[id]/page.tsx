import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import MailTrainingPanel from '@/components/inbox/MailTrainingPanel';

export default async function TrainingMailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user || !['admin', 'admin_no_feedback'].includes(session.user.role)) redirect('/app');
  const { id } = await params;
  return <section className="space-y-4 rounded-xl bg-slate-950 p-4 text-slate-100">
    <Link href="/app/ki-training" className="text-sm text-sky-300">← KI-Training</Link>
    <h1 className="text-xl font-semibold">Quellmail prüfen</h1>
    <p className="text-sm text-slate-300">Hier kannst du Markierungen korrigieren und Vorschläge des lokalen Modells prüfen. Jede Korrektur zählt als Lernbeispiel.</p>
    <MailTrainingPanel mailId={id} />
  </section>;
}
