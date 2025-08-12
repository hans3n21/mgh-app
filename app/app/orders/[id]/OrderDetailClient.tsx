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
  images: Array<{ id: string; path: string; comment?: string }>;
  messages: Array<{
    id: string;
    body: string;
    createdAt: Date;
    senderType: string;
    sender?: { id: string; name: string } | null;
  }>;
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

  // Lade Preisliste beim Mount
  React.useEffect(() => {
    fetch('/api/prices')
      .then(res => res.json())
      .then(data => setPriceItems(data))
      .catch(console.error);
  }, []);

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

  const handleImagesChange = (newImages: typeof order.images) => {
    setOrder({ ...order, images: newImages });
  };



  const handleMessagesChange = (newMessages: typeof order.messages) => {
    setOrder({ ...order, messages: newMessages });
  };

  const progress = statusToProgress(order.status);

  return (
    <div className="w-full space-y-4">
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
      />
    </div>
  );
}
