'use client';

import Link from 'next/link';
import React from 'react';
import { useSession } from 'next-auth/react';
import PhoneLink from '@/components/PhoneLink';

export interface CustomerWithOrders {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  orders: Array<{ id: string; title: string }>;
}

export default function CustomersClient({ customers }: { customers: CustomerWithOrders[] }) {
  const { data: session, status: sessionStatus } = useSession();
  const [openCustomerId, setOpenCustomerId] = React.useState<string | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [customersList, setCustomersList] = React.useState<CustomerWithOrders[]>(customers);
  const [search, setSearch] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setCustomersList(customers);
  }, [customers]);

  const deleteCustomer = React.useCallback(async (customerId: string, customerName: string) => {
    if (!confirm(`Sind Sie sicher, dass Sie den Kunden "${customerName}" löschen möchten?\n\nDiese Aktion kann nicht rückgängig gemacht werden.`)) {
      return;
    }

    try {
      setDeletingId(customerId);
      setError(null);

      const response = await fetch(`/api/customers/${customerId}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (response.ok) {
        // Entferne Kunde aus der Liste
        setCustomersList(prev => prev.filter(c => c.id !== customerId));
      } else {
        const errorMsg = data.error || 'Fehler beim Löschen des Kunden';
        setError(errorMsg);
        alert(errorMsg + (data.hasOrders ? `\n\nDer Kunde hat ${data.orderCount} Aufträge.` : ''));
      }
    } catch (error) {
      const errorMsg = 'Fehler beim Löschen des Kunden';
      setError(errorMsg);
      alert(errorMsg);
      console.error('Error deleting customer:', error);
    } finally {
      setDeletingId(null);
    }
  }, []);

  // Warte bis Session geladen ist, bevor wir Admin-Status prüfen
  const isAdmin = sessionStatus === 'authenticated' && (session?.user?.role === 'admin' || session?.user?.role === 'admin_no_feedback');

  const filteredCustomers = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return customersList;
    return customersList.filter((c) =>
      [c.name, c.email ?? '', c.phone ?? ''].join(' ').toLowerCase().includes(term)
    );
  }, [customersList, search]);

  return (
    <div className="mt-3">
      {error && (
        <div className="mb-4 p-3 bg-red-900/30 border border-red-700/50 rounded-lg text-red-300 text-sm">
          {error}
        </div>
      )}
      <div className="mb-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Kunden suchen (Name, E-Mail, Telefon)…"
          className="w-full sm:w-80 rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm"
        />
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-slate-400">
              <th className="py-2 pr-4">Name</th>
              <th className="py-2 pr-4 hidden sm:table-cell">E-Mail</th>
              <th className="py-2 pr-4 hidden sm:table-cell">Telefon</th>
              <th className="py-2 pr-4 sm:hidden">Kontakt</th>
              <th className="py-2 pr-4">Aufträge</th>
              {isAdmin && <th className="py-2 pr-4">Aktionen</th>}
            </tr>
          </thead>
          <tbody>
            {filteredCustomers.map((c) => (
              <tr key={c.id} className="border-t border-slate-800">
                <td className="py-2 pr-4 font-medium">
                  <Link href={`/app/customers/${c.id}`} className="hover:text-sky-400 transition-colors">
                    {c.name}
                  </Link>
                </td>
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
                    <PhoneLink
                      phone={c.phone}
                      className="flex items-center gap-2 text-slate-400 hover:text-green-400 transition-colors"
                      title={`Anrufen: ${c.phone}`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                      <span className="text-xs">{c.phone}</span>
                    </PhoneLink>
                  ) : (
                    <span className="text-slate-500">—</span>
                  )}
                </td>
                {/* Mobile: Kontakt zusammengefasst */}
                <td className="py-2 pr-4 sm:hidden">
                  <div className="flex items-center gap-3">
                    {c.email && (
                      <a href={`mailto:${c.email}`} className="text-slate-400 hover:text-sky-400" title={`E-Mail an ${c.name}`}>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                      </a>
                    )}
                    {c.phone && (
                      <PhoneLink phone={c.phone} className="text-slate-400 hover:text-green-400" title={`Anrufen: ${c.phone}`}>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                        </svg>
                      </PhoneLink>
                    )}
                    {!c.email && !c.phone && <span className="text-slate-500 text-xs">—</span>}
                  </div>
                </td>
                <td className="py-2 pr-4">
                  {c.orders.length > 0 ? (
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        className="text-sm font-medium text-sky-400 hover:text-sky-300 underline"
                        onClick={(e) => {
                          e.preventDefault();
                          if (c.orders.length === 1) {
                            window.location.href = `/app/orders/${c.orders[0].id}`;
                            return;
                          }
                          setOpenCustomerId(c.id);
                        }}
                      >
                        {c.orders.length} {c.orders.length === 1 ? 'Auftrag' : 'Aufträge'}
                      </button>

                      {openCustomerId === c.id && (
                        <div className="fixed inset-0 z-[9999] bg-black/60 p-4" onClick={() => setOpenCustomerId(null)}>
                          <div className="mx-auto max-w-md rounded-xl border border-slate-700 bg-slate-900 p-4" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-between mb-2">
                              <div className="font-semibold">Aufträge von {c.name}</div>
                              <button
                                type="button"
                                className="rounded border border-slate-700 px-2 py-1 text-xs"
                                onClick={(e) => {
                                  e.preventDefault();
                                  setOpenCustomerId(null);
                                }}
                              >
                                Schließen
                              </button>
                            </div>
                            <div className="space-y-2 max-h-80 overflow-auto">
                              {c.orders.map(order => (
                                <div key={order.id} className="rounded border border-slate-800 p-2 flex items-center justify-between">
                                  <div className="min-w-0">
                                    <div className="font-medium text-sm truncate">{order.title}</div>
                                    <div className="text-xs text-slate-500 font-mono">{order.id}</div>
                                  </div>
                                  <Link href={`/app/orders/${order.id}`} className="text-xs text-sky-400 hover:text-sky-300 underline" onClick={() => setOpenCustomerId(null)}>
                                    Öffnen
                                  </Link>
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
                {isAdmin && (
                  <td className="py-2 pr-4">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        deleteCustomer(c.id, c.name);
                      }}
                      disabled={deletingId === c.id || c.orders.length > 0}
                      className="px-2 py-1 bg-red-600 hover:bg-red-700 disabled:bg-red-800 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded text-xs transition-colors flex items-center justify-center"
                      title={c.orders.length > 0 ? `Kunde hat ${c.orders.length} Aufträge und kann nicht gelöscht werden` : 'Kunde löschen'}
                    >
                      {deletingId === c.id ? (
                        <span className="text-xs">Lösche...</span>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      )}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
