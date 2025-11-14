import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import ProcurementClient from './ProcurementClient';

export default async function ProcurementPage() {
  const session = await auth();
  
  if (!session?.user) {
    return (
      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden">
        <div className="p-8 text-center">
          <h2 className="text-lg font-semibold text-red-400">Nicht autorisiert</h2>
          <p className="text-sm text-slate-400 mt-2">
            Bitte melden Sie sich an, um auf die Procurement-Seite zuzugreifen.
          </p>
        </div>
      </section>
    );
  }

  const items = await prisma.procurementItem.findMany({
    where: { status: { not: 'archiviert' } }, // Standardmäßig nur offene Items
    include: {
      creator: {
        select: { id: true, name: true, email: true }
      }
    },
    orderBy: [
      { status: 'asc' },
      { createdAt: 'desc' }
    ]
  });

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden">
      <div className="bg-slate-800/50 border-b border-slate-700 p-4">
        <h2 className="text-lg font-semibold">Einkauf / Procurement</h2>
        <p className="text-sm text-slate-400 mt-1">
          Verwaltung von Einkaufslisten und Bestellungen
        </p>
      </div>
      <div className="p-4">
        <ProcurementClient 
          initialItems={items} 
          currentUser={session.user}
        />
      </div>
    </section>
  );
}