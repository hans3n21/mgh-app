"use client";

import * as React from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';

// Kein confirm() mehr: der native Dialog blockiert die Seite und erscheint in
// eingebetteten Browsern oft abgesetzt vom Inhalt oder am oberen Rand. Er wird
// dann uebersehen — man drueckt den Muelleimer und es "passiert nichts", waehrend
// die Seite in Wahrheit auf eine Antwort wartet. Stattdessen eine Rueckfrage in
// der Seite, wie beim endgueltigen Loeschen im Papierkorb.
export default function DeleteOrderButton({ orderId, orderTitle, onDeleted }: { orderId: string; orderTitle?: string; onDeleted?: () => void }) {
  const [loading, setLoading] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const router = useRouter();

  const openConfirm = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (loading) return;
    setConfirming(true);
  };

  const closeConfirm = (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    setConfirming(false);
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/orders/${orderId}`, { method: 'DELETE' });
      if (!res.ok) {
        const t = await res.text();
        alert(`Verschieben fehlgeschlagen: ${t || res.status}`);
        return;
      }
      setConfirming(false);
      onDeleted?.();
      // Ohne Callback die Serverdaten neu holen statt die ganze Seite neu zu laden:
      // ein window.location.reload() war am Handy ein bis zwei Sekunden leerer
      // Bildschirm ohne jede Rueckmeldung.
      if (!onDeleted) {
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  };

  const label = orderTitle ? `${orderId} „${orderTitle}“` : orderId;

  return (
    <>
      <button
        type="button"
        onClick={openConfirm}
        disabled={loading}
        title="In den Papierkorb verschieben"
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-red-300 transition-colors hover:bg-red-900/30 disabled:opacity-40"
        aria-label="Auftrag in den Papierkorb verschieben"
      >
        {/* simples Trash-Icon (Heroicons Outline Trash) */}
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673A2.25 2.25 0 0 1 15.916 21.75H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
        </svg>
      </button>

      {confirming && typeof window !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4"
          onClick={closeConfirm}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-4 text-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="font-semibold">{label} in den Papierkorb verschieben?</div>
            <p className="mt-1 text-sm text-slate-400">
              Alle Daten bleiben erhalten. Unter Aufträge → Papierkorb lässt sich der
              Auftrag jederzeit zurückholen.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeConfirm}
                disabled={loading}
                className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-40"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={loading}
                className="rounded-lg bg-red-800 px-3 py-2 text-sm font-semibold text-red-50 hover:bg-red-700 disabled:opacity-40"
              >
                {loading ? 'Wird verschoben…' : 'In den Papierkorb'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

    </>
  );
}
