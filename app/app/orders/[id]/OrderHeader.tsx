'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import PhoneLink from '@/components/PhoneLink';

interface OrderHeaderProps {
  orderId: string;
  orderTitle: string;
  orderType: string;
  typeLabel: string;
  nextStep?: string | null;
  customer: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
  };
}

/** Inline-editierbarer "Nächster Schritt" — erscheint auch in der Auftragsliste. */
function NextStepInline({ orderId, initial }: { orderId: string; initial: string | null }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initial ?? '');
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!editing) setValue(initial ?? '');
  }, [initial, editing]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nextStep: value.trim() || null }),
      });
      if (res.ok) {
        setEditing(false);
        router.refresh();
      }
    } catch (error) {
      console.error('Fehler beim Speichern des nächsten Schritts:', error);
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="flex w-full items-center gap-2 sm:w-auto">
        <span className="text-sm text-sky-300">→</span>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') setEditing(false);
          }}
          maxLength={200}
          className="min-w-0 flex-1 rounded border border-slate-600 bg-slate-800 px-2 py-1 text-sm text-slate-200 focus:border-sky-500 focus:outline-none sm:w-72"
          placeholder="Nächster Schritt, z.B. Hals schleifen…"
          autoFocus
          disabled={saving}
        />
        <button onClick={save} disabled={saving} className="rounded bg-emerald-600 px-2 py-1 text-sm text-white hover:bg-emerald-500 disabled:opacity-50" title="Speichern">✓</button>
        <button onClick={() => setEditing(false)} disabled={saving} className="rounded bg-slate-600 px-2 py-1 text-sm text-white hover:bg-slate-500 disabled:opacity-50" title="Abbrechen">✕</button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className={`group/next flex min-w-0 items-center gap-1.5 rounded px-1.5 py-0.5 text-sm transition-colors hover:bg-slate-800 ${initial ? 'text-sky-300' : 'text-slate-500'}`}
      title="Nächster Schritt bearbeiten"
    >
      <span>→</span>
      <span className="truncate">{initial || 'Nächster Schritt festlegen…'}</span>
      <svg className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover/next:opacity-100" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
      </svg>
    </button>
  );
}

export default function OrderHeader({
  orderId,
  orderTitle,
  orderType,
  typeLabel,
  nextStep = null,
  customer,
}: OrderHeaderProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [titleValue, setTitleValue] = useState(orderTitle);
  const [isSaving, setIsSaving] = useState(false);
  const router = useRouter();

  // Aktualisiere titleValue wenn orderTitle sich ändert (z.B. nach Refresh)
  useEffect(() => {
    if (!isEditing) {
      setTitleValue(orderTitle);
    }
  }, [orderTitle, isEditing]);

  const handleSave = async () => {
    if (!titleValue.trim()) {
      setTitleValue(orderTitle);
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: titleValue.trim() }),
      });

      if (response.ok) {
        setIsEditing(false);
        router.refresh();
      } else {
        // Bei Fehler zurücksetzen
        setTitleValue(orderTitle);
        setIsEditing(false);
      }
    } catch (error) {
      console.error('Fehler beim Speichern des Auftragsnamens:', error);
      setTitleValue(orderTitle);
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setTitleValue(orderTitle);
    setIsEditing(false);
  };

  return (
    <div className="sticky top-0 z-40 flex flex-col gap-3 border-b border-slate-800 bg-slate-900/95 p-3 backdrop-blur sm:static sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:bg-transparent sm:backdrop-blur-none">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Link href="/app/orders" className="shrink-0 rounded-lg border border-slate-700 px-3 py-1.5 text-sm hover:bg-slate-800">
          Aufträge
        </Link>
        <span className="text-sm text-slate-500">/</span>
        {isEditing ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={titleValue}
              onChange={(e) => setTitleValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSave();
                } else if (e.key === 'Escape') {
                  handleCancel();
                }
              }}
              className="px-2 py-1 text-lg font-semibold bg-slate-800 border border-slate-600 rounded text-slate-200 focus:outline-none focus:border-sky-500"
              placeholder="Auftragsname..."
              autoFocus
              disabled={isSaving}
            />
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-2 py-1 text-sm bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-700 disabled:cursor-not-allowed text-white rounded transition-colors"
              title="Speichern"
            >
              ✓
            </button>
            <button
              onClick={handleCancel}
              disabled={isSaving}
              className="px-2 py-1 text-sm bg-slate-600 hover:bg-slate-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded transition-colors"
              title="Abbrechen"
            >
              ✕
            </button>
          </div>
        ) : (
          <div className="group flex min-w-0 items-center gap-2">
            <h2 className="min-w-0 text-base font-semibold leading-snug text-slate-100 sm:text-lg">{orderTitle}</h2>
            <button
              onClick={() => setIsEditing(true)}
              className="shrink-0 p-1 text-slate-400 transition-opacity hover:text-sky-400 sm:opacity-0 sm:group-hover:opacity-100"
              title="Auftragsname bearbeiten"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          </div>
        )}
        <div className="shrink-0 rounded-full border border-slate-700 px-2 py-0.5 text-xs text-slate-300">
          {typeLabel}
        </div>
        <NextStepInline orderId={orderId} initial={nextStep} />
      </div>

      {/* Kunde-Info oben rechts */}
      <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-start">
        <Link
          href={`/app/customers/${customer.id}`}
          className="min-w-0 truncate text-sm font-medium text-slate-200 hover:text-sky-400 hover:underline"
          title="Zur Kundenakte"
        >
          {customer.name}
        </Link>
        <div className="flex items-center gap-2">
          {customer.email && (
            <Link
              href={`/app/posteingang?compose=1&to=${encodeURIComponent(customer.email)}`}
              className="text-slate-400 hover:text-sky-400 transition-colors"
              title={`Im Postfach antworten: ${customer.email}`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </Link>
          )}
          {customer.phone && (
            <PhoneLink
              phone={customer.phone}
              className="text-slate-400 hover:text-green-400 transition-colors"
              title={`Anrufen: ${customer.phone}`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </PhoneLink>
          )}
        </div>
      </div>
    </div>
  );
}
