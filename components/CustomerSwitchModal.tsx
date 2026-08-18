'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

type CustomerEntry = {
  id: string;
  name: string;
  email?: string | null;
  city?: string | null;
};

type CustomerSwitchModalProps = {
  orderId: string;
  currentCustomerId: string;
  onClose: () => void;
  onSwitched: () => void;
};

/**
 * Hängt einen Auftrag an einen anderen Bestandskunden um. Entstanden aus dem
 * Fall "gleicher Vorname, falscher Kunde erwischt": Kundendaten am Auftrag zu
 * bearbeiten ändert den geteilten Datensatz — der richtige Weg ist, den
 * Auftrag umzuhängen.
 */
export default function CustomerSwitchModal({ orderId, currentCustomerId, onClose, onSwitched }: CustomerSwitchModalProps) {
  const [customers, setCustomers] = useState<CustomerEntry[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState('');
  const [switchingId, setSwitchingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/customers')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: CustomerEntry[]) => {
        if (!cancelled) setCustomers(data);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!customers) return [];
    const term = search.trim().toLowerCase();
    return customers.filter((c) => {
      if (c.id === currentCustomerId) return false;
      if (!term) return true;
      return [c.name, c.email ?? '', c.city ?? ''].join(' ').toLowerCase().includes(term);
    });
  }, [customers, search, currentCustomerId]);

  const switchTo = async (customerId: string) => {
    if (switchingId) return;
    setSwitchingId(customerId);
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({} as Record<string, unknown>));
        alert(`Kunde wechseln fehlgeschlagen: ${err.error || res.status}`);
        return;
      }
      onSwitched();
    } finally {
      setSwitchingId(null);
    }
  };

  if (typeof window === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4 bg-black/60" onClick={onClose}>
        <div
          className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-2xl border border-slate-800 bg-slate-900 p-4 text-slate-100"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between">
            <div className="text-lg font-semibold">Kunde wechseln</div>
            <button
              className="h-8 w-8 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-slate-100"
              onClick={onClose}
            >
              ×
            </button>
          </div>

          <p className="mt-1 text-xs text-slate-400">
            Der Auftrag wird an den gewählten Kunden gehängt — die Kundendaten selbst bleiben unverändert.
          </p>

          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, E-Mail oder Ort suchen…"
            className="mt-3 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder-slate-400"
          />

          <div className="mt-2 min-h-0 flex-1 overflow-y-auto">
            {loadError && (
              <div className="px-1 py-2 text-sm text-rose-300">Kundenliste konnte nicht geladen werden.</div>
            )}
            {!loadError && customers === null && (
              <div className="px-1 py-2 text-sm text-slate-400">Lade Kunden…</div>
            )}
            {!loadError && customers !== null && filtered.length === 0 && (
              <div className="px-1 py-2 text-sm text-slate-400">Kein Kunde gefunden.</div>
            )}
            {filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                disabled={switchingId !== null}
                onClick={() => switchTo(c.id)}
                className="block w-full rounded-lg px-2 py-2 text-left hover:bg-slate-800 disabled:opacity-50"
              >
                <div className="text-sm font-medium text-slate-100">
                  {c.name}
                  {switchingId === c.id && <span className="ml-2 text-xs text-slate-400">wird umgehängt…</span>}
                </div>
                <div className="text-xs text-slate-400">
                  {[c.email, c.city].filter(Boolean).join(' · ') || 'keine Kontaktdaten'}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
