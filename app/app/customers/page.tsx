import { prisma } from '@/lib/prisma';
import Link from 'next/link';

export default async function CustomersPage() {
  const customers = await prisma.customer.findMany({
    include: { orders: true },
    orderBy: { name: 'asc' },
  });

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Kunden</h2>
        <div className="text-xs text-slate-500">Seed-Daten</div>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-slate-400">
              <th className="py-2 pr-4">Name</th>
              <th className="py-2 pr-4">E-Mail</th>
              <th className="py-2 pr-4">Telefon</th>
              <th className="py-2 pr-4">Aufträge</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id} className="border-t border-slate-800">
                <td className="py-2 pr-4">{c.name}</td>
                <td className="py-2 pr-4">{c.email || '—'}</td>
                <td className="py-2 pr-4">{c.phone || '—'}</td>
                <td className="py-2 pr-4">{c.orders.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
