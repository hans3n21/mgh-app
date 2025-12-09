'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  getPresetForOrderType,
  getCategoriesForOrderType,
  getFieldsForCategory,
  getRequiredFieldsForCategory,
  getImageScopesForOrderType,
  isFieldRequired,
  shouldShowField,
  getDefaultValues,
  sortSpecsByDefinedOrder,
  FIELD_LABELS,
  CATEGORY_LABELS,
  CategoryKey,
  ImageScope
} from '@/lib/order-presets';
import ImageUploader from './ImageUploader';

import MessageSystem from './MessageSystem';
import ImageCarouselModal, { type CarouselImage } from './ImageCarouselModal';
import AutoFillInput from '@/components/AutoFillInput';
import BindingInput from '@/components/BindingInput';
import PickguardInput from '@/components/PickguardInput';
import BatteryCompartmentInput from '@/components/BatteryCompartmentInput';
import SpokewheelInput from '@/components/SpokewheelInput';
import NeckBindingInput from '@/components/NeckBindingInput';
import DatasheetPDFGenerator from '@/components/DatasheetPDFGenerator';
import { AUTO_FIELDS } from '@/lib/autofill-data';
import { useRef } from 'react';

// Komponente für Bild-Anhänge in der Kommunikation
function ImageAttachmentPanel({ images }: { images: OrderImage[] }) {
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set());

  const toggleImage = (imageId: string) => {
    setSelectedImages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(imageId)) {
        newSet.delete(imageId);
      } else {
        newSet.add(imageId);
      }
      return newSet;
    });
  };

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/30 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="text-sm font-medium">📷 Auftragsbilder</div>
          <span className="text-xs text-slate-400">({images?.length || 0})</span>
          {selectedImages.size > 0 && (
            <span className="text-xs bg-sky-600 text-white px-2 py-0.5 rounded">
              {selectedImages.size} ausgewählt
            </span>
          )}
        </div>
        {selectedImages.size > 0 && (
          <button
            onClick={() => setSelectedImages(new Set())}
            className="text-xs text-slate-400 hover:text-slate-300"
          >
            Zurücksetzen
          </button>
        )}
      </div>
      <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-2">
        {images?.map((img) => (
          <div key={img.id} className="relative group">
            <img
              src={img.path}
              className={`h-12 w-full object-cover rounded cursor-pointer border-2 transition-colors ${selectedImages.has(img.id)
                ? 'border-sky-500 shadow-lg shadow-sky-500/25'
                : 'border-slate-600 hover:border-slate-400'
                }`}
              title={img.comment || 'Als Anhang markieren'}
              onClick={() => toggleImage(img.id)}
            />
            {selectedImages.has(img.id) && (
              <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-sky-600 rounded-full flex items-center justify-center">
                <span className="text-white text-xs">✓</span>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="text-xs text-slate-500 mt-2">
        💡 Klicke auf Bilder, um sie als Anhang zu markieren
      </div>
    </div>
  );
}

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

const TYPE_LABEL: Record<string, string> = {
  GUITAR: 'Gitarrenbau',
  BODY: 'Body',
  NECK: 'Hals',
  REPAIR: 'Reparatur',
  PICKGUARD: 'Pickguard',
  PICKUPS: 'Tonabnehmer',
  ENGRAVING: 'Gravur',
  FINISH_ONLY: 'Lackierung',
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
  scope?: string;
  fieldKey?: string;
  createdAt: Date;
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

interface OrderDetailTabsNewProps {
  orderId: string;
  orderType: string;
  specs: OrderSpec[];
  images: OrderImage[];
  messages: Message[];
  priceItems: PriceItem[];
  status: string;
  assigneeId: string | null;
  users: Array<{ id: string; name: string }>;
  currentUserId: string;
  order: {
    id: string;
    title: string;
    type: string;
    status: string;
    createdAt: Date;
    customer: { id: string; name: string; email?: string; phone?: string } | null;
    assignee: { id: string; name: string } | null;
    latestDatasheet?: { version: string; updatedAt: string };
  };
  paymentStatus?: string | null;
  onStatusChange: (status: string) => void;
  onAssigneeChange: (assigneeId: string) => void;
  onImagesChange: (images: OrderImage[]) => void;
  onMessagesChange: (messages: Message[]) => void;
  onPaymentStatusChange?: (paymentStatus: string) => void;
  shopMode?: 'full' | 'deposit' | 'balance';
  shopAmount?: string;
  onShopOptionsChange?: (mode: 'full' | 'deposit' | 'balance', amount: string) => void;
  amountLocked?: boolean;
}

export default function OrderDetailTabsNew({
  orderId,
  orderType,
  specs,
  images,
  messages,
  status,
  assigneeId,
  users,
  currentUserId,
  order,
  paymentStatus,
  onStatusChange,
  onAssigneeChange,
  onImagesChange,
  onMessagesChange,
  onPaymentStatusChange,
  shopMode = 'full',
  shopAmount = '',
  onShopOptionsChange,
  amountLocked = false,
}: OrderDetailTabsNewProps) {
  const [activeTab, setActiveTab] = useState('spec');
  const [activeCategories, setActiveCategories] = useState<Set<CategoryKey>>(() => {
    // Standardmäßig alle Kategorien anzeigen
    const categories = getCategoriesForOrderType(orderType);
    return new Set(categories);
  });
  const [splitPayment, setSplitPayment] = useState<boolean>(false);
  const [extrasOpen, setExtrasOpen] = useState<boolean>(false);
  const [isLocked, setIsLocked] = useState<boolean>(amountLocked);
  const isGuitar = orderType === 'GUITAR';
  const [datasheetVersion, setDatasheetVersion] = useState<number | undefined>(undefined);
  const [datasheetUpdatedAt, setDatasheetUpdatedAt] = useState<string | undefined>(undefined);

  // Anzeigeformat für Betrag: ohne überflüssige Nachkommastellen, mit € in einer Zeile
  const formattedAmount = (() => {
    const raw = (shopAmount || '').replace(',', '.').trim();
    const n = Number(raw);
    if (Number.isFinite(n)) {
      // de-DE, aber ohne erzwungene 2 Nachkommastellen
      return new Intl.NumberFormat('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n) + ' €';
    }
    return (shopAmount || '') + ' €';
  })();
  const [specValues, setSpecValues] = useState<Record<string, string>>(() => {
    const defaultValues = getDefaultValues(orderType);
    // Sortiere Specs nach der definierten Reihenfolge
    const sortedSpecs = sortSpecsByDefinedOrder(specs, orderType);

    // Entferne Duplikate: behalte den "besten" Wert pro Key
    // Strategie: längerer Wert bevorzugt (vollständiger), sonst neuerer (spätere CUID)
    const uniqueSpecsMap = new Map<string, any>();
    for (const spec of sortedSpecs) {
      const existing = uniqueSpecsMap.get(spec.key);
      if (!existing) {
        uniqueSpecsMap.set(spec.key, spec as any);
      } else {
        const existingLength = existing.value.length;
        const currentLength = spec.value.length;
        if (currentLength > existingLength) {
          uniqueSpecsMap.set(spec.key, spec as any);
        } else if (currentLength === existingLength && (spec as any).id > existing.id) {
          // Gleiche Länge: neuerer Eintrag (spätere CUID)
          uniqueSpecsMap.set(spec.key, spec as any);
        }
      }
    }

    const currentValues = Array.from(uniqueSpecsMap.values()).reduce(
      (acc, spec) => ({ ...acc, [spec.key]: spec.value }),
      {}
    );
    return { ...defaultValues, ...currentValues };
  });
  const [saving, setSaving] = useState(false);
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [lightbox, setLightbox] = useState<{ open: boolean; index: number }>({ open: false, index: 0 });
  const messageSystemRef = useRef<{ attachPDF: (blob: Blob, filename: string) => void }>(null);
  const router = useRouter();

  // Kunde bearbeiten (Inline-Form)
  const [editingCustomer, setEditingCustomer] = useState(false);
  const [customerDraft, setCustomerDraft] = useState(() => ({
    name: order.customer?.name || '',
    email: order.customer?.email || '',
    phone: order.customer?.phone || '',
    addressLine1: (order.customer as any)?.addressLine1 || '',
    postalCode: (order.customer as any)?.postalCode || '',
    city: (order.customer as any)?.city || '',
    country: (order.customer as any)?.country || 'DE',
  }));

  const startEditCustomer = () => {
    setCustomerDraft({
      name: order.customer?.name || '',
      email: order.customer?.email || '',
      phone: order.customer?.phone || '',
      addressLine1: (order.customer as any)?.addressLine1 || '',
      postalCode: (order.customer as any)?.postalCode || '',
      city: (order.customer as any)?.city || '',
      country: (order.customer as any)?.country || 'DE',
    });
    setEditingCustomer(true);
  };

  const saveCustomer = async () => {
    if (!order.customer) return;
    const payload = { id: order.customer.id, ...customerDraft } as any;
    const res = await fetch('/api/customers', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) { alert('Kundendaten konnten nicht aktualisiert werden'); return; }
    const upd = await res.json();
    // Sofort im UI anzeigen
    (order as any).customer = upd;
    setEditingCustomer(false);
    // Seite aktualisieren, damit alle Konsumenten (z. B. Shop-Export) die neuen Daten sehen
    router.refresh();
  };

  // Get preset configuration for this order type
  const preset = useMemo(() => getPresetForOrderType(orderType), [orderType]);
  const categories = useMemo(() => getCategoriesForOrderType(orderType), [orderType]);
  const imageScopes = useMemo(() => getImageScopesForOrderType(orderType), [orderType]);

  // Initialize active categories with first category
  useState(() => {
    if (categories.length > 0) {
      setActiveCategories(new Set([categories[0]]));
    }
  });

  const tabs = [
    { id: 'spec', label: 'Datenblatt' },
    { id: 'images', label: 'Bilder' },
    { id: 'comm', label: 'Kommunikation' },
    { id: 'details', label: 'Details' },
  ];

  const updateSpec = async (key: string, value: string) => {
    // Skip if value unchanged
    if ((specValues[key] ?? '') === (value ?? '')) return;

    setSpecValues(prev => ({ ...prev, [key]: value }));

    if (validationErrors[key]) {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[key];
        return newErrors;
      });
    }

    // Debounced save
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    setSaving(true);
    saveTimerRef.current = setTimeout(async () => {
      try {
        await fetch(`/api/orders/${orderId}/spec`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [key]: value }),
        });
      } catch (error) {
        console.error('Fehler beim Speichern:', error);
      } finally {
        setSaving(false);
      }
    }, 500);
  };

  // Lade neueste Datenblatt-Version (pro Auftrag + Typ)
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}/datasheet/latest?type=${encodeURIComponent(orderType)}`);
        if (!active) return;
        if (res.ok) {
          const json = await res.json();
          if (json?.ok && json?.datasheet) {
            setDatasheetVersion(json.datasheet.version);
            setDatasheetUpdatedAt(json.datasheet.updatedAt);
          } else {
            setDatasheetVersion(undefined);
            setDatasheetUpdatedAt(undefined);
          }
        } else {
          setDatasheetVersion(undefined);
          setDatasheetUpdatedAt(undefined);
        }
      } catch {
        setDatasheetVersion(undefined);
        setDatasheetUpdatedAt(undefined);
      }
    })();
    return () => { active = false; };
  }, [orderId, orderType]);

  const validateRequiredFields = (): boolean => {
    const errors: Record<string, string> = {};
    let hasErrors = false;

    // Check required fields for active categories
    activeCategories.forEach(category => {
      const requiredFields = getRequiredFieldsForCategory(orderType, category);
      const categoryFields = getFieldsForCategory(orderType, category);

      requiredFields.forEach(fieldKey => {
        if (categoryFields.includes(fieldKey)) {
          const value = specValues[fieldKey];
          if (!value || value.trim() === '') {
            errors[fieldKey] = `${FIELD_LABELS[fieldKey] || fieldKey} ist erforderlich`;
            hasErrors = true;
          }
        }
      });
    });

    setValidationErrors(errors);
    return !hasErrors;
  };

  const toggleCategory = (category: CategoryKey) => {
    setActiveCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(category)) {
        newSet.delete(category);
      } else {
        newSet.add(category);
      }
      return newSet;
    });
  };

  // Update image function for lightbox
  const updateImage = async (id: string, patch: Partial<OrderImage>) => {
    const res = await fetch(`/api/orders/${orderId}/images`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...patch }),
    });
    if (res.ok) {
      const updated = await res.json();
      onImagesChange(images?.map((img) => (img.id === id ? updated : img)) || []);
    }
  };

  // Delete image function for lightbox
  const deleteImage = async (imageId: string) => {
    try {
      const response = await fetch(`/api/orders/${orderId}/images?imageId=${imageId}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        onImagesChange(images?.filter(img => img.id !== imageId) || []);
      }
    } catch (error) {
      console.error('Fehler beim Löschen:', error);
      alert('Fehler beim Löschen des Bildes');
    }
  };

  // Filter images by active categories
  const filteredImages = useMemo(() => {
    if (activeTab !== 'images' || !Array.isArray(images)) return images || [];

    const activeCategoryArray = Array.from(activeCategories);
    if (activeCategoryArray.length === 0) return images;

    return images.filter(image =>
      !image.scope || activeCategoryArray.includes(image.scope as CategoryKey)
    );
  }, [images, activeCategories, activeTab]);

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

        {Object.keys(validationErrors).length > 0 && (
          <div className="text-xs text-red-400">
            {Object.keys(validationErrors).length} Pflichtfeld(er) fehlen
          </div>
        )}
      </div>

      {/* Tabs - nur auf Desktop */}
      <div className="hidden md:flex flex-wrap gap-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-lg px-3 py-1.5 text-sm ${activeTab === tab.id
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
              <h3 className="font-semibold">Datenblatt - {TYPE_LABEL[orderType] || orderType}</h3>
              <div className="flex items-center gap-3">
                {/* Datenblatt aktualisieren Button */}
                <button
                  onClick={() => {
                    // Seite neu laden um aktuellste Daten zu bekommen
                    window.location.reload();
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-600 hover:bg-slate-500 rounded-lg text-slate-200"
                  title="Datenblatt mit neuesten Änderungen aktualisieren"
                >
                  🔄 Aktualisieren
                </button>

                {/* Direkter PDF-Download */}
                <DatasheetPDFGenerator
                  orderId={orderId}
                  orderTitle={order.title}
                  orderType={orderType}
                  customerName={order.customer?.name || 'Unbekannt'}
                  specs={specs}
                  activeCategories={activeCategories}
                  assigneeName={assigneeId ? users.find(u => u.id === assigneeId)?.name : undefined}
                  finalAmount={shopAmount}
                  paymentStatus={paymentStatus || undefined}
                  buttonText="📄 PDF"
                  // Kein onPDFGenerated = direkter Download
                  datasheetVersion={datasheetVersion}
                  datasheetUpdatedAt={datasheetUpdatedAt}
                  stringCount={specValues['string_count'] || '–'}
                />
              </div>
            </div>

            {/* Category Chips - nur anzeigen wenn mehr als eine Kategorie */}
            {categories.length > 1 && (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setActiveCategories(new Set(categories))}
                  className={`rounded-full px-3 py-1.5 text-sm ${activeCategories.size === categories.length ? 'bg-slate-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                >
                  Alle
                </button>
                {categories.map((category) => (
                  <button
                    key={category}
                    onClick={() => setActiveCategories(new Set([category]))}
                    className={`rounded-full px-3 py-1.5 text-sm ${activeCategories.has(category) && activeCategories.size === 1
                      ? 'bg-slate-600 text-white'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                  >
                    {CATEGORY_LABELS[category]}
                  </button>
                ))}
              </div>
            )}

            {/* Dynamic Form Fields by Category */}
            <div className="space-y-6">
              {Array.from(activeCategories).map((category) => {
                const categoryFields = getFieldsForCategory(orderType, category);
                if (categoryFields.length === 0) return null;

                return (
                  <div key={category} className="space-y-3">
                    <h4 className="text-sm font-medium text-slate-300 border-b border-slate-800 pb-2">
                      {CATEGORY_LABELS[category]}
                    </h4>

                    {/* Category Images: nur anzeigen, wenn vorhanden */}
                    {images?.some(img => img.scope === category) && (
                      <div className="mb-4">
                        <div className="text-xs text-slate-400 mb-2">
                          Bilder für {CATEGORY_LABELS[category]}
                        </div>
                        <div className="flex gap-2 overflow-x-auto pb-2">
                          {images
                            .filter(img => img.scope === category)
                            .slice(0, 4)
                            .map((image, idx) => (
                              <div
                                key={image.id}
                                className="flex-shrink-0 w-16 h-16 rounded-lg bg-slate-800 border border-slate-700 overflow-hidden cursor-pointer hover:border-slate-500 transition-colors"
                                onClick={() => {
                                  // Finde den Index des Bildes in der kompletten Bilderliste
                                  const imageIndex = images?.findIndex(img => img.id === image.id) || 0;
                                  setLightbox({ open: true, index: imageIndex });
                                }}
                                title={image.comment || 'Bild anzeigen'}
                              >
                                <img
                                  src={image.path}
                                  alt={image.comment || 'Bild'}
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    const target = e.target as HTMLImageElement;
                                    target.style.display = 'none';
                                    const parent = target.parentElement;
                                    if (parent) {
                                      parent.innerHTML = '<div class="w-full h-full flex items-center justify-center text-slate-500 text-xs">❌</div>';
                                    }
                                  }}
                                />
                              </div>
                            ))
                          }
                        </div>
                      </div>
                    )}

                    {/* Category Fields - Word-Style Layout: erste Hälfte links, zweite Hälfte rechts */}
                    <div className="grid sm:grid-cols-2 gap-3 text-sm">
                      {(() => {
                        const halfLength = Math.ceil(categoryFields.length / 2);
                        const leftFields = categoryFields.slice(0, halfLength);
                        const rightFields = categoryFields.slice(halfLength);

                        return (
                          <>
                            {/* Linke Spalte */}
                            <div className="space-y-3">
                              {leftFields.map((fieldKey) => {
                                const isRequired = isFieldRequired(orderType, category, fieldKey);
                                const hasError = validationErrors[fieldKey];
                                const label = FIELD_LABELS[fieldKey] || fieldKey;

                                // Bedingte Feldanzeige für Oberflächenbehandlung
                                if (category === 'oberflaeche' && orderType === 'FINISH_ONLY') {
                                  const oberflaeche_typ = specValues['oberflaeche_typ'] || '';
                                  if (!shouldShowField(fieldKey, oberflaeche_typ)) {
                                    return null;
                                  }
                                }


                                return (
                                  <label key={fieldKey} className="block">
                                    <div className="text-xs text-slate-400 mb-1 flex items-center gap-1">
                                      {label}
                                      {isRequired && (
                                        <span className="text-red-400">*</span>
                                      )}
                                    </div>

                                    {fieldKey === 'pickguard' ? (
                                      <PickguardInput
                                        value={specValues[fieldKey] || ''}
                                        onChange={(v) => updateSpec(fieldKey, v)}
                                        hasError={!!hasError}
                                      />
                                    ) : fieldKey === 'battery_compartment' ? (
                                      <BatteryCompartmentInput
                                        value={specValues[fieldKey] || ''}
                                        onChange={(v) => updateSpec(fieldKey, v)}
                                        hasError={!!hasError}
                                      />
                                    ) : fieldKey === 'spokewheel' ? (
                                      <SpokewheelInput
                                        value={specValues[fieldKey] || ''}
                                        onChange={(v) => updateSpec(fieldKey, v)}
                                        hasError={!!hasError}
                                      />
                                    ) : fieldKey === 'neck_binding' ? (
                                      <NeckBindingInput
                                        value={specValues[fieldKey] || ''}
                                        onChange={(v) => updateSpec(fieldKey, v)}
                                        hasError={!!hasError}
                                      />
                                    ) : fieldKey === 'body_binding' ? (
                                      <BindingInput
                                        value={specValues[fieldKey] || ''}
                                        onChange={(v) => updateSpec(fieldKey, v)}
                                        hasError={!!hasError}
                                      />
                                    ) : AUTO_FIELDS.has(fieldKey) ? (
                                      <AutoFillInput
                                        fieldKey={fieldKey}
                                        value={specValues[fieldKey] || ''}
                                        onChange={(v) => updateSpec(fieldKey, v)}
                                        placeholder={isRequired ? 'Pflichtfeld...' : 'Wert eingeben...'}
                                        hasError={!!hasError}
                                      />
                                    ) : (
                                      <input
                                        value={specValues[fieldKey] || ''}
                                        onChange={(e) => updateSpec(fieldKey, e.target.value)}
                                        className={`w-full rounded bg-slate-950 border px-2 py-1.5 ${hasError ? 'border-red-500 focus:border-red-400' : 'border-slate-800 focus:border-slate-600'}`}
                                        placeholder={isRequired ? 'Pflichtfeld...' : 'Wert eingeben...'}
                                      />
                                    )}

                                    {hasError && <div className="text-xs text-red-400 mt-1">{hasError}</div>}
                                  </label>
                                );
                              })}
                            </div>

                            {/* Rechte Spalte */}
                            <div className="space-y-3">
                              {rightFields.map((fieldKey) => {
                                const isRequired = isFieldRequired(orderType, category, fieldKey);
                                const hasError = validationErrors[fieldKey];
                                const label = FIELD_LABELS[fieldKey] || fieldKey;

                                // Bedingte Feldanzeige für Oberflächenbehandlung
                                if (category === 'oberflaeche' && orderType === 'FINISH_ONLY') {
                                  const oberflaeche_typ = specValues['oberflaeche_typ'] || '';
                                  if (!shouldShowField(fieldKey, oberflaeche_typ)) {
                                    return null;
                                  }
                                }

                                return (
                                  <label key={fieldKey} className="block">
                                    <div className="text-xs text-slate-400 mb-1 flex items-center gap-1">
                                      {label}
                                      {isRequired && (
                                        <span className="text-red-400">*</span>
                                      )}
                                    </div>

                                    {fieldKey === 'pickguard' ? (
                                      <PickguardInput
                                        value={specValues[fieldKey] || ''}
                                        onChange={(v) => updateSpec(fieldKey, v)}
                                        hasError={!!hasError}
                                      />
                                    ) : fieldKey === 'battery_compartment' ? (
                                      <BatteryCompartmentInput
                                        value={specValues[fieldKey] || ''}
                                        onChange={(v) => updateSpec(fieldKey, v)}
                                        hasError={!!hasError}
                                      />
                                    ) : fieldKey === 'spokewheel' ? (
                                      <SpokewheelInput
                                        value={specValues[fieldKey] || ''}
                                        onChange={(v) => updateSpec(fieldKey, v)}
                                        hasError={!!hasError}
                                      />
                                    ) : fieldKey === 'neck_binding' ? (
                                      <NeckBindingInput
                                        value={specValues[fieldKey] || ''}
                                        onChange={(v) => updateSpec(fieldKey, v)}
                                        hasError={!!hasError}
                                      />
                                    ) : fieldKey === 'body_binding' ? (
                                      <BindingInput
                                        value={specValues[fieldKey] || ''}
                                        onChange={(v) => updateSpec(fieldKey, v)}
                                        hasError={!!hasError}
                                      />
                                    ) : AUTO_FIELDS.has(fieldKey) ? (
                                      <AutoFillInput
                                        fieldKey={fieldKey}
                                        value={specValues[fieldKey] || ''}
                                        onChange={(v) => updateSpec(fieldKey, v)}
                                        placeholder={isRequired ? 'Pflichtfeld...' : 'Wert eingeben...'}
                                        hasError={!!hasError}
                                      />
                                    ) : (
                                      <input
                                        value={specValues[fieldKey] || ''}
                                        onChange={(e) => updateSpec(fieldKey, e.target.value)}
                                        className={`w-full rounded bg-slate-950 border px-2 py-1.5 ${hasError ? 'border-red-500 focus:border-red-400' : 'border-slate-800 focus:border-slate-600'}`}
                                        placeholder={isRequired ? 'Pflichtfeld...' : 'Wert eingeben...'}
                                      />
                                    )}

                                    {hasError && <div className="text-xs text-red-400 mt-1">{hasError}</div>}
                                  </label>
                                );
                              })}
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                );
              })}

              {activeCategories.size === 0 && (
                <div className="text-center py-8 text-slate-500">
                  <div className="text-4xl mb-2">📋</div>
                  <div className="text-lg font-medium mb-1">Kategorie auswählen</div>
                  <div className="text-sm">Wähle eine oder mehrere Kategorien aus, um Felder anzuzeigen</div>
                </div>
              )}
            </div>

            {/* Validation Summary */}
            {Object.keys(validationErrors).length > 0 && (
              <div className="border border-red-500/20 bg-red-500/10 rounded-lg p-3">
                <div className="text-sm font-medium text-red-400 mb-2">
                  Pflichtfelder fehlen:
                </div>
                <ul className="text-xs text-red-300 space-y-1">
                  {Object.entries(validationErrors).map(([field, error]) => (
                    <li key={field}>• {error}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Zahlungs-Optionen (Shop) */}
            <div className="rounded-xl border border-slate-800 p-3">
              {/* Kopfzeile: nur Titel + Stift */}
              <div className="flex flex-wrap items-center justify-between mb-2 gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">Endbetrag</span>
                  <button
                    id="endbetrag-edit"
                    className={`${isLocked ? '' : 'hidden'} rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800`}
                    title="Endbetrag bearbeiten"
                    onClick={() => {
                      setIsLocked(false);
                    }}
                  >✏️</button>
                </div>
                <div className="flex items-center gap-3">
                  {isGuitar && (
                    <label className="flex items-center gap-2 text-slate-300 text-xs">
                      <input type="checkbox" className="h-3.5 w-3.5" onChange={(e) => setSplitPayment(e.target.checked)} checked={splitPayment} />
                      In Raten zahlen
                    </label>
                  )}
                  <button
                    className="text-xs text-emerald-400 hover:text-emerald-300"
                    title="Extrakosten hinzufügen"
                    onClick={() => setExtrasOpen(v => !v)}
                  >{extrasOpen ? '− Extrakosten' : '＋ Extrakosten'}</button>
                </div>
              </div>
              {/* Zeile 2: links Summe/Input, rechts Buttons + Checkbox */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span id="endbetrag-display" className={`text-slate-200 font-bold underline text-lg whitespace-nowrap ${isLocked ? '' : 'hidden'}`}>{formattedAmount}</span>
                  <div className={`${isLocked ? 'hidden' : 'flex'} items-center gap-2`}>
                    <input
                      id="endbetrag-input"
                      value={shopAmount}
                      onChange={(e) => onShopOptionsChange?.(shopMode, e.target.value)}
                      placeholder="z.B. 3000"
                      className={`w-32 rounded bg-slate-950 border border-slate-700 px-2 py-1`}
                    />
                    <button
                      id="endbetrag-ok"
                      className={`rounded bg-emerald-600 hover:bg-emerald-500 px-2 py-1 text-xs`}
                      title="Endbetrag speichern"
                      onClick={async () => {
                        const inputEl = document.getElementById('endbetrag-input') as HTMLInputElement | null;
                        const input = inputEl?.value || '';
                        const normalized = input.replace(',', '.');
                        const parsed = parseFloat(normalized);
                        if (isNaN(parsed) || parsed <= 0) { alert('Bitte gültigen Endbetrag eingeben.'); return; }
                        const amountCents = Math.round(parsed * 100);
                        const res = await fetch(`/api/orders/${orderId}`, {
                          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ finalAmountCents: amountCents })
                        });
                        if (!res.ok) { alert('Konnte Endbetrag nicht speichern'); return; }
                        onShopOptionsChange?.(shopMode, String(parsed));
                        setIsLocked(true);
                      }}
                    >OK</button>
                  </div>
                  {/* Zahlungsstatus Checkboxen */}
                  <div className="flex items-center gap-4 ml-0 sm:ml-4">
                    <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={paymentStatus === 'deposit'}
                        disabled={paymentStatus === 'paid'}
                        onChange={async (e) => {
                          const newStatus = e.target.checked ? 'deposit' : 'open';
                          onPaymentStatusChange?.(newStatus);
                        }}
                        className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-emerald-500 focus:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                      <span className={paymentStatus === 'paid' ? 'opacity-50' : ''}>Angezahlt</span>
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={paymentStatus === 'paid'}
                        onChange={async (e) => {
                          const newStatus = e.target.checked ? 'paid' : 'open';
                          onPaymentStatusChange?.(newStatus);
                        }}
                        className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-emerald-500 focus:ring-emerald-500"
                      />
                      <span>Bezahlt</span>
                    </label>
                  </div>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto justify-start sm:justify-end">
                  {!(isGuitar && splitPayment) && (
                    <button
                      onClick={() => {
                        const value = isLocked ? shopAmount : (document.getElementById('endbetrag-input') as HTMLInputElement | null)?.value || '';
                        const isEmpty = !value || !value.trim();
                        if (isEmpty) { alert('Bitte Endbetrag eintragen.'); return; }
                        if (!confirm('Möchten Sie den Auftrag jetzt an WooCommerce übertragen?')) return;
                        document.dispatchEvent(new CustomEvent('sync-to-woo', { detail: { mode: 'full' } } as CustomEventInit));
                      }}
                      className="rounded bg-sky-600 hover:bg-sky-500 px-3 py-1.5 text-xs font-medium w-full sm:w-auto"
                    >Auftrag in Shop</button>
                  )}
                  {isGuitar && splitPayment && (
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <button
                        title="1. Zahlung (Anzahlung)"
                        className="rounded bg-sky-600 hover:bg-sky-500 px-2 py-1 text-xs flex-1 sm:flex-none"
                        onClick={() => {
                          const value = shopAmount;
                          if (!value || !value.trim()) { alert('Bitte Endbetrag eintragen.'); return; }
                          if (!confirm('Anzahlung jetzt in WooCommerce anlegen?')) return;
                          document.dispatchEvent(new CustomEvent('sync-to-woo', { detail: { mode: 'deposit' } } as CustomEventInit));
                        }}
                      >Zahlung 1</button>
                      <button
                        title="2. Zahlung (Rest)"
                        className="rounded bg-sky-600 hover:bg-sky-500 px-2 py-1 text-xs flex-1 sm:flex-none"
                        onClick={() => {
                          const value = shopAmount;
                          if (!value || !value.trim()) { alert('Bitte Endbetrag eintragen.'); return; }
                          if (!confirm('Restzahlung jetzt in WooCommerce anlegen?')) return;
                          document.dispatchEvent(new CustomEvent('sync-to-woo', { detail: { mode: 'balance' } } as CustomEventInit));
                        }}
                      >Zahlung 2</button>
                    </div>
                  )}
                </div>
              </div>

              {/* Extrakosten (ein-/ausklappbar) */}
              {extrasOpen && (
                <div className="mt-3 rounded border border-slate-800 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-semibold">Extrakosten</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <input id="extra-amount" placeholder="Betrag (€)" className="w-28 rounded bg-slate-950 border border-slate-700 px-2 py-1" />
                    <input id="extra-label" placeholder="Begründung" className="min-w-52 flex-1 rounded bg-slate-950 border border-slate-700 px-2 py-1" />
                    <button
                      className="ml-auto rounded bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 text-xs font-medium"
                      onClick={async () => {
                        const amountStr = (document.getElementById('extra-amount') as HTMLInputElement | null)?.value || '';
                        const label = (document.getElementById('extra-label') as HTMLInputElement | null)?.value || '';
                        const normalized = amountStr.replace(',', '.');
                        const parsed = parseFloat(normalized);
                        if (!label.trim() || isNaN(parsed) || parsed <= 0) { alert('Bitte Betrag und Begründung angeben.'); return; }
                        const amountCents = Math.round(parsed * 100);
                        // Speichern
                        await fetch(`/api/orders/${orderId}/extras`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label, amountCents }) });
                        // Bestellung mit Produkt/Preis erzeugen (nutzt WC_PRODUCT_ID_WORKORDER, sonst Fee)
                        await fetch(`/api/orders/${orderId}/woocommerce`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'full', amountCents, customLabel: `Extra: ${label}` }) });
                        alert('Extrakosten-Bestellung angelegt');
                      }}
                    >Bestellung erzeugen</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'images' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Bilder</h3>
              <div className="text-xs text-slate-400">
                Scopes: {imageScopes.join(', ')}
              </div>
            </div>



            <ImageUploader
              orderId={orderId}
              images={images || []}
              allowedScopes={imageScopes}
              onImagesChange={onImagesChange}
            />
          </div>
        )}

        {activeTab === 'comm' && (
          <div className="space-y-3">
            <h3 className="font-semibold">Kommunikation</h3>
            <MessageSystem
              ref={messageSystemRef}
              orderId={orderId}
              messages={messages}
              currentUserId={currentUserId}
              onMessagesChange={onMessagesChange}
              images={images}
              orderTitle={order.title}
              orderType={orderType}
              customerName={order.customer?.name || 'Unbekannt'}
              specs={specs}
              activeCategories={activeCategories}
            />
          </div>
        )}



        {activeTab === 'details' && (
          <div className="space-y-4">
            <h3 className="font-semibold">Details</h3>

            <div className="grid sm:grid-cols-2 gap-4">
              {/* Kunde */}
              <div className="rounded-xl border border-slate-800 p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-semibold">Kunde</div>
                  {order.customer && (
                    <button
                      className="text-xs text-slate-400 hover:text-sky-400 flex items-center gap-1"
                      title={editingCustomer ? "Änderungen speichern" : "Kundendaten bearbeiten"}
                      onClick={editingCustomer ? saveCustomer : startEditCustomer}
                    >
                      {editingCustomer ? "💾 Speichern" : "✏️ Bearbeiten"}
                    </button>
                  )}
                </div>
                <div className="space-y-1">
                  {!editingCustomer && (
                    <div className="flex items-center gap-3">
                      <div className="w-4 h-4 flex items-center justify-center">
                        <span className="text-slate-400 text-sm">👤</span>
                      </div>
                      <span className="text-sm text-slate-300 font-medium">
                        {order.customer?.name || 'Unbekannt'}
                      </span>
                    </div>
                  )}
                  {!editingCustomer && order.customer?.email && (
                    <div className="flex items-center gap-3">
                      <div className="w-4 h-4 flex items-center justify-center">
                        <span className="text-slate-400 text-sm">✉️</span>
                      </div>
                      <a
                        href={`mailto:${order.customer.email}`}
                        className="text-xs text-slate-400 hover:text-sky-400 transition-colors"
                      >
                        {order.customer.email}
                      </a>
                    </div>
                  )}
                  {!editingCustomer && order.customer?.phone && (
                    <div className="flex items-center gap-3">
                      <div className="w-4 h-4 flex items-center justify-center">
                        <span className="text-slate-400 text-sm">📞</span>
                      </div>
                      <a
                        href={`tel:${order.customer.phone}`}
                        className="text-xs text-slate-400 hover:text-green-400 transition-colors"
                      >
                        {order.customer.phone}
                      </a>
                    </div>
                  )}
                  {order.customer && !editingCustomer && (
                    <div>
                      {((order.customer as any).addressLine1 || (order.customer as any).city || (order.customer as any).postalCode) ? (
                        <div className="flex items-start gap-3">
                          <div className="w-4 h-4 flex items-center justify-center mt-0.5">
                            <span className="text-slate-400 text-sm">🏠</span>
                          </div>
                          <div className="text-xs text-slate-400 leading-relaxed">
                            {(order.customer as any).addressLine1 && <div>{(order.customer as any).addressLine1}</div>}
                            {(((order.customer as any).postalCode || (order.customer as any).city || (order.customer as any).country)) && (
                              <div>
                                {`${(order.customer as any).postalCode || ''} ${(order.customer as any).city || ''}${((order.customer as any).country && (order.customer as any).country !== 'DE') ? `, ${(order.customer as any).country}` : ''}`}
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          <div className="w-4 h-4 flex items-center justify-center">
                            <span className="text-slate-500 text-sm">🏠</span>
                          </div>
                          <span className="text-xs text-slate-500">Keine Adresse hinterlegt</span>
                        </div>
                      )}
                    </div>
                  )}
                  {order.customer && editingCustomer && (
                    <div className="mt-2 space-y-2 text-sm">
                      <input className="w-full rounded bg-slate-950 border border-slate-700 px-2 py-1" placeholder="Name" value={customerDraft.name} onChange={(e) => setCustomerDraft({ ...customerDraft, name: e.target.value })} />
                      <input className="w-full rounded bg-slate-950 border border-slate-700 px-2 py-1" placeholder="E-Mail" value={customerDraft.email} onChange={(e) => setCustomerDraft({ ...customerDraft, email: e.target.value })} />
                      <input className="w-full rounded bg-slate-950 border border-slate-700 px-2 py-1" placeholder="Telefon" value={customerDraft.phone} onChange={(e) => setCustomerDraft({ ...customerDraft, phone: e.target.value })} />
                      <input className="w-full rounded bg-slate-950 border border-slate-700 px-2 py-1" placeholder="Adresse (Zeile 1)" value={customerDraft.addressLine1} onChange={(e) => setCustomerDraft({ ...customerDraft, addressLine1: e.target.value })} />
                      <div className="grid grid-cols-3 gap-2">
                        <input className="rounded bg-slate-950 border border-slate-700 px-2 py-1" placeholder="PLZ" value={customerDraft.postalCode} onChange={(e) => setCustomerDraft({ ...customerDraft, postalCode: e.target.value })} />
                        <input className="rounded bg-slate-950 border border-slate-700 px-2 py-1" placeholder="Ort" value={customerDraft.city} onChange={(e) => setCustomerDraft({ ...customerDraft, city: e.target.value })} />
                        <input className="rounded bg-slate-950 border border-slate-700 px-2 py-1" placeholder="Land" value={customerDraft.country} onChange={(e) => setCustomerDraft({ ...customerDraft, country: e.target.value })} />
                      </div>
                      <div className="flex justify-end">
                        <button className="rounded border border-slate-700 px-3 py-1.5 text-xs hover:bg-slate-800" onClick={() => setEditingCustomer(false)}>Abbrechen</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Allgemein */}
              <div className="rounded-xl border border-slate-800 p-3">
                <div className="font-semibold mb-2">Allgemein</div>
                <div className="grid text-sm gap-2">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Zuständig</span>
                    <span>{order.assignee?.name || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Erstellt</span>
                    <span>{new Date(order.createdAt).toLocaleDateString('de-DE')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Specs</span>
                    <span>{specs.length}</span>
                  </div>

                </div>
              </div>
            </div>

            {/* Checkliste */}
            <div className="rounded-xl border border-slate-800 p-3">
              <div className="font-semibold mb-2">Checkliste</div>
              <ul className="text-sm space-y-1 text-slate-400">
                <li>• Material verfügbar</li>
                <li>• Maße bestätigt</li>
                <li>• Kundenfreigabe</li>
                <li>• Qualitätsprüfung</li>
              </ul>
            </div>

            {/* System-Details */}
            <div className="grid sm:grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-xs text-slate-400 mb-1">Auftrag-Typ</div>
                <div className="bg-slate-950 border border-slate-800 rounded px-2 py-1.5">
                  {TYPE_LABEL[orderType] || orderType}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-400 mb-1">Verfügbare Kategorien</div>
                <div className="bg-slate-950 border border-slate-800 rounded px-2 py-1.5">
                  {categories.map(cat => CATEGORY_LABELS[cat]).join(', ')}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-400 mb-1">Bild-Scopes</div>
                <div className="bg-slate-950 border border-slate-800 rounded px-2 py-1.5">
                  {imageScopes.join(', ')}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-400 mb-1">Pflichtfelder</div>
                <div className="bg-slate-950 border border-slate-800 rounded px-2 py-1.5 max-h-20 overflow-y-auto">
                  {categories.map(cat => {
                    const required = getRequiredFieldsForCategory(orderType, cat);
                    if (required.length === 0) return null;
                    return (
                      <div key={cat} className="text-xs">
                        <span className="font-medium">{CATEGORY_LABELS[cat]}:</span> {required.join(', ')}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Lightbox für Datenblatt-Bilder */}
      {lightbox.open && images && images.length > 0 && (
        <ImageCarouselModal
          images={images.map((img) => ({
            id: img.id,
            path: img.path,
            comment: img.comment,
            scope: img.scope,
            attach: img.attach,
            position: img.position,
          }))}
          index={lightbox.index}
          scopes={imageScopes}
          onClose={() => setLightbox({ open: false, index: 0 })}
          onUpdate={updateImage}
          onDelete={async (id) => {
            await deleteImage(id);
            setLightbox({ open: false, index: 0 });
          }}
        />
      )}

      {/* Mobile Navigation unten */}
      <div
        className="fixed left-0 right-0 bg-slate-900 border-t border-slate-800 md:hidden z-50"
        style={{
          bottom: '0px',
          margin: '0px',
          padding: '12px 8px 16px 8px'
        }}
      >
        <div className="flex justify-around items-center">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-colors ${activeTab === tab.id
                ? 'bg-sky-600 text-white'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
            >
              <div className="text-lg">
                {tab.id === 'spec' && '📋'}
                {tab.id === 'images' && '🖼️'}
                {tab.id === 'comm' && '💬'}
                {tab.id === 'details' && '📊'}
              </div>
              <span className="text-xs font-medium">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Padding unten für mobile Navigation */}
      <div className="h-24 md:hidden"></div>
    </div>
  );
}
