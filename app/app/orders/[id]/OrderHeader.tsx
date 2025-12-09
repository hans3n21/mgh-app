'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface OrderHeaderProps {
  orderId: string;
  orderTitle: string;
  orderType: string;
  typeLabel: string;
  customer: {
    name: string;
    email: string | null;
    phone: string | null;
  };
}

export default function OrderHeader({
  orderId,
  orderTitle,
  orderType,
  typeLabel,
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
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 p-3">
      <div className="flex items-center gap-2">
        <Link href="/app/orders" className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm hover:bg-slate-800">
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
          <div className="flex items-center gap-2 group">
            <h2 className="text-lg font-semibold">{orderTitle}</h2>
            <button
              onClick={() => setIsEditing(true)}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-sky-400 p-1"
              title="Auftragsname bearbeiten"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          </div>
        )}
        <div className="text-xs rounded-full border border-slate-700 px-2 py-0.5 text-slate-300">
          {typeLabel}
        </div>
      </div>

      {/* Kunde-Info oben rechts */}
      <div className="flex items-center gap-3">
        <div className="text-sm font-medium text-slate-200">{customer.name}</div>
        <div className="flex items-center gap-2">
          {customer.email && (
            <a
              href={`mailto:${customer.email}`}
              className="text-slate-400 hover:text-sky-400 transition-colors"
              title={`E-Mail an ${customer.name}: ${customer.email}`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </a>
          )}
          {customer.phone && (
            <a
              href={`tel:${customer.phone}`}
              className="text-slate-400 hover:text-green-400 transition-colors"
              title={`Anrufen: ${customer.phone}`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

