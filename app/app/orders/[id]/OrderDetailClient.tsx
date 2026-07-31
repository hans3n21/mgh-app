'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import OrderDetailTabsNew from '@/components/OrderDetailTabsNew';
import { normalizeWorkflowStatus, WORKFLOW_STATUSES, WORKFLOW_STATUS_LABEL, WORKFLOW_STATUS_CLASS } from '@/lib/order-status';

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

/** Position des Status in der Workflow-Reihenfolge — Grundlage der Schrittanzeige. */
function statusToIndex(status: string): number {
  return Math.max(WORKFLOW_STATUSES.indexOf(normalizeWorkflowStatus(status)), 0);
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
  const statusIndex = statusToIndex(order.status);

  return (
    <div className="w-full space-y-3">
      {/*
        Vorher standen hier drei Darstellungen DESSELBEN Werts uebereinander:
        ein farbiger Chip "Eingang", ein Auswahlfeld mit "Eingang" und eine
        Prozentzahl, die nichts anderes ist als Position durch Anzahl. Dazu die
        Ueberschrift "Workflow", die nichts erklaert. Zusammen 171 px, auf dem
        Handy fast ein Viertel des Bildschirms, bevor der erste Inhalt kam.

        Jetzt: der Chip IST das Auswahlfeld (samt Statusfarbe), daneben der
        Mitarbeiter, darunter eine Schrittanzeige statt der Scheingenauigkeit
        "17%". Eine Zeile statt vier.
      */}
      {/* Ohne eigene Kartenoptik: Rahmen, Hintergrund, Schatten und 12-16px
          Polsterung liessen die Statuszeile wie ein eigenes Panel wirken, obwohl
          sie inhaltlich zum Kopf gehoert — und sie steht auf jedem Reiter. */}
      <div className="pt-1">
        <div className="flex items-center gap-2">
          <div className={`relative shrink-0 rounded-full border ${WORKFLOW_STATUS_CLASS[normalizedStatus]}`}>
            <select
              value={normalizedStatus}
              onChange={(e) => handleStatusChange(e.target.value)}
              aria-label="Status"
              title="Status ändern"
              className="h-8 cursor-pointer appearance-none rounded-full bg-transparent py-0 pl-3 pr-7 text-xs font-medium text-inherit outline-none [&>option]:bg-slate-900 [&>option]:text-slate-100"
            >
              {WORKFLOW_STATUSES.map((statusKey) => (
                <option key={statusKey} value={statusKey}>
                  {WORKFLOW_STATUS_LABEL[statusKey]}
                </option>
              ))}
            </select>
            <svg className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
            </svg>
          </div>

          {/* Personensymbol statt Beschriftung "Mitarbeiter": das Wort kostet auf
              375 px die Haelfte des Feldes, und ein Name daneben sagt ohnehin,
              worum es geht. */}
          <div className="relative min-w-0 flex-1 rounded-full border border-slate-700 bg-slate-900/60 sm:max-w-[13rem]">
            <svg className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <select
              value={order.assigneeId || ''}
              onChange={(e) => handleAssigneeChange(e.target.value)}
              aria-label="Mitarbeiter"
              title="Mitarbeiter zuweisen"
              className="h-8 w-full cursor-pointer appearance-none truncate rounded-full bg-transparent py-0 pl-8 pr-7 text-xs text-slate-200 outline-none [&>option]:bg-slate-900 [&>option]:text-slate-100"
            >
              <option value="">Nicht zugewiesen</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
            <svg className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
            </svg>
          </div>

          {/* Auf dem Handy nur zeigen, wenn es den Shop-Auftrag WIRKLICH gibt:
              "Kein Shop" ist die Abwesenheit einer Information und hat dem
              Mitarbeiterfeld so viel Breite genommen, dass von "Admin" nur
              noch "A" uebrig blieb. Auf breiten Schirmen ist Platz genug. */}
          {order.wcOrderId ? (
            <span className="shrink-0 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-medium text-emerald-200">
              Shop #{order.wcOrderId}
            </span>
          ) : (
            <span className="hidden shrink-0 rounded-full bg-slate-800 px-2.5 py-1 text-[11px] font-medium text-slate-400 sm:inline-block">
              Kein Shop
            </span>
          )}
        </div>

        {/* Sechs Segmente statt Prozentbalken — die Zahl war nur Position durch
            Anzahl und gaukelte eine Genauigkeit vor, die es nicht gibt. */}
        <div
          className="mt-2 flex gap-1"
          title={`Schritt ${statusIndex + 1} von ${WORKFLOW_STATUSES.length}: ${WORKFLOW_STATUS_LABEL[normalizedStatus]}`}
        >
          {WORKFLOW_STATUSES.map((statusKey, index) => (
            <span
              key={statusKey}
              className={`h-1 flex-1 rounded-full transition-colors ${index <= statusIndex ? 'bg-sky-500' : 'bg-slate-800'}`}
            />
          ))}
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
