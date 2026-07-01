'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import OrderDetailTabsNew from '@/components/OrderDetailTabsNew';
import { normalizeWorkflowStatus, WORKFLOW_STATUSES, WORKFLOW_STATUS_LABEL } from '@/lib/order-status';

interface OrderImageLocal {
  id: string;
  path: string;
  comment: string | null;
  position: number;
  attach: boolean;
  scope: string | null;
  fieldKey: string | null;
  createdAt: Date;
}

interface Order {
  id: string;
  title: string;
  type: string;
  status: string;
  createdAt: Date;
  assigneeId: string | null;
  customer: { id: string; name: string; email: string | null; phone: string | null } | null;
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
  mails?: Array<{
    id: string;
    subject: string | null;
    fromName: string | null;
    fromEmail: string;
    text: string | null;
    html: string | null;
    date: Date;
    folder: string;
    senderId: string | null;
    attachments: Array<{ id: string; filename: string; mimeType: string | null; size: number }>;
  }>;
  wcOrderId?: string | null;
  finalAmountCents?: number | null;
  paymentStatus?: string | null;
  paymentMethod?: string | null;
  depositAmountCents?: number | null;
}

interface OrderTaskEntry {
  id: string;
  title: string;
  note: string | null;
  status: string;
  completedAt: string | null;
  createdAt: string;
  assignee: { id: string; name: string };
  creator: { id: string; name: string };
}

interface OrderDetailClientProps {
  order: Order;
  users: Array<{ id: string; name: string }>;
  currentUserId: string;
  hasUnreadComm?: boolean;
  initialTasks?: OrderTaskEntry[];
}

function statusToProgress(status: string): number {
  const normalized = normalizeWorkflowStatus(status);
  const index = WORKFLOW_STATUSES.indexOf(normalized);
  return Math.round(((Math.max(index, 0) + 1) / WORKFLOW_STATUSES.length) * 100);
}

export default function OrderDetailClient({ order: initialOrder, users, currentUserId, hasUnreadComm, initialTasks }: OrderDetailClientProps) {
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

  const handlePaymentStatusChange = async (newPaymentStatus: string) => {
    try {
      const response = await fetch(`/api/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentStatus: newPaymentStatus }),
      });

      if (response.ok) {
        const updatedOrder = await response.json();
        setOrder(updatedOrder);
        router.refresh();
      }
    } catch (error) {
      console.error('Fehler beim PaymentStatus-Update:', error);
    }
  };

  const handlePaymentMethodChange = async (newPaymentMethod: 'paypal' | 'direktueberweisung' | null) => {
    try {
      const response = await fetch(`/api/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentMethod: newPaymentMethod }),
      });

      if (response.ok) {
        const updatedOrder = await response.json();
        setOrder(updatedOrder);
        router.refresh();
      }
    } catch (error) {
      console.error('Fehler beim PaymentMethod-Update:', error);
    }
  };

  const handleDepositAmountChange = async (newDepositAmountCents: number | null) => {
    try {
      const response = await fetch(`/api/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ depositAmountCents: newDepositAmountCents }),
      });

      if (response.ok) {
        const updatedOrder = await response.json();
        setOrder(updatedOrder);
        router.refresh();
      }
    } catch (error) {
      console.error('Fehler beim DepositAmount-Update:', error);
    }
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

      const depositAmountCents = order.depositAmountCents ?? undefined;
      const res = await fetch(`/api/orders/${order.id}/woocommerce`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: forcedMode ?? shopMode, amountCents, depositAmountCents }),
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

  const normalizedStatus = normalizeWorkflowStatus(order.status);
  const progress = statusToProgress(order.status);

  return (
    <div className="w-full space-y-4">
      <div className="rounded-xl border border-slate-800/80 bg-slate-950/70 p-3 shadow-inner shadow-black/10 sm:p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Workflow</div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-sky-500/15 px-2.5 py-1 text-xs font-medium text-sky-200">
                {WORKFLOW_STATUS_LABEL[normalizedStatus]}
              </span>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  order.wcOrderId
                    ? 'bg-emerald-500/15 text-emerald-200'
                    : 'bg-slate-800 text-slate-300'
                }`}
              >
                {order.wcOrderId ? `Shop #${order.wcOrderId}` : 'Nicht im Shop'}
              </span>
            </div>
          </div>
          <div className="w-24 shrink-0 pt-0.5">
            <div className="flex items-center justify-between text-[11px] text-slate-500">
              <span>Stand</span>
              <span>{progress}%</span>
            </div>
            <div className="mt-1.5 h-1.5 rounded-full bg-slate-800">
              <div
                className="h-1.5 rounded-full bg-sky-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="min-w-0">
            <span className="mb-1 block text-[11px] font-medium text-slate-500">Status</span>
            <select
              value={normalizedStatus}
              onChange={(e) => handleStatusChange(e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-800 bg-slate-900/80 px-2.5 text-sm text-slate-100 outline-none transition focus:border-sky-500"
            >
              {WORKFLOW_STATUSES.map((statusKey) => (
                <option key={statusKey} value={statusKey}>
                  {WORKFLOW_STATUS_LABEL[statusKey]}
                </option>
              ))}
            </select>
          </label>

          <label className="min-w-0">
            <span className="mb-1 block text-[11px] font-medium text-slate-500">Mitarbeiter</span>
            <select
              value={order.assigneeId || ''}
              onChange={(e) => handleAssigneeChange(e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-800 bg-slate-900/80 px-2.5 text-sm text-slate-100 outline-none transition focus:border-sky-500"
            >
              <option value="">Nicht zugewiesen</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* Tabs - Vollbreite */}
      <OrderDetailTabsNew
        orderId={order.id}
        orderType={order.type}
        specs={order.specs}
        images={order.images.map(img => ({
          ...img,
          comment: img.comment ?? undefined,
          scope: img.scope ?? undefined,
          fieldKey: img.fieldKey ?? undefined,
        }))}
        messages={order.messages}
        priceItems={priceItems}
        status={order.status}
        assigneeId={order.assigneeId}
        users={users}
        currentUserId={currentUserId}
        order={{
          ...order,
          customer: order.customer ? {
            ...order.customer,
            email: order.customer.email ?? undefined,
            phone: order.customer.phone ?? undefined,
          } : null,
        }}
        paymentStatus={order.paymentStatus}
        paymentMethod={order.paymentMethod}
        depositAmountCents={order.depositAmountCents}
        onStatusChange={handleStatusChange}
        onAssigneeChange={handleAssigneeChange}
        onImagesChange={(images) => {
          handleImagesChange(images.map(img => ({
            ...img,
            comment: img.comment ?? null,
            scope: img.scope ?? null,
            fieldKey: img.fieldKey ?? null,
          })));
        }}
        onMessagesChange={handleMessagesChange}
        onPaymentStatusChange={handlePaymentStatusChange}
        onPaymentMethodChange={handlePaymentMethodChange}
        onDepositAmountChange={handleDepositAmountChange}
        shopMode={shopMode}
        shopAmount={shopAmount}
        amountLocked={order.finalAmountCents != null}
        onShopOptionsChange={(mode, amount) => {
          setShopMode(mode);
          setShopAmount(amount);
        }}
        hasUnreadComm={hasUnreadComm}
        initialTasks={initialTasks}
      />
    </div>
  );
}
