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
  const [splitPayment, setSplitPayment] = useState<boolean>(false);
  const [isLocked, setIsLocked] = useState(false);
  const [saving, setSaving] = useState(false);
  const isGuitar = orderType === 'GUITAR';

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
    if (!orderId || !shopAmount) return;
    
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
      alert('Bitte Endbetrag eintragen.');
      return;
    }

    if (!confirm('Möchten Sie den Auftrag jetzt an WooCommerce übertragen?')) {
      return;
    }

    setSaving(true);
    try {
      // Trigger WooCommerce sync event
      document.dispatchEvent(new CustomEvent('sync-to-woo', { 
        detail: { mode: 'full', orderId } 
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
      <h4 className="text-xs font-medium text-slate-400">Preisberechnung</h4>
      
      {/* Endbetrag Sektion */}
      <div className="space-y-2">
        <div className="text-xs text-slate-400">Endbetrag</div>
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
              {/* Split-Payment Toggle Button für Gitarren */}
              {isGuitar && (
                <button
                  onClick={() => setSplitPayment(!splitPayment)}
                  className={`text-xs px-2 py-1 rounded border transition-colors ${
                    splitPayment 
                      ? 'border-amber-600 bg-amber-600/20 text-amber-300' 
                      : 'border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                  title="Zahlung in zwei Rechnungen aufteilen"
                >
                  Split
                </button>
              )}
            </>
          ) : (
            <>
              <input
                value={shopAmount}
                onChange={(e) => setShopAmount(e.target.value)}
                placeholder="z.B. 3000"
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

      {/* Shop Integration */}
      <div className="space-y-2">
        <div className="flex gap-2">
          {!isGuitar || !splitPayment ? (
            <>
              <button
                onClick={syncToShop}
                disabled={saving || !shopAmount}
                className="w-full text-xs px-3 py-2 bg-slate-700 hover:bg-slate-600 border border-slate-600 hover:border-slate-500 text-slate-200 rounded disabled:opacity-50 font-medium"
              >
                {saving ? 'Übertrage...' : 'Auftrag in Shop'}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => {
                  if (!shopAmount || !shopAmount.trim()) {
                    alert('Bitte Endbetrag eintragen.');
                    return;
                  }
                  if (!confirm('Anzahlung jetzt in WooCommerce anlegen?')) return;
                  document.dispatchEvent(new CustomEvent('sync-to-woo', { 
                    detail: { mode: 'deposit', orderId } 
                  } as CustomEventInit));
                }}
                disabled={saving || !shopAmount}
                className="flex-1 text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 border border-slate-600 hover:border-slate-500 text-slate-200 rounded disabled:opacity-50"
                title="1. Zahlung (Anzahlung)"
              >
                Zahlung 1
              </button>
              <button
                onClick={() => {
                  if (!shopAmount || !shopAmount.trim()) {
                    alert('Bitte Endbetrag eintragen.');
                    return;
                  }
                  if (!confirm('Restzahlung jetzt in WooCommerce anlegen?')) return;
                  document.dispatchEvent(new CustomEvent('sync-to-woo', { 
                    detail: { mode: 'balance', orderId } 
                  } as CustomEventInit));
                }}
                disabled={saving || !shopAmount}
                className="flex-1 text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 border border-slate-600 hover:border-slate-500 text-slate-200 rounded disabled:opacity-50"
                title="2. Zahlung (Rest)"
              >
                Zahlung 2
              </button>
            </>
          )}
        </div>

      </div>
    </div>
  );
}
