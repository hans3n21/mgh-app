'use client';

import { useState } from 'react';

interface OrderItem {
  id: string;
  label: string;
  qty: number;
  unitPrice: number;
  total: number;
  notes?: string;
  priceItem?: { id: string; label: string } | null;
}

interface PriceItem {
  id: string;
  category: string;
  label: string;
  unit?: string;
  price?: number;
  min?: number;
  max?: number;
}

interface ItemsManagerProps {
  orderId: string;
  items: OrderItem[];
  priceItems: PriceItem[];
  onItemsChange: (items: OrderItem[]) => void;
}

export default function ItemsManager({ orderId, items, priceItems, onItemsChange }: ItemsManagerProps) {
  const [newItem, setNewItem] = useState({
    priceItemId: '',
    label: '',
    qty: 1,
    unitPrice: 0,
    notes: '',
  });
  const [adding, setAdding] = useState(false);

  const addItem = async () => {
    if (!newItem.label.trim()) return;

    setAdding(true);
    try {
      const total = newItem.qty * newItem.unitPrice;
      
      const response = await fetch(`/api/orders/${orderId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newItem,
          total,
          priceItemId: newItem.priceItemId || null,
        }),
      });

      if (response.ok) {
        const createdItem = await response.json();
        onItemsChange([...items, createdItem]);
        setNewItem({
          priceItemId: '',
          label: '',
          qty: 1,
          unitPrice: 0,
          notes: '',
        });
      }
    } catch (error) {
      console.error('Fehler beim Hinzufügen:', error);
      alert('Fehler beim Hinzufügen der Leistung');
    } finally {
      setAdding(false);
    }
  };

  const updateItem = async (itemId: string, updates: Partial<OrderItem>) => {
    try {
      const response = await fetch(`/api/orders/${orderId}/items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (response.ok) {
        const updatedItem = await response.json();
        onItemsChange(items.map(item => item.id === itemId ? updatedItem : item));
      }
    } catch (error) {
      console.error('Fehler beim Aktualisieren:', error);
    }
  };

  const deleteItem = async (itemId: string) => {
    try {
      const response = await fetch(`/api/orders/${orderId}/items/${itemId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        onItemsChange(items.filter(item => item.id !== itemId));
      }
    } catch (error) {
      console.error('Fehler beim Löschen:', error);
      alert('Fehler beim Löschen der Leistung');
    }
  };

  const handlePriceItemSelect = (priceItemId: string) => {
    const priceItem = priceItems.find(p => p.id === priceItemId);
    if (priceItem) {
      setNewItem({
        ...newItem,
        priceItemId,
        label: priceItem.label,
        unitPrice: priceItem.price || 0,
      });
    }
  };

  const totalAmount = items.reduce((sum, item) => sum + item.total, 0);

  return (
    <div className="space-y-4">
      {/* Add Item Section */}
      <div className="rounded-lg border border-slate-700 p-3 space-y-3">
        <div className="font-medium text-sm">Leistung hinzufügen</div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {/* Price Item Selector */}
          <select
            value={newItem.priceItemId}
            onChange={(e) => handlePriceItemSelect(e.target.value)}
            className="rounded bg-slate-950 border border-slate-700 px-2 py-1.5 text-sm"
          >
            <option value="">Aus Preisliste wählen...</option>
            {priceItems.map((priceItem) => (
              <option key={priceItem.id} value={priceItem.id}>
                {priceItem.category} - {priceItem.label}
                {priceItem.price && ` (${priceItem.price}€)`}
              </option>
            ))}
          </select>

          {/* Custom Label */}
          <input
            placeholder="Oder eigene Bezeichnung"
            value={newItem.label}
            onChange={(e) => setNewItem({ ...newItem, label: e.target.value })}
            className="rounded bg-slate-950 border border-slate-700 px-2 py-1.5 text-sm"
          />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <input
            type="number"
            placeholder="Menge"
            min="1"
            value={newItem.qty}
            onChange={(e) => setNewItem({ ...newItem, qty: parseInt(e.target.value) || 1 })}
            className="rounded bg-slate-950 border border-slate-700 px-2 py-1.5 text-sm"
          />
          <input
            type="number"
            placeholder="Preis €"
            min="0"
            step="0.01"
            value={newItem.unitPrice}
            onChange={(e) => setNewItem({ ...newItem, unitPrice: parseFloat(e.target.value) || 0 })}
            className="rounded bg-slate-950 border border-slate-700 px-2 py-1.5 text-sm"
          />
          <div className="flex items-center justify-center text-sm text-slate-400">
            = {(newItem.qty * newItem.unitPrice).toFixed(2)}€
          </div>
        </div>

        <input
          placeholder="Notizen (optional)"
          value={newItem.notes}
          onChange={(e) => setNewItem({ ...newItem, notes: e.target.value })}
          className="w-full rounded bg-slate-950 border border-slate-700 px-2 py-1.5 text-sm"
        />

        <button
          onClick={addItem}
          disabled={adding || !newItem.label.trim()}
          className="w-full rounded bg-sky-600 hover:bg-sky-500 px-3 py-2 text-sm font-medium disabled:opacity-50"
        >
          {adding ? 'Hinzufügen...' : 'Leistung hinzufügen'}
        </button>
      </div>

      {/* Items List */}
      <div className="space-y-2">
        {items.length === 0 ? (
          <div className="text-slate-500 text-sm text-center py-4">
            Noch keine Leistungen erfasst
          </div>
        ) : (
          <>
            {items.map((item) => (
              <div key={item.id} className="rounded-lg border border-slate-700 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="font-medium text-sm">{item.label}</div>
                    {item.notes && (
                      <div className="text-xs text-slate-400 mt-1">{item.notes}</div>
                    )}
                    {item.priceItem && (
                      <div className="text-xs text-slate-500 mt-1">
                        Aus Preisliste: {item.priceItem.label}
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2 text-sm">
                    <input
                      type="number"
                      value={item.qty}
                      onChange={(e) => {
                        const qty = parseInt(e.target.value) || 1;
                        updateItem(item.id, { qty, total: qty * item.unitPrice });
                      }}
                      className="w-16 rounded bg-slate-950 border border-slate-700 px-1 py-0.5 text-center"
                      min="1"
                    />
                    <span className="text-slate-400">×</span>
                    <input
                      type="number"
                      value={item.unitPrice}
                      onChange={(e) => {
                        const unitPrice = parseFloat(e.target.value) || 0;
                        updateItem(item.id, { unitPrice, total: item.qty * unitPrice });
                      }}
                      className="w-20 rounded bg-slate-950 border border-slate-700 px-1 py-0.5 text-center"
                      min="0"
                      step="0.01"
                    />
                    <span className="text-slate-400">€</span>
                    <span className="w-16 text-right font-medium">
                      {item.total.toFixed(2)}€
                    </span>
                    <button
                      onClick={() => deleteItem(item.id)}
                      className="text-red-400 hover:text-red-300 ml-2"
                    >
                      🗑
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {/* Total */}
            <div className="rounded-lg border border-slate-600 bg-slate-800/50 p-3">
              <div className="flex justify-between items-center font-semibold">
                <span>Gesamtsumme</span>
                <span className="text-lg">{totalAmount.toFixed(2)}€</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
