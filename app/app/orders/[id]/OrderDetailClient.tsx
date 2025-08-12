'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import OrderDetailTabsNew from '@/components/OrderDetailTabsNew';

const STATUS_LABEL: Record<string, string> = {
  intake: 'Eingang',
  quote: 'Angebot',
  in_progress: 'In Arbeit',
  finishing: 'Finish',
  setup: 'Setup',
  awaiting_customer: 'Warten auf Kunde',
  complete: 'Fertig',
  design_review: 'Designprüfung',
};

interface OrderImageLocal {
  id: string;
  path: string;
  comment?: string;
  position: number;
  attach: boolean;
  scope?: string;
  fieldKey?: string;
  createdAt: Date;
}

interface Order {
  id: string;
  title: string;
  type: string;
  status: string;
  createdAt: Date;
  assigneeId: string | null;
  customer: { id: string; name: string; email?: string; phone?: string } | null;
  assignee: { id: string; name: string } | null;
  specs: Array<{ id: string; key: string; value: string }>;
  items: Array<{
    id: string;
    label: string;
    qty: number;
    unitPrice: number;
    total: number;
    priceItem?: { id: string; label: string } | null;
  }>;
  images: Array<OrderImageLocal>;
  messages: Array<{
    id: string;
    body: string;
    createdAt: Date;
    senderType: string;
    sender?: { id: string; name: string } | null;
  }>;
  wcOrderId?: string | null;
  finalAmountCents?: number | null;
  paymentStatus?: string | null;
}

interface OrderDetailClientProps {
  order: Order;
  users: Array<{ id: string; name: string }>;
  currentUserId: string;
}

function statusToProgress(status: string): number {
  const order = ['intake', 'quote', 'in_progress', 'finishing', 'setup', 'awaiting_customer', 'complete'];
  const index = order.indexOf(status);
  return Math.round(((index + 1) / order.length) * 100);
}

export default function OrderDetailClient({ order: initialOrder, users, currentUserId }: OrderDetailClientProps) {
  const [order, setOrder] = useState(initialOrder);
  const [priceItems, setPriceItems] = useState<Array<{
    id: string;
    category: string;
    label: string;
    unit?: string;
    price?: number;
    min?: number;
    max?: number;
  }>>([]);
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [shopMode, setShopMode] = useState<'full' | 'deposit' | 'balance'>('full');
  const [shopAmount, setShopAmount] = useState<string>(
    initialOrder.finalAmountCents != null ? String(initialOrder.finalAmountCents / 100) : ''
  ); // € optional
  const [extraDialogOpen, setExtraDialogOpen] = useState(false);
  const [extraAmount, setExtraAmount] = useState('');
  const [extraLabel, setExtraLabel] = useState('');
  const [createOrderForExtra, setCreateOrderForExtra] = useState(false);

  // Lade Preisliste beim Mount
  React.useEffect(() => {
    fetch('/api/prices')
      .then(res => res.json())
      .then(data => setPriceItems(data))
      .catch(console.error);

    // Event zum Triggern aus Tabs unten
    const handler = (e: Event) => {
      const custom = e as CustomEvent<{ mode?: 'full' | 'deposit' | 'balance' }>;
      const forcedMode = custom.detail?.mode;
      void syncToShop(forcedMode);
    };
    document.addEventListener('sync-to-woo', handler as EventListener);
    return () => document.removeEventListener('sync-to-woo', handler as EventListener);
  }, [shopMode, shopAmount]);

  const handleStatusChange = async (newStatus: string) => {
    try {
      const response = await fetch(`/api/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (response.ok) {
        const updatedOrder = await response.json();
        setOrder(updatedOrder);
        router.refresh();
      }
    } catch (error) {
      console.error('Fehler beim Status-Update:', error);
    }
  };

  const handleAssigneeChange = async (newAssigneeId: string) => {
    try {
      const response = await fetch(`/api/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigneeId: newAssigneeId || null }),
      });

      if (response.ok) {
        const updatedOrder = await response.json();
        setOrder(updatedOrder);
        router.refresh();
      }
    } catch (error) {
      console.error('Fehler beim Assignee-Update:', error);
    }
  };

  const handleImagesChange = (newImages: OrderImageLocal[]) => {
    setOrder({ ...order, images: newImages });
  };



  const handleMessagesChange = (newMessages: typeof order.messages) => {
    setOrder({ ...order, messages: newMessages });
  };

  const syncToShop = async (forcedMode?: 'full' | 'deposit' | 'balance') => {
    setSyncing(true);
    try {
      // Betrag optional wandeln -> Cents
      let amountCents: number | undefined = undefined;
      if (shopAmount.trim()) {
        const normalized = shopAmount.replace(',', '.');
        const parsed = parseFloat(normalized);
        if (!isNaN(parsed) && isFinite(parsed)) {
          amountCents = Math.max(0, Math.round(parsed * 100));
        }
      }

      const res = await fetch(`/api/orders/${order.id}/woocommerce`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: forcedMode ?? shopMode, amountCents }),
      });
      if (res.ok) {
        const updated = await res.json();
        setOrder(updated);
        router.refresh();
      } else {
        const err = await res.json().catch(() => ({}) as Record<string, unknown>);
        alert(`Shop-Sync fehlgeschlagen: ${err.details || err.error || res.status}`);
      }
    } finally {
      setSyncing(false);
    }
  };

  const progress = statusToProgress(order.status);

  return (
    <div className="w-full space-y-4">
      {/* Obere Infozeile ohne Zahnrad */}
      <div className="text-xs text-slate-400">
        {order.wcOrderId ? (
          <span>Im Shop angelegt: Woo ID #{order.wcOrderId}</span>
        ) : (
          <span>Noch nicht im Shop angelegt</span>
        )}
      </div>
      {/* Progress Bar */}
      <div>
        <div className="text-xs text-slate-400">Status</div>
        <div className="mt-1 h-2 w-full rounded-full bg-slate-800">
          <div 
            className="h-2 rounded-full bg-sky-500 transition-all duration-300" 
            style={{ width: `${progress}%` }} 
          />
        </div>
        <div className="mt-1 text-xs text-slate-300">{STATUS_LABEL[order.status]}</div>
      </div>

      {/* Tabs - Vollbreite */}
      <OrderDetailTabsNew
        orderId={order.id}
        orderType={order.type}
        specs={order.specs}
        images={order.images}
        messages={order.messages}
        priceItems={priceItems}
        status={order.status}
        assigneeId={order.assigneeId}
        users={users}
        currentUserId={currentUserId}
        order={order}
        onStatusChange={handleStatusChange}
        onAssigneeChange={handleAssigneeChange}
        onImagesChange={handleImagesChange}
        onMessagesChange={handleMessagesChange}
        shopMode={shopMode}
        shopAmount={shopAmount}
        amountLocked={order.finalAmountCents != null}
        onShopOptionsChange={(mode, amount) => {
          setShopMode(mode);
          setShopAmount(amount);
        }}
      />
    </div>
  );
}
