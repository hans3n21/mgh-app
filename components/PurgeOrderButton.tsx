"use client";

import * as React from 'react';
import { useRouter } from 'next/navigation';

interface PurgeOrderButtonProps {
  orderId: string;
  orderTitle: string;
  imageCount: number;
  messageCount: number;
  mailCount: number;
}

// Endgueltiges Loeschen ist der einzige Weg, an dem Daten wirklich verloren gehen.
// Deshalb kein confirm()-Dialog, den man wegklickt, sondern ein zweiter Schritt
// direkt in der Zeile, der vorher benennt, was dabei vernichtet wird.
export default function PurgeOrderButton({
  orderId,
  orderTitle,
  imageCount,
  messageCount,
  mailCount,
}: PurgeOrderButtonProps) {
  const [confirming, setConfirming] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const router = useRouter();

  const handlePurge = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/orders/${orderId}?permanent=1`, { method: 'DELETE' });
      if (!res.ok) {
        const t = await res.text();
        alert(`Endgültiges Löschen fehlgeschlagen: ${t || res.status}`);
        return;
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-lg border border-red-900/60 px-3 py-1.5 text-sm font-semibold text-red-300 hover:bg-red-900/30"
      >
        Endgültig löschen
      </button>
    );
  }

  const verlust = [
    imageCount > 0 ? `${imageCount} Bilder` : null,
    messageCount > 0 ? `${messageCount} Notizen` : null,
  ].filter(Boolean).join(' und ');

  return (
    <div className="w-full rounded-lg border border-red-900/60 bg-red-950/30 p-3 text-sm sm:w-80">
      <div className="font-semibold text-red-200">
        {orderId} „{orderTitle}“ endgültig löschen?
      </div>
      <div className="mt-1 text-xs text-red-200/80">
        {verlust
          ? `${verlust} werden dabei unwiderruflich vernichtet.`
          : 'Der Auftrag wird unwiderruflich entfernt.'}
        {mailCount > 0 && ` Die ${mailCount} Mails bleiben im Posteingang, verlieren aber die Zuordnung zum Auftrag.`}
        {' '}Das lässt sich nicht rückgängig machen.
      </div>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={handlePurge}
          disabled={loading}
          className="rounded-lg bg-red-800 px-3 py-1.5 text-sm font-semibold text-red-50 hover:bg-red-700 disabled:opacity-40"
        >
          {loading ? 'Wird gelöscht…' : 'Ja, endgültig löschen'}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={loading}
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-40"
        >
          Abbrechen
        </button>
      </div>
    </div>
  );
}
