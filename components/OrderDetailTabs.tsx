'use client';

import { useState } from 'react';
import ImageUploader from './ImageUploader';
import ItemsManager from './ItemsManager';
import MessageSystem from './MessageSystem';

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

interface OrderSpec {
  id: string;
  key: string;
  value: string;
}

interface OrderImage {
  id: string;
  path: string;
  comment?: string;
  position: number;
  attach: boolean;
  createdAt: Date;
}

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

interface Message {
  id: string;
  body: string;
  createdAt: Date;
  senderType: string;
  sender?: { id: string; name: string } | null;
}

interface OrderDetailTabsProps {
  orderId: string;
  specs: OrderSpec[];
  images: OrderImage[];
  items: OrderItem[];
  messages: Message[];
  priceItems: PriceItem[];
  status: string;
  assigneeId: string | null;
  users: Array<{ id: string; name: string }>;
  currentUserId: string;
  onStatusChange: (status: string) => void;
  onAssigneeChange: (assigneeId: string) => void;
  onImagesChange: (images: OrderImage[]) => void;
  onItemsChange: (items: OrderItem[]) => void;
  onMessagesChange: (messages: Message[]) => void;
}

export default function OrderDetailTabs({
  orderId,
  specs,
  images,
  items,
  messages,
  priceItems,
  status,
  assigneeId,
  users,
  currentUserId,
  onStatusChange,
  onAssigneeChange,
  onImagesChange,
  onItemsChange,
  onMessagesChange,
}: OrderDetailTabsProps) {
  const [activeTab, setActiveTab] = useState('spec');
  const [specValues, setSpecValues] = useState<Record<string, string>>(
    specs.reduce((acc, spec) => ({ ...acc, [spec.key]: spec.value }), {})
  );
  const [saving, setSaving] = useState(false);

  const tabs = [
    { id: 'spec', label: 'Datenblatt' },
    { id: 'images', label: 'Bilder' },
    { id: 'comm', label: 'Kommunikation' },
    { id: 'items', label: 'Leistungen' },
    { id: 'details', label: 'Details' },
  ];

  const updateSpec = async (key: string, value: string) => {
    setSpecValues(prev => ({ ...prev, [key]: value }));
    
    // Debounced save
    setSaving(true);
    setTimeout(async () => {
      try {
        await fetch(`/api/orders/${orderId}/spec`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [key]: value }),
        });
        setSaving(false);
      } catch (error) {
        console.error('Fehler beim Speichern:', error);
        setSaving(false);
      }
    }, 500);
  };

  return (
    <div className="space-y-4">
      {/* Status Controls */}
      <div className="flex items-center gap-2">
        <select
          value={status}
          onChange={(e) => onStatusChange(e.target.value)}
          className="rounded-lg bg-slate-950 border border-slate-800 px-3 py-1.5 text-sm"
        >
          {Object.entries(STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        
        <select
          value={assigneeId || ''}
          onChange={(e) => onAssigneeChange(e.target.value)}
          className="rounded-lg bg-slate-950 border border-slate-800 px-3 py-1.5 text-sm"
        >
          <option value="">Nicht zugewiesen</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name}
            </option>
          ))}
        </select>

        {saving && (
          <div className="text-xs text-slate-400">Speichert...</div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              activeTab === tab.id
                ? 'bg-slate-200/10 text-white'
                : 'bg-slate-200/5 text-slate-300 hover:bg-slate-200/10'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="rounded-xl border border-slate-800 p-3">
        {activeTab === 'spec' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Datenblatt</h3>
              <div className="text-xs text-slate-400">
                {saving ? 'Speichert...' : 'Auto-Save aktiv'}
              </div>
            </div>
            
            <div className="grid sm:grid-cols-2 gap-3 text-sm">
              {specs.length === 0 ? (
                <div className="col-span-2 text-slate-500">
                  Keine Spezifikationen vorhanden. Erstelle neue mit den Feldern unten.
                </div>
              ) : (
                specs.map((spec) => (
                  <label key={spec.id} className="block">
                    <div className="text-xs text-slate-400 mb-1">{spec.key}</div>
                    <input
                      value={specValues[spec.key] || ''}
                      onChange={(e) => updateSpec(spec.key, e.target.value)}
                      className="w-full rounded bg-slate-950 border border-slate-800 px-2 py-1.5"
                      placeholder="Wert eingeben..."
                    />
                  </label>
                ))
              )}
            </div>

            {/* Quick Add Common Specs */}
            <div className="border-t border-slate-800 pt-3">
              <div className="text-xs text-slate-400 mb-2">Schnell hinzufügen:</div>
              <div className="flex flex-wrap gap-2">
                {['neck_construction', 'fretboard_scale', 'bridge_type', 'finish_body'].map((key) => (
                  <button
                    key={key}
                    onClick={() => updateSpec(key, '')}
                    className="text-xs rounded border border-slate-700 px-2 py-1 hover:bg-slate-800"
                  >
                    {key.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'images' && (
          <div className="space-y-3">
            <h3 className="font-semibold">Bilder</h3>
            <ImageUploader 
              orderId={orderId} 
              images={images} 
              onImagesChange={onImagesChange} 
            />
          </div>
        )}

        {activeTab === 'comm' && (
          <div className="space-y-3">
            <h3 className="font-semibold">Kommunikation</h3>
            <MessageSystem
              orderId={orderId}
              messages={messages}
              currentUserId={currentUserId}
              onMessagesChange={onMessagesChange}
            />
          </div>
        )}

        {activeTab === 'items' && (
          <div className="space-y-3">
            <h3 className="font-semibold">Leistungen</h3>
            <ItemsManager 
              orderId={orderId} 
              items={items} 
              priceItems={priceItems}
              onItemsChange={onItemsChange} 
            />
          </div>
        )}

        {activeTab === 'details' && (
          <div className="space-y-3">
            <h3 className="font-semibold">Details</h3>
            <div className="text-slate-500 text-sm">
              Weitere Details werden hier angezeigt.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
