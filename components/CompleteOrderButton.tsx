"use client";

import * as React from 'react';

type CompleteOrderButtonProps = {
  orderId: string;
  status: string;
  onCompleted?: () => void;
};

export default function CompleteOrderButton({ orderId, status, onCompleted }: CompleteOrderButtonProps) {
  const [loading, setLoading] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  if (status === 'complete') return null;

  const openConfirm = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (loading) return;
    setConfirmOpen(true);
  };

  const handleComplete = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'complete' }),
      });

      if (!res.ok) {
        const t = await res.text();
        alert(`Abschließen fehlgeschlagen: ${t || res.status}`);
        return;
      }

      onCompleted?.();
      if (!onCompleted) {
        window.location.reload();
      }
    } finally {
      setLoading(false);
      setConfirmOpen(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={openConfirm}
        disabled={loading}
        title="Als fertig markieren"
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-emerald-300 transition-colors hover:bg-emerald-900/30 disabled:opacity-40"
        aria-label="Auftrag abschließen"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
        </svg>
      </button>

      {confirmOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!loading) setConfirmOpen(false);
          }}
        >
          <div
            className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-4 shadow-2xl"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <h3 className="text-sm font-semibold text-slate-100">Auftrag abschließen?</h3>
            <p className="mt-2 text-sm text-slate-300">
              Soll dieser Auftrag wirklich als fertig markiert werden?
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-60"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!loading) setConfirmOpen(false);
                }}
                disabled={loading}
              >
                Abbrechen
              </button>
              <button
                type="button"
                className="rounded-lg border border-emerald-700/70 bg-emerald-900/30 px-3 py-1.5 text-sm text-emerald-200 hover:bg-emerald-900/50 disabled:opacity-60"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void handleComplete();
                }}
                disabled={loading}
              >
                {loading ? 'Speichert…' : 'Ja, abschließen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
