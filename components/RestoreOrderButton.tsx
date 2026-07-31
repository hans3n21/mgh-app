"use client";

import * as React from 'react';
import { useRouter } from 'next/navigation';

export default function RestoreOrderButton({ orderId }: { orderId: string }) {
  const [loading, setLoading] = React.useState(false);
  const router = useRouter();

  const handleRestore = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/restore`, { method: 'POST' });
      if (!res.ok) {
        const t = await res.text();
        alert(`Wiederherstellen fehlgeschlagen: ${t || res.status}`);
        return;
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleRestore}
      disabled={loading}
      className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-40"
    >
      {loading ? 'Wird zurückgeholt…' : 'Wiederherstellen'}
    </button>
  );
}
