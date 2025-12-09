"use client";

import * as React from 'react';

export default function DeleteOrderButton({ orderId, onDeleted }: { orderId: string; onDeleted?: () => void }) {
  const [loading, setLoading] = React.useState(false);

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (loading) return;
    if (!confirm('Auftrag wirklich löschen?')) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/orders/${orderId}`, { method: 'DELETE' });
      if (!res.ok) {
        const t = await res.text();
        alert(`Löschen fehlgeschlagen: ${t || res.status}`);
        return;
      }
      onDeleted?.();
      // Fallback: Seite neu laden, falls kein Callback übergeben wurde
      if (!onDeleted) {
        window.location.reload();
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={loading}
      title="Löschen"
      className="inline-flex items-center justify-center rounded-lg border border-red-800/60 text-red-300 hover:bg-red-900/20 px-2 py-1"
      aria-label="Auftrag löschen"
    >
      {/* simples Trash-Icon (Heroicons Outline Trash) */}
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673A2.25 2.25 0 0 1 15.916 21.75H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
      </svg>
    </button>
  );
}


