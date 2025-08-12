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
                <td className="py-2 pr-4 font-medium">{c.name}</td>
                <td className="py-2 pr-4">
                  {c.email ? (
                    <a
                      href={`mailto:${c.email}`}
                      className="flex items-center gap-2 text-slate-400 hover:text-sky-400 transition-colors"
                      title={`E-Mail an ${c.name}`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      <span className="text-xs">{c.email}</span>
                    </a>
                  ) : (
                    <span className="text-slate-500">—</span>
                  )}
                </td>
                <td className="py-2 pr-4">
                  {c.phone ? (
                    <a
                      href={`tel:${c.phone}`}
                      className="flex items-center gap-2 text-slate-400 hover:text-green-400 transition-colors"
                      title={`Anrufen: ${c.phone}`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                      <span className="text-xs">{c.phone}</span>
                    </a>
                  ) : (
                    <span className="text-slate-500">—</span>
                  )}
                </td>
                <td className="py-2 pr-4">
                  {c.orders.length > 0 ? (
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-medium">{c.orders.length} Aufträge</span>
                      <div className="text-xs text-slate-400">
                        {c.orders.slice(0, 2).map((order, idx) => (
                          <div key={order.id}>
                            <Link
                              href={`/app/orders/${order.id}`}
                              className="hover:text-sky-400 transition-colors"
                            >
                              {order.title}
                            </Link>
                          </div>
                        ))}
                        {c.orders.length > 2 && (
                          <div className="text-slate-500">
                            +{c.orders.length - 2} weitere
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <span className="text-slate-500">Keine Aufträge</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
