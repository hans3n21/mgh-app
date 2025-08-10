import { prisma } from '@/lib/prisma';
import PricesClientNew from './PricesClientNew';

export default async function PricesPage() {
  const items = await prisma.priceItem.findMany({
    where: { active: true },
    orderBy: [{ mainCategory: 'asc' }, { category: 'asc' }, { label: 'asc' }],
  });

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden">
      <div className="bg-slate-800/50 border-b border-slate-700 p-4">
        <h2 className="text-lg font-semibold">Preise & Leistungen</h2>
      </div>
      <div className="p-4">
        <PricesClientNew initialItems={items as any} />
      </div>
    </section>
  );
}
