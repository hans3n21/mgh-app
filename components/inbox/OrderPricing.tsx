'use client';
import React, { useState, useEffect } from 'react';

interface Props {
  orderId: string | null;
  orderType?: string;
  onPriceUpdate?: (amount: string) => void;
  message?: any;
  draft?: any;
  submitting?: boolean;
  setSubmitting?: (submitting: boolean) => void;
  setToast?: (toast: string | null) => void;
}

export default function OrderPricing({ orderId, orderType, onPriceUpdate, message, draft, submitting, setSubmitting, setToast }: Props) {
  const [shopAmount, setShopAmount] = useState('');
  const [isLocked, setIsLocked] = useState(false);
  const [saving, setSaving] = useState(false);
  const hasAmount = shopAmount.trim().length > 0;

  // Lade gespeicherten Preis beim Auftragswechsel
  useEffect(() => {
    if (!orderId) {
      setShopAmount('');
      setIsLocked(false);
      return;
    }

    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}`);
        if (!active) return;

        if (res.ok) {
          const order = await res.json();
          if (order.finalAmountCents) {
            const amount = (order.finalAmountCents / 100).toString();
            setShopAmount(amount);
            setIsLocked(true);
            if (onPriceUpdate) {
              onPriceUpdate(amount);
            }
          } else {
            setShopAmount('');
            setIsLocked(false);
          }
        }
      } catch (error) {
        console.error('Fehler beim Laden des Preises:', error);
      }
    })();

    return () => { active = false; };
  }, [orderId]);

  const formattedAmount = (() => {
    const raw = (shopAmount || '').replace(',', '.').trim();
    const n = Number(raw);
    if (Number.isFinite(n)) {
      return new Intl.NumberFormat('de-DE', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
      }).format(n) + ' €';
    }
    return (shopAmount || '') + ' €';
  })();

  const saveAmount = async () => {
    if (!orderId) return;
    if (!hasAmount) {
      setToast?.('Auftrag bleibt ohne Endbetrag. Preis kann später ergänzt werden.');
      return;
    }

    setSaving(true);
    try {
      const normalized = shopAmount.replace(',', '.');
      const parsed = parseFloat(normalized);

      if (isNaN(parsed) || parsed <= 0) {
        alert('Bitte gültigen Endbetrag eingeben.');
        return;
      }

      const amountCents = Math.round(parsed * 100);
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ finalAmountCents: amountCents })
      });

      if (!res.ok) {
        alert('Konnte Endbetrag nicht speichern');
        return;
      }

      setIsLocked(true);
      if (onPriceUpdate) {
        onPriceUpdate(String(parsed));
      }
    } catch (error) {
      console.error('Fehler beim Speichern:', error);
      alert('Fehler beim Speichern des Preises');
    } finally {
      setSaving(false);
    }
  };

  const syncToShop = async () => {
    if (!orderId) return;

    const value = isLocked ? shopAmount : shopAmount;
    const isEmpty = !value || !value.trim();

    if (isEmpty) {
      alert('Für die Shop-Übertragung bitte zuerst einen Endbetrag eintragen. Der interne Auftrag darf ohne Preis bestehen bleiben.');
      return;
    }

    if (!confirm('Möchten Sie den Auftrag jetzt an WooCommerce übertragen?')) {
      return;
    }

    setSaving(true);
    try {
      document.dispatchEvent(new CustomEvent('sync-to-woo', {
        detail: { orderId }
      } as CustomEventInit));

      alert('Auftrag wird an WooCommerce übertragen...');
    } catch (error) {
      console.error('Fehler bei Shop-Übertragung:', error);
      alert('Fehler bei der Shop-Übertragung');
    } finally {
      setSaving(false);
    }
  };

  if (!orderId) {
    return null;
  }

  return (
    <div className="mt-4 pt-3 border-t border-slate-800 space-y-3">
      <div className="space-y-1">
        <h4 className="text-xs font-medium text-slate-300">Preis & Shop</h4>
        <p className="text-[11px] leading-4 text-slate-500">
          Optional: Der Auftrag ist auch ohne Endbetrag angelegt. Preis und Shop-Übertragung können später folgen.
        </p>
      </div>

      <div className="space-y-2">
        <div className="text-xs text-slate-400">Endbetrag optional</div>
        <div className="flex items-center gap-2">
          {isLocked ? (
            <>
              <span className="text-slate-200 font-bold text-sm">{formattedAmount}</span>
              <button
                onClick={() => setIsLocked(false)}
                className="text-xs text-slate-400 hover:text-slate-300"
                title="Bearbeiten"
              >
                ✏️
              </button>
            </>
          ) : (
            <>
              <input
                value={shopAmount}
                onChange={(e) => setShopAmount(e.target.value)}
                placeholder="später festlegen"
                className="flex-1 text-xs px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-200"
              />
              <button
                onClick={saveAmount}
                disabled={saving}
                className="text-xs px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded disabled:opacity-50"
                title="Endbetrag speichern"
              >
                {saving ? '...' : 'OK'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Nur noch eine Rechnung über den vollen Endbetrag — Raten-Buttons
          (Anzahlung/Restzahlung) sind bewusst entfernt. */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <button
            onClick={syncToShop}
            disabled={saving || !hasAmount}
            title={hasAmount ? 'Auftrag in WooCommerce anlegen' : 'Shop-Übertragung erst nach Endbetrag möglich'}
            className="w-full text-xs px-3 py-2 bg-slate-700 hover:bg-slate-600 border border-slate-600 hover:border-slate-500 text-slate-200 rounded disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {saving ? 'Übertrage...' : 'In Shop anlegen'}
          </button>
        </div>
      </div>
    </div>
  );
}
