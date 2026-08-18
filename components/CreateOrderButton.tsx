'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';

const TYPE_LABEL = {
  GUITAR: 'Gitarrenbau',
  BODY: 'Body',
  NECK: 'Hals',
  REPAIR: 'Reparatur',
  PICKGUARD: 'Pickguard',
  PICKUPS: 'Tonabnehmer',
  FINISH_ONLY: 'Oberflächenbehandlung',
} as const;

interface Customer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
}

interface User {
  id: string;
  name: string;
}

interface CreateOrderButtonProps {
  customers: Customer[];
  users: User[];
}

export default function CreateOrderButton({ customers, users }: CreateOrderButtonProps) {
  const [modal, setModal] = useState(false);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<keyof typeof TYPE_LABEL>('GUITAR');
  const [assigneeId, setAssigneeId] = useState(users[0]?.id || '');
  const [mode, setMode] = useState<'new' | 'existing'>('existing');
  // Bewusst leer: war hier customers[0] vorbelegt, landete ein Auftrag beim
  // alphabetisch ersten Kunden, sobald jemand das Feld übersehen hat.
  const [customerId, setCustomerId] = useState('');
  const [newCustomer, setNewCustomer] = useState({
    name: '',
    email: '',
    phone: '',
    addressLine1: '',
    postalCode: '',
    city: '',
    country: 'DE',
  });
  const [asDraft, setAsDraft] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // Pflichtfelder: Titel immer, dazu je nach Modus ein gewaehlter Bestandskunde
  // oder ein Name fuer den neuen Kunden.
  const canSubmit =
    title.trim().length > 0 &&
    (mode === 'existing' ? customerId !== '' : newCustomer.name.trim().length > 0);

  async function submit() {
    if (loading) return;
    setLoading(true);

    try {
      // Erst ALLE Eingaben validieren, dann anlegen: Vorher wurde der Kunde
      // schon erstellt, bevor die Titel-Prüfung fehlschlug — beim zweiten
      // Submit entstand dann ein Kunden-Duplikat (verwaister leerer Datensatz).
      if (mode === 'new' && !newCustomer.name.trim()) {
        alert('Bitte Kundennamen eingeben');
        setLoading(false);
        return;
      }

      if (!title.trim()) {
        alert('Bitte Titel eingeben');
        setLoading(false);
        return;
      }

      if (mode === 'existing' && !customerId) {
        alert('Bitte Kunde auswählen');
        setLoading(false);
        return;
      }

      let finalCustomerId = customerId;

      // Neuen Kunden erstellen wenn nötig
      if (mode === 'new') {
        const customerRes = await fetch('/api/customers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newCustomer),
        });

        if (!customerRes.ok) {
          throw new Error('Kunde konnte nicht erstellt werden');
        }

        const newCust = await customerRes.json();
        finalCustomerId = newCust.id;
      }

      // Auftrag erstellen
      const orderData = {
        title: title.trim(),
        type,
        customerId: finalCustomerId,
        assigneeId,
        ...(asDraft ? { status: 'draft' as const } : {}),
      };
      
      console.log('Creating order with data:', orderData);
      
      const orderRes = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderData),
      });

      if (!orderRes.ok) {
        const errorData = await orderRes.json().catch(() => ({}));
        console.error('Order creation failed:', orderRes.status, errorData);
        throw new Error(`Auftrag konnte nicht erstellt werden (${orderRes.status}): ${errorData.error || 'Unbekannter Fehler'}`);
      }

      const newOrder = await orderRes.json();
      setModal(false);
      router.push(`/app/orders/${newOrder.id}`);
      router.refresh();
    } catch (error) {
      console.error('Fehler beim Erstellen:', error);
      alert('Fehler beim Erstellen des Auftrags');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setModal(true)}
        className="rounded-lg bg-slate-700 hover:bg-slate-600 px-3 py-1.5 text-sm font-semibold text-slate-200"
      >
        + Auftrag
      </button>

      {modal && typeof window !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[9999] overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 bg-black/60">
            <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-4 max-h-[90vh] overflow-y-auto text-slate-100">
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold text-slate-100">+ Auftrag anlegen</div>
              <button
                className="h-8 w-8 rounded-lg border border-slate-700 text-slate-300 hover:text-slate-100 hover:bg-slate-800"
                onClick={() => setModal(false)}
              >
                ×
              </button>
            </div>

            {/* Feste Beschriftungen ueber jedem Feld: mit blossen Platzhaltern war
                nicht erkennbar, dass das zweite Auswahlfeld den Bearbeiter meint —
                und beim Tippen verschwand die einzige Erklaerung des Titelfelds. */}
            <div className="mt-3 grid grid-cols-1 gap-3 text-sm">
              <label className="grid gap-1">
                <span className="text-xs font-medium text-slate-400">
                  Titel des Auftrags <span className="text-red-400">*</span>
                </span>
                <input
                  className="rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-slate-100 placeholder-slate-400"
                  placeholder="z. B. Strat Hals Ahorn"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>

              <label className="grid gap-1">
                <span className="text-xs font-medium text-slate-400">Art der Arbeit</span>
                <select
                  className="rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-slate-100"
                  value={type}
                  onChange={(e) => setType(e.target.value as keyof typeof TYPE_LABEL)}
                >
                  {Object.entries(TYPE_LABEL).map(([k, v]) => (
                    <option key={k} value={k} className="bg-slate-950 text-slate-100">
                      {v}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1">
                <span className="text-xs font-medium text-slate-400">Zuständig</span>
                <select
                  className="rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-slate-100"
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                >
                  {users.map((e) => (
                    <option key={e.id} value={e.id} className="bg-slate-950 text-slate-100">
                      {e.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex gap-3 text-sm">
                <label className="inline-flex items-center gap-2 text-slate-200">
                  <input
                    type="radio"
                    checked={mode === 'existing'}
                    onChange={() => setMode('existing')}
                    className="text-blue-500"
                  />
                  Bestandskunde
                </label>
                <label className="inline-flex items-center gap-2 text-slate-200">
                  <input
                    type="radio"
                    checked={mode === 'new'}
                    onChange={() => setMode('new')}
                    className="text-blue-500"
                  />
                  Neuer Kunde
                </label>
              </div>

              {mode === 'existing' ? (
                <label className="grid gap-1">
                  <span className="text-xs font-medium text-slate-400">
                    Kunde <span className="text-red-400">*</span>
                  </span>
                  <select
                    className="rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-slate-100"
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value)}
                  >
                    <option value="" className="bg-slate-950 text-slate-400">
                      — Kunde wählen —
                    </option>
                    {/* E-Mail mit anzeigen: bei zwei Kunden mit gleichem Vornamen
                        war sonst nicht erkennbar, wen man gerade erwischt. */}
                    {customers.map((c) => (
                      <option key={c.id} value={c.id} className="bg-slate-950 text-slate-100">
                        {c.name}{c.email ? ` (${c.email})` : ''}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    className="rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-slate-100 placeholder-slate-400"
                    placeholder="Name"
                    value={newCustomer.name}
                    onChange={(e) =>
                      setNewCustomer({ ...newCustomer, name: e.target.value })
                    }
                  />
                  <input
                    className="rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-slate-100 placeholder-slate-400"
                    placeholder="E-Mail"
                    value={newCustomer.email}
                    onChange={(e) =>
                      setNewCustomer({ ...newCustomer, email: e.target.value })
                    }
                  />
                  <input
                    className="rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-slate-100 placeholder-slate-400"
                    placeholder="Telefon"
                    value={newCustomer.phone}
                    onChange={(e) =>
                      setNewCustomer({ ...newCustomer, phone: e.target.value })
                    }
                  />
                  <input
                    className="sm:col-span-3 rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-slate-100 placeholder-slate-400"
                    placeholder="Adresse (Straße + Hausnummer)"
                    value={newCustomer.addressLine1}
                    onChange={(e) =>
                      setNewCustomer({ ...newCustomer, addressLine1: e.target.value })
                    }
                  />
                  <input
                    className="rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-slate-100 placeholder-slate-400"
                    placeholder="PLZ"
                    value={newCustomer.postalCode}
                    onChange={(e) =>
                      setNewCustomer({ ...newCustomer, postalCode: e.target.value })
                    }
                  />
                  <input
                    className="rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-slate-100 placeholder-slate-400"
                    placeholder="Ort"
                    value={newCustomer.city}
                    onChange={(e) =>
                      setNewCustomer({ ...newCustomer, city: e.target.value })
                    }
                  />
                  <input
                    className="rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-slate-100 placeholder-slate-400"
                    placeholder="Land (z. B. DE)"
                    value={newCustomer.country}
                    onChange={(e) =>
                      setNewCustomer({ ...newCustomer, country: e.target.value })
                    }
                  />
                </div>
              )}

              <label className="inline-flex items-center gap-2 text-sm text-slate-200">
                <input
                  type="checkbox"
                  checked={asDraft}
                  onChange={(e) => setAsDraft(e.target.checked)}
                  className="text-blue-500"
                />
                Als Entwurf anlegen (noch nicht freigegeben)
              </label>

              <div className="flex justify-end gap-2 mt-2">
                <button
                  className="rounded-lg border border-slate-700 px-3 py-2 text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                  onClick={() => setModal(false)}
                  disabled={loading}
                >
                  Abbrechen
                </button>
                <button
                  className="rounded-lg bg-slate-700 hover:bg-slate-600 px-3 py-2 font-semibold disabled:opacity-50 text-slate-200"
                  onClick={submit}
                  disabled={loading || !canSubmit}
                  title={canSubmit ? undefined : 'Titel und Kunde ausfüllen'}
                >
                  {loading ? 'Erstelle...' : 'Anlegen'}
                </button>
              </div>
            </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
