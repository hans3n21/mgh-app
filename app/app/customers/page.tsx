import { prisma } from '@/lib/prisma';
import CustomersClient, { type CustomerWithOrders } from './CustomersClient';
import { PAGE_PANEL } from '@/lib/ui-classes';

export default async function CustomersPage() {
  const customers = await prisma.customer.findMany({
    include: { orders: true },
    orderBy: { name: 'asc' },
  });

  return (
    <section className={PAGE_PANEL}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Kunden</h2>
        <div className="text-xs text-slate-500">Seed-Daten</div>
      </div>
      <CustomersClient customers={customers as unknown as CustomerWithOrders[]} />
    </section>
  );
}
