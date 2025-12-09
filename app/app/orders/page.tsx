import { prisma } from '@/lib/prisma';
import OrderList from '@/components/OrderList';

export default async function OrdersPage() {
  const orders = await prisma.order.findMany({
    include: {
      customer: true,
      assignee: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <h2 className="text-lg font-semibold">Aufträge</h2>
        <div className="md:ml-auto flex items-center gap-2 w-full md:w-auto">
          <input
            placeholder="Suchen…"
            className="w-full md:w-72 rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <OrderList orders={orders} />
    </section>
  );
}
