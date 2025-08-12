'use client';

import Link from 'next/link';
import React from 'react';

export interface CustomerWithOrders {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  orders: Array<{ id: string; title: string }>;
}

export default function CustomersClient({ customers }: { customers: CustomerWithOrders[] }) {
  const [openCustomerId, setOpenCustomerId] = React.useState<string | null>(null);

  return (
    <div className="mt-3 overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-left text-slate-400">
            <th className="py-2 pr-4">Name</th>
            <th className="py-2 pr-4 hidden sm:table-cell">E-Mail</th>
            <th className="py-2 pr-4 hidden sm:table-cell">Telefon</th>
            <th className="py-2 pr-4 sm:hidden">Kontakt</th>
            <th className="py-2 pr-4">Aufträge</th>
          </tr>
        </thead>
        <tbody>
          {customers.map((c) => (
            <tr key={c.id} className="border-t border-slate-800">
              <td className="py-2 pr-4 font-medium">{c.name}</td>
              {/* Desktop: separate Spalten */}
              <td className="py-2 pr-4 hidden sm:table-cell">
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
              <td className="py-2 pr-4 hidden sm:table-cell">
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
              {/* Mobile: Kontakt zusammengefasst */}
              <td className="py-2 pr-4 sm:hidden">
                <div className="flex items-center gap-3">
                  {c.email && (
                    <a href={`mailto:${c.email}`} className="text-slate-400 hover:text-sky-400" title={`E-Mail an ${c.name}`}>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                    </a>
                  )}
                  {c.phone && (
                    <a href={`tel:${c.phone}`} className="text-slate-400 hover:text-green-400" title={`Anrufen: ${c.phone}`}>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                    </a>
                  )}
                  {!c.email && !c.phone && <span className="text-slate-500 text-xs">—</span>}
                </div>
              </td>
              <td className="py-2 pr-4">
                {c.orders.length > 0 ? (
                  <div className="flex flex-col gap-1">
                    <button
                      className="text-sm font-medium text-sky-400 hover:text-sky-300 underline"
                      onClick={() => setOpenCustomerId(c.id)}
                    >{c.orders.length} Aufträge</button>

                    {openCustomerId === c.id && (
                      <div className="fixed inset-0 z-[9999] bg-black/60 p-4" onClick={() => setOpenCustomerId(null)}>
                        <div className="mx-auto max-w-md rounded-xl border border-slate-700 bg-slate-900 p-4" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-between mb-2">
                            <div className="font-semibold">Aufträge von {c.name}</div>
                            <button
                              className="rounded border border-slate-700 px-2 py-1 text-xs"
                              onClick={() => setOpenCustomerId(null)}
                            >Schließen</button>
                          </div>
                          <div className="space-y-2 max-h-80 overflow-auto">
                            {c.orders.map(order => (
                              <div key={order.id} className="rounded border border-slate-800 p-2 flex items-center justify-between">
                                <div className="min-w-0">
                                  <div className="font-medium text-sm truncate">{order.title}</div>
                                  <div className="text-xs text-slate-500 font-mono">{order.id}</div>
                                </div>
                                <Link href={`/app/orders/${order.id}`} className="text-xs text-sky-400 hover:text-sky-300 underline" onClick={() => setOpenCustomerId(null)}>Öffnen</Link>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
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
  );
}


