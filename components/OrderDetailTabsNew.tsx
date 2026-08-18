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
import { TOOLBAR_BUTTON } from '@/lib/ui-classes';

import MessageSystem from './MessageSystem';
import ImageCarouselModal, { type CarouselImage } from './ImageCarouselModal';
import AutoFillInput from '@/components/AutoFillInput';
import BindingInput from '@/components/BindingInput';
import PickguardInput from '@/components/PickguardInput';
import BatteryCompartmentInput from '@/components/BatteryCompartmentInput';
import SpokewheelInput from '@/components/SpokewheelInput';
import NeckBindingInput from '@/components/NeckBindingInput';
import HeadstockLogoInput from '@/components/HeadstockLogoInput';
import PickupMountInput from '@/components/PickupMountInput';
import DatasheetPDFGenerator from '@/components/DatasheetPDFGenerator';
import CustomerDatasheetActions from '@/components/CustomerDatasheetActions';
import SuggestionBanner from '@/components/SuggestionBanner';
import PhoneLink from '@/components/PhoneLink';
import { AUTO_FIELDS } from '@/lib/autofill-data';
import { useRef } from 'react';
import OrderParts from '@/components/OrderParts';
import CustomerSwitchModal from '@/components/CustomerSwitchModal';
import { suggestShipping } from '@/lib/shipping/suggest';

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
  priceText?: string | null;
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
    mails?: Array<{
      id: string;
      messageId?: string;
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
  };
  paymentStatus?: string | null;
  paymentMethod?: string | null;
  depositAmountCents?: number | null;
  depositPaidAt?: Date | string | null;
  paidAt?: Date | string | null;
  shippingCents?: number | null;
  onStatusChange: (status: string) => void;
  onAssigneeChange: (assigneeId: string) => void;
  onImagesChange: (images: OrderImage[]) => void;
  onMessagesChange: (messages: Message[]) => void;
  onPaymentStatusChange?: (paymentStatus: string) => void;
  onPaymentMethodChange?: (paymentMethod: 'paypal' | 'direktueberweisung' | null) => void;
  onDepositAmountChange?: (depositAmountCents: number | null) => void;
  onDepositPaidAtChange?: (date: string | null) => void;
  onPaidAtChange?: (date: string | null) => void;
  onShippingChange?: (shippingCents: number | null) => void;
  shopAmount?: string;
  onShopAmountChange?: (amount: string) => void;
  amountLocked?: boolean;
  showSpecsTab?: boolean;
  hasUnreadComm?: boolean;
  customerOtherOrdersCount?: number;
  initialTasks?: Array<{
    id: string;
    title: string;
    note: string | null;
    status: string;
    completedAt: string | null;
    createdAt: string;
    assignee: { id: string; name: string };
    creator: { id: string; name: string };
  }>;
}

export default function OrderDetailTabsNew({
  orderId,
  orderType,
  specs,
  images,
  messages,
  priceItems,
  users,
  currentUserId,
  order,
  paymentStatus,
  paymentMethod,
  depositAmountCents,
  depositPaidAt,
  paidAt,
  shippingCents,
  onImagesChange,
  onMessagesChange,
  onPaymentStatusChange,
  onPaymentMethodChange,
  onDepositAmountChange,
  onDepositPaidAtChange,
  onPaidAtChange,
  onShippingChange,
  shopAmount = '',
  onShopAmountChange,
  amountLocked = false,
  showSpecsTab = true,
  hasUnreadComm = false,
  customerOtherOrdersCount = 0,
  initialTasks,
}: OrderDetailTabsNewProps) {
  const LINKED_SPEC_KEYS: Record<string, string> = {
    body_surface_treatment: 'finish_body',
    finish_body: 'body_surface_treatment',
  };

  const [activeTab, setActiveTab] = useState('spec');
  const [activeCategories, setActiveCategories] = useState<Set<CategoryKey>>(() => {
    // Standardmäßig alle Kategorien anzeigen
    const categories = getCategoriesForOrderType(orderType);
    return new Set(categories);
  });
  const [extrasOpen, setExtrasOpen] = useState<boolean>(false);
  const [isLocked, setIsLocked] = useState<boolean>(amountLocked);
  const [depositInput, setDepositInput] = useState<string>('');
  const [shippingInput, setShippingInput] = useState<string>('');
  const [datasheetVersion, setDatasheetVersion] = useState<number | undefined>(undefined);
  const [datasheetUpdatedAt, setDatasheetUpdatedAt] = useState<string | undefined>(undefined);
  useEffect(() => {
    setDepositInput(depositAmountCents != null ? (depositAmountCents / 100).toString() : '');
  }, [depositAmountCents]);
  useEffect(() => {
    setShippingInput(shippingCents != null ? (shippingCents / 100).toString() : '');
  }, [shippingCents]);

  // Versand-Vorschlag aus der Preisliste: Kundenland → Versandzone, Auftragstyp
  // → Kategorie (Gitarre = Gitarrenversand, Rest = Klein-Paket), Freigrenze
  // gegen den Endbetrag. Nur solange nichts eingetragen ist — eine Handeingabe
  // wird nie überschrieben.
  const shippingSuggestion = useMemo(() => {
    if (shippingCents != null) return null;
    const country = (order.customer as any)?.country as string | undefined;
    const raw = (shopAmount || '').replace(',', '.').trim();
    const parsed = Number.parseFloat(raw);
    const finalAmountCents = Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
    return suggestShipping(priceItems, { country, orderType, finalAmountCents });
  }, [shippingCents, order.customer, shopAmount, orderType, priceItems]);

  // Datumshelfer für die Zahlungsdaten: <input type="date"> braucht YYYY-MM-DD
  // in LOKALER Zeit (toISOString käme in UTC und kippt nachts den Tag).
  const toDateInputValue = (value?: Date | string | null): string => {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const formatPaidDate = (value?: Date | string | null): string | null => {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('de-DE');
  };

  // Bearbeitungsmodus Datenblatt: standardmäßig aus, außer wenn noch keine Einträge
  const hasAnySpecEntries = useMemo(
    () => specs.some(s => s.value && s.value.trim() !== ''),
    [specs]
  );
  const [editingDatasheet, setEditingDatasheet] = useState(() => !hasAnySpecEntries);

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

  // Kunde wechseln / abspalten: Bearbeiten aendert den GETEILTEN Datensatz.
  // Haengt derselbe Kunde faelschlich an mehreren Auftraegen, ist der richtige
  // Weg, diesen Auftrag umzuhaengen — an einen anderen Bestandskunden oder an
  // einen neu angelegten Kunden mit den hier eingetippten Daten.
  const [switchCustomerOpen, setSwitchCustomerOpen] = useState(false);
  const [creatingCustomer, setCreatingCustomer] = useState(false);

  const saveAsNewCustomer = async () => {
    if (creatingCustomer) return;
    if (!customerDraft.name.trim()) { alert('Bitte Kundennamen eingeben'); return; }
    setCreatingCustomer(true);
    try {
      // Leere Strings raus: `email: ''` fiele sonst durch z.string().email().
      const fields = Object.fromEntries(
        Object.entries(customerDraft).filter(([, v]) => typeof v === 'string' && v.trim() !== '')
      );
      const createRes = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // forceNew: auch bei gleicher E-Mail einen echten neuen Datensatz
        // anlegen statt still den bestehenden Kunden zurückzugeben.
        body: JSON.stringify({ ...fields, forceNew: true }),
      });
      if (!createRes.ok) { alert('Neuer Kunde konnte nicht angelegt werden'); return; }
      const created = await createRes.json();

      const patchRes = await fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: created.id }),
      });
      if (!patchRes.ok) { alert('Auftrag konnte nicht umgehängt werden'); return; }

      (order as any).customer = created;
      setEditingCustomer(false);
      router.refresh();
    } finally {
      setCreatingCustomer(false);
    }
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

    const nextUpdates: Record<string, string> = { [key]: value };
    const linkedKey = LINKED_SPEC_KEYS[key];
    if (linkedKey && (specValues[linkedKey] ?? '') !== (value ?? '')) {
      nextUpdates[linkedKey] = value;
    }

    setSpecValues(prev => ({ ...prev, ...nextUpdates }));

    const keysToClear = Object.keys(nextUpdates).filter((k) => validationErrors[k]);
    if (keysToClear.length > 0) {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        keysToClear.forEach((k) => delete newErrors[k]);
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
          body: JSON.stringify(nextUpdates),
        });
      } catch (error) {
        console.error('Fehler beim Speichern:', error);
      } finally {
        setSaving(false);
      }
    }, 500);
  };

  const isTruthySpecValue = (value?: string) => {
    const normalized = (value || '').trim().toLowerCase();
    return normalized === 'ja' || normalized === 'true' || normalized === '1' || normalized === 'yes';
  };

  const shouldRenderField = (fieldKey: string) => {
    if (fieldKey === 'pickup_mount_frame' || fieldKey === 'headstock_logo_notes') {
      return false;
    }
    const hasTop = isTruthySpecValue(specValues['body_has_top']);
    const hasLegacyValue = Boolean((specValues[fieldKey] || '').trim());
    if (fieldKey === 'body_top' || fieldKey === 'body_top_thickness') return hasTop || hasLegacyValue;
    // Mit Top wird das Finish in Top/Korpus aufgeteilt, das Gesamt-Finish entfällt.
    if (fieldKey === 'finish_body_top' || fieldKey === 'finish_body_back') return hasTop || hasLegacyValue;
    if (fieldKey === 'finish_body' || fieldKey === 'body_surface_treatment') return !hasTop;
    return true;
  };

  const hasReadableValue = (value?: string) => {
    const trimmed = (value || '').trim();
    if (!trimmed) return false;
    const normalized = trimmed.toLowerCase();
    return !['nein', 'false', '0', 'no', 'n/a', '-'].includes(normalized);
  };

  const shouldShowFieldForCategory = (category: CategoryKey, fieldKey: string) => {
    if (category === 'oberflaeche' && orderType === 'FINISH_ONLY') {
      const oberflaeche_typ = specValues['oberflaeche_typ'] || '';
      if (!shouldShowField(fieldKey, oberflaeche_typ)) {
        return false;
      }
    }
    return shouldRenderField(fieldKey);
  };

  const getReadValueForField = (fieldKey: string) => {
    if (fieldKey === 'pickup_mount_direct') {
      const direct = (specValues['pickup_mount_direct'] || '').trim();
      const frame = (specValues['pickup_mount_frame'] || '').trim();
      const parts = [
        hasReadableValue(direct) ? `Direkt: ${direct}` : '',
        hasReadableValue(frame) ? `Rahmen: ${frame}` : '',
      ].filter(Boolean);
      return parts.length > 0 ? parts.join(' / ') : null;
    }

    if (fieldKey === 'headstock_logo') {
      const logo = (specValues['headstock_logo'] || '').trim();
      const notes = (specValues['headstock_logo_notes'] || '').trim();
      const parts = [
        hasReadableValue(logo) ? logo : '',
        hasReadableValue(notes) ? notes : '',
      ].filter(Boolean);
      return parts.length > 0 ? parts.join(' - ') : null;
    }

    if (fieldKey === 'customer_provides_body' || fieldKey === 'customer_provides_neck' || fieldKey === 'body_has_top') {
      return isTruthySpecValue(specValues[fieldKey]) ? 'Ja' : null;
    }

    const value = (specValues[fieldKey] || '').trim();
    return hasReadableValue(value) ? value : null;
  };

  const getReadEntriesForCategory = (category: CategoryKey) => (
    getFieldsForCategory(orderType, category)
      .filter((fieldKey) => shouldShowFieldForCategory(category, fieldKey))
      .map((fieldKey) => ({
        key: fieldKey,
        label: FIELD_LABELS[fieldKey] || fieldKey,
        value: getReadValueForField(fieldKey),
      }))
      .filter((entry): entry is { key: string; label: string; value: string } => Boolean(entry.value))
  );

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

  const visibleSpecCategories = Array.from(activeCategories).filter((category) => {
    if (editingDatasheet) return true;
    const hasEntries = getReadEntriesForCategory(category).length > 0;
    const hasImages = images?.some((img) => img.scope === category) || false;
    return hasEntries || hasImages;
  });

  return (
    <div className="space-y-3 sm:space-y-4">
      {(saving || Object.keys(validationErrors).length > 0) && (
        <div className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs">
          {saving && <span className="text-slate-400">Speichert...</span>}
          {Object.keys(validationErrors).length > 0 && (
            <span className={saving ? 'ml-3 text-red-400' : 'text-red-400'}>
              {Object.keys(validationErrors).length} Pflichtfeld(er) fehlen
            </span>
          )}
        </div>
      )}

      {/* Tabs - nur auf Desktop */}
      <div className="hidden md:flex flex-wrap gap-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`relative rounded-lg px-3 py-1.5 text-sm ${activeTab === tab.id
              ? 'bg-slate-200/10 text-white'
              : 'bg-slate-200/5 text-slate-300 hover:bg-slate-200/10'
              }`}
          >
            {tab.label}
            {tab.id === 'comm' && hasUnreadComm && activeTab !== 'comm' && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-sky-500 animate-pulse" />
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="rounded-xl border border-slate-800 p-3 sm:p-4">
        {activeTab === 'spec' && (
          <div className="space-y-4">
            <SuggestionBanner orderId={orderId} />
            {/* Eine einzige Umbruchzeile: alle Werkzeuge sind Geschwister und
                brechen einzeln um. Vorher war die rechte Gruppe ein Block —
                dadurch stand der Sperrknopf allein in seiner Zeile. */}
            <div className="flex flex-wrap items-center gap-1.5">
              <h3 className="hidden sm:block font-semibold">Datenblatt - {TYPE_LABEL[orderType] || orderType}</h3>
                <button
                  type="button"
                  onClick={() => setEditingDatasheet(v => !v)}
                  className={`flex shrink-0 items-center gap-2 px-2.5 py-1.5 text-sm rounded-lg transition-all ${
                    editingDatasheet
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                      : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-400/50 shadow-[0_0_14px_rgba(251,191,36,0.55)] animate-pulse'
                  }`}
                  title={editingDatasheet ? 'Bearbeitung aktiv (entsperrt)' : 'Bearbeitung gesperrt'}
                >
                  <span aria-hidden>{editingDatasheet ? '🔓' : '🔒'}</span>
                  <span className="hidden sm:inline">{editingDatasheet ? 'Bearbeitung aktiv' : 'Bearbeitung gesperrt'}</span>
                  <span className="sm:hidden">{editingDatasheet ? 'Entsperrt' : 'Gesperrt'}</span>
                </button>

                {/* Ab hier die Werkzeuge — auf grossen Schirmen rechtsbuendig,
                    auf kleinen fliessen sie direkt hinter dem Sperrknopf weiter. */}
                <span className="hidden sm:ml-auto sm:block" aria-hidden />

                {/* Kunden-Datenblatt: ausfüllbares PDF + Import */}
                <CustomerDatasheetActions orderId={orderId} />

                {/* Datenblatt aktualisieren Button */}
                <button
                  onClick={() => {
                    // Seite neu laden um aktuellste Daten zu bekommen
                    window.location.reload();
                  }}
                  className={TOOLBAR_BUTTON}
                  title="Datenblatt mit neuesten Änderungen aktualisieren"
                >
                  <span aria-hidden>🔄</span>
                  <span>Aktualisieren</span>
                </button>

                {/* Direkter PDF-Download */}
                <DatasheetPDFGenerator
                  orderId={orderId}
                  orderTitle={order.title}
                  orderType={orderType}
                  customerName={order.customer?.name || 'Unbekannt'}
                  orderCreatedAt={order.createdAt}
                  specs={Object.entries(specValues).map(([key, value], index) => ({
                    id: `${key}-${index}`,
                    key,
                    value,
                  }))}
                  activeCategories={activeCategories}
                  assigneeName={order.assignee?.name}
                  finalAmount={shopAmount}
                  paymentStatus={paymentStatus || undefined}
                  paymentMethod={paymentMethod || undefined}
                  depositAmount={depositAmountCents != null ? (depositAmountCents / 100).toFixed(2) : undefined}
                  depositPaidAt={depositPaidAt}
                  paidAt={paidAt}
                  attachImages={images?.filter(img => img.attach).map(img => ({ id: img.id, path: img.path, comment: img.comment, position: img.position })) || []}
                  buttonText="📄 PDF"
                  // Kein onPDFGenerated = direkter Download
                  datasheetVersion={datasheetVersion}
                  datasheetUpdatedAt={datasheetUpdatedAt}
                  stringCount={specValues['string_count'] || '–'}
                />
            </div>

            {/* Category Chips - nur anzeigen wenn mehr als eine Kategorie.
                scrollbar-hide (so heisst die Klasse in globals.css): der sichtbare
                Balken unter den Kategorien wirkte wie ein Fehler. Wischen geht weiter. */}
            {categories.length > 1 && (
              <div className="scrollbar-hide -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
                <button
                  onClick={() => setActiveCategories(new Set(categories))}
                  className={`min-h-10 shrink-0 rounded-full px-3 py-1.5 text-sm ${activeCategories.size === categories.length ? 'bg-slate-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                >
                  Alle
                </button>
                {categories.map((category) => (
                  <button
                    key={category}
                    onClick={() => setActiveCategories(new Set([category]))}
                    className={`min-h-10 shrink-0 rounded-full px-3 py-1.5 text-sm ${activeCategories.has(category) && activeCategories.size === 1
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
              {visibleSpecCategories.map((category) => {
                const categoryFields = getFieldsForCategory(orderType, category);
                const readEntries = getReadEntriesForCategory(category);
                const categoryImages = images?.filter(img => img.scope === category) || [];
                if (categoryFields.length === 0) return null;

                return (
                  <div key={category} className="space-y-3">
                    <h4 className="text-sm font-medium text-slate-300 border-b border-slate-800 pb-2">
                      {CATEGORY_LABELS[category]}
                    </h4>

                    {/* Category Images: nur anzeigen, wenn vorhanden */}
                    {categoryImages.length > 0 && (
                      <div className="mb-4">
                        <div className="text-xs text-slate-400 mb-2">
                          Bilder für {CATEGORY_LABELS[category]}
                        </div>
                        <div className="flex gap-2 overflow-x-auto pb-2">
                          {categoryImages
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
                    {!editingDatasheet ? (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {readEntries.map((entry) => (
                          <div
                            key={entry.key}
                            className="rounded-lg border border-slate-800/80 bg-slate-900/35 px-3 py-2.5"
                          >
                            <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                              {entry.label}
                            </div>
                            <div className="mt-1 whitespace-pre-wrap break-words text-sm font-medium leading-relaxed text-slate-100">
                              {entry.value}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
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

                                if (!shouldRenderField(fieldKey)) {
                                  return null;
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
                                        disabled={!editingDatasheet}
                                      />
                                    ) : fieldKey === 'pickup_mount_direct' ? (
                                      <PickupMountInput
                                        directValue={specValues['pickup_mount_direct'] || ''}
                                        frameValue={specValues['pickup_mount_frame'] || ''}
                                        onDirectChange={(v) => updateSpec('pickup_mount_direct', v)}
                                        onFrameChange={(v) => updateSpec('pickup_mount_frame', v)}
                                        disabled={!editingDatasheet}
                                      />
                                    ) : fieldKey === 'pickup_mount_frame' ? null : fieldKey === 'headstock_logo' ? (
                                      <HeadstockLogoInput
                                        logoValue={specValues['headstock_logo'] || ''}
                                        notesValue={specValues['headstock_logo_notes'] || ''}
                                        onLogoChange={(v) => updateSpec('headstock_logo', v)}
                                        onNotesChange={(v) => updateSpec('headstock_logo_notes', v)}
                                        hasError={!!hasError}
                                        disabled={!editingDatasheet}
                                      />
                                    ) : fieldKey === 'headstock_logo_notes' ? null : fieldKey === 'customer_provides_body' || fieldKey === 'customer_provides_neck' ? (
                                      <div className="flex items-center gap-2">
                                        <input
                                          type="checkbox"
                                          id={`${fieldKey}-checkbox-left`}
                                          checked={isTruthySpecValue(specValues[fieldKey])}
                                          onChange={(e) => updateSpec(fieldKey, e.target.checked ? 'Ja' : 'Nein')}
                                          disabled={!editingDatasheet}
                                          className="rounded border-slate-600 bg-slate-950 text-sky-600 focus:ring-sky-500 focus:ring-offset-0 disabled:bg-slate-800 disabled:border-slate-500 disabled:cursor-not-allowed"
                                        />
                                        <label htmlFor={`${fieldKey}-checkbox-left`} className="text-sm cursor-pointer">
                                          {label}
                                        </label>
                                      </div>
                                    ) : fieldKey === 'battery_compartment' ? (
                                      <BatteryCompartmentInput
                                        value={specValues[fieldKey] || ''}
                                        onChange={(v) => updateSpec(fieldKey, v)}
                                        hasError={!!hasError}
                                        disabled={!editingDatasheet}
                                      />
                                    ) : fieldKey === 'spokewheel' ? (
                                      <SpokewheelInput
                                        value={specValues[fieldKey] || ''}
                                        onChange={(v) => updateSpec(fieldKey, v)}
                                        hasError={!!hasError}
                                        disabled={!editingDatasheet}
                                      />
                                    ) : fieldKey === 'neck_binding' ? (
                                      <NeckBindingInput
                                        value={specValues[fieldKey] || ''}
                                        onChange={(v) => updateSpec(fieldKey, v)}
                                        hasError={!!hasError}
                                        disabled={!editingDatasheet}
                                      />
                                    ) : fieldKey === 'body_binding' ? (
                                      <BindingInput
                                        value={specValues[fieldKey] || ''}
                                        onChange={(v) => updateSpec(fieldKey, v)}
                                        hasError={!!hasError}
                                        disabled={!editingDatasheet}
                                      />
                                    ) : fieldKey === 'body_has_top' ? (
                                      <div className="flex items-center gap-2">
                                        <input
                                          type="checkbox"
                                          id={`body-top-checkbox-left-${fieldKey}`}
                                          checked={isTruthySpecValue(specValues[fieldKey])}
                                          onChange={(e) => updateSpec(fieldKey, e.target.checked ? 'Ja' : 'Nein')}
                                          disabled={!editingDatasheet}
                                          className="rounded border-slate-600 bg-slate-950 text-sky-600 focus:ring-sky-500 focus:ring-offset-0 disabled:bg-slate-800 disabled:border-slate-500 disabled:cursor-not-allowed"
                                        />
                                        <label htmlFor={`body-top-checkbox-left-${fieldKey}`} className="text-sm cursor-pointer">
                                          Top vorhanden
                                        </label>
                                      </div>
                                    ) : AUTO_FIELDS.has(fieldKey) ? (
                                      <AutoFillInput
                                        fieldKey={fieldKey}
                                        value={specValues[fieldKey] || ''}
                                        onChange={(v) => updateSpec(fieldKey, v)}
                                        placeholder={isRequired ? 'Pflichtfeld...' : 'Wert eingeben...'}
                                        hasError={!!hasError}
                                        disabled={!editingDatasheet}
                                      />
                                    ) : (
                                      <input
                                        value={specValues[fieldKey] || ''}
                                        onChange={(e) => updateSpec(fieldKey, e.target.value)}
                                        disabled={!editingDatasheet}
                                        className={`w-full rounded border px-2 py-1.5 transition-colors ${
                                          hasError
                                            ? 'border-red-500 focus:border-red-400 bg-slate-950 disabled:bg-slate-900/80 disabled:border-slate-700 disabled:text-slate-400'
                                            : 'bg-slate-950 border-slate-800 focus:border-slate-600 disabled:bg-slate-900/80 disabled:border-slate-700 disabled:text-slate-400'
                                        } disabled:cursor-not-allowed`}
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

                                if (!shouldRenderField(fieldKey)) {
                                  return null;
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
                                        disabled={!editingDatasheet}
                                      />
                                    ) : fieldKey === 'pickup_mount_direct' ? (
                                      <PickupMountInput
                                        directValue={specValues['pickup_mount_direct'] || ''}
                                        frameValue={specValues['pickup_mount_frame'] || ''}
                                        onDirectChange={(v) => updateSpec('pickup_mount_direct', v)}
                                        onFrameChange={(v) => updateSpec('pickup_mount_frame', v)}
                                        disabled={!editingDatasheet}
                                      />
                                    ) : fieldKey === 'pickup_mount_frame' ? null : fieldKey === 'headstock_logo' ? (
                                      <HeadstockLogoInput
                                        logoValue={specValues['headstock_logo'] || ''}
                                        notesValue={specValues['headstock_logo_notes'] || ''}
                                        onLogoChange={(v) => updateSpec('headstock_logo', v)}
                                        onNotesChange={(v) => updateSpec('headstock_logo_notes', v)}
                                        hasError={!!hasError}
                                        disabled={!editingDatasheet}
                                      />
                                    ) : fieldKey === 'headstock_logo_notes' ? null : fieldKey === 'customer_provides_body' || fieldKey === 'customer_provides_neck' ? (
                                      <div className="flex items-center gap-2">
                                        <input
                                          type="checkbox"
                                          id={`${fieldKey}-checkbox-right`}
                                          checked={isTruthySpecValue(specValues[fieldKey])}
                                          onChange={(e) => updateSpec(fieldKey, e.target.checked ? 'Ja' : 'Nein')}
                                          disabled={!editingDatasheet}
                                          className="rounded border-slate-600 bg-slate-950 text-sky-600 focus:ring-sky-500 focus:ring-offset-0 disabled:bg-slate-800 disabled:border-slate-500 disabled:cursor-not-allowed"
                                        />
                                        <label htmlFor={`${fieldKey}-checkbox-right`} className="text-sm cursor-pointer">
                                          {label}
                                        </label>
                                      </div>
                                    ) : fieldKey === 'battery_compartment' ? (
                                      <BatteryCompartmentInput
                                        value={specValues[fieldKey] || ''}
                                        onChange={(v) => updateSpec(fieldKey, v)}
                                        hasError={!!hasError}
                                        disabled={!editingDatasheet}
                                      />
                                    ) : fieldKey === 'spokewheel' ? (
                                      <SpokewheelInput
                                        value={specValues[fieldKey] || ''}
                                        onChange={(v) => updateSpec(fieldKey, v)}
                                        hasError={!!hasError}
                                        disabled={!editingDatasheet}
                                      />
                                    ) : fieldKey === 'neck_binding' ? (
                                      <NeckBindingInput
                                        value={specValues[fieldKey] || ''}
                                        onChange={(v) => updateSpec(fieldKey, v)}
                                        hasError={!!hasError}
                                        disabled={!editingDatasheet}
                                      />
                                    ) : fieldKey === 'body_binding' ? (
                                      <BindingInput
                                        value={specValues[fieldKey] || ''}
                                        onChange={(v) => updateSpec(fieldKey, v)}
                                        hasError={!!hasError}
                                        disabled={!editingDatasheet}
                                      />
                                    ) : fieldKey === 'body_has_top' ? (
                                      <div className="flex items-center gap-2">
                                        <input
                                          type="checkbox"
                                          id={`body-top-checkbox-right-${fieldKey}`}
                                          checked={isTruthySpecValue(specValues[fieldKey])}
                                          onChange={(e) => updateSpec(fieldKey, e.target.checked ? 'Ja' : 'Nein')}
                                          disabled={!editingDatasheet}
                                          className="rounded border-slate-600 bg-slate-950 text-sky-600 focus:ring-sky-500 focus:ring-offset-0 disabled:bg-slate-800 disabled:border-slate-500 disabled:cursor-not-allowed"
                                        />
                                        <label htmlFor={`body-top-checkbox-right-${fieldKey}`} className="text-sm cursor-pointer">
                                          Top vorhanden
                                        </label>
                                      </div>
                                    ) : AUTO_FIELDS.has(fieldKey) ? (
                                      <AutoFillInput
                                        fieldKey={fieldKey}
                                        value={specValues[fieldKey] || ''}
                                        onChange={(v) => updateSpec(fieldKey, v)}
                                        placeholder={isRequired ? 'Pflichtfeld...' : 'Wert eingeben...'}
                                        hasError={!!hasError}
                                        disabled={!editingDatasheet}
                                      />
                                    ) : (
                                      <input
                                        value={specValues[fieldKey] || ''}
                                        onChange={(e) => updateSpec(fieldKey, e.target.value)}
                                        disabled={!editingDatasheet}
                                        className={`w-full rounded border px-2 py-1.5 transition-colors ${
                                          hasError
                                            ? 'border-red-500 focus:border-red-400 bg-slate-950 disabled:bg-slate-900/80 disabled:border-slate-700 disabled:text-slate-400'
                                            : 'bg-slate-950 border-slate-800 focus:border-slate-600 disabled:bg-slate-900/80 disabled:border-slate-700 disabled:text-slate-400'
                                        } disabled:cursor-not-allowed`}
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
                    )}
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

              {!editingDatasheet && activeCategories.size > 0 && visibleSpecCategories.length === 0 && (
                <div className="rounded-lg border border-slate-800 bg-slate-900/30 px-4 py-6 text-center">
                  <div className="text-sm font-medium text-slate-300">Keine sichtbaren Angaben</div>
                  <div className="mt-1 text-xs text-slate-500">
                    Schalte auf Offen, um optionale Felder zu ergaenzen.
                  </div>
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
                      onChange={(e) => onShopAmountChange?.(e.target.value)}
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
                        onShopAmountChange?.(String(parsed));
                        setIsLocked(true);
                      }}
                    >OK</button>
                  </div>
                  {/* Versand: kommt OBENDRAUF auf den Endbetrag und geht beim
                      Shop-Sync als eigene Versandposition mit. Wie alle Beträge
                      nur im Bearbeiten-Modus (Stift) offen — gesperrt zeigt die
                      Abrechnungszeile darunter den Wert. */}
                  {!isLocked && (
                  <label
                    className="flex items-center gap-1.5 text-sm text-slate-400"
                    title="Versandkosten — kommen auf den Endbetrag obendrauf und gehen beim Shop-Sync als Versandposition mit"
                  >
                    Versand €
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={shippingInput}
                      onChange={(e) => setShippingInput(e.target.value)}
                      onBlur={() => {
                        const raw = shippingInput.trim();
                        if (!raw) {
                          onShippingChange?.(null);
                          return;
                        }
                        const parsed = Number.parseFloat(raw.replace(',', '.'));
                        if (!Number.isFinite(parsed) || parsed < 0) {
                          return;
                        }
                        const cents = Math.round(parsed * 100);
                        onShippingChange?.(cents);
                        setShippingInput((cents / 100).toString());
                      }}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter') return;
                        (e.target as HTMLInputElement).blur();
                      }}
                      className="w-20 rounded bg-slate-950 border border-slate-700 px-2 py-1 text-sm text-slate-200"
                      placeholder="0"
                    />
                  </label>
                  )}
                  {/* Der Vorschlags-Chip nur im Bearbeiten-Modus: bei laufenden
                      Aufträgen ist die Rechnung längst raus, da soll nichts mehr
                      zum Versand auffordern. */}
                  {!isLocked && shippingSuggestion && (
                    <button
                      type="button"
                      onClick={() => onShippingChange?.(shippingSuggestion.cents)}
                      className="rounded-full bg-sky-500/10 px-2.5 py-1 text-xs text-sky-300 hover:bg-sky-500/20"
                      title={`Aus der Preisliste: ${shippingSuggestion.source}${shippingSuggestion.freeReason ? ` — ${shippingSuggestion.freeReason}` : ''}`}
                    >
                      Vorschlag:{' '}
                      {shippingSuggestion.cents === 0
                        ? 'versandkostenfrei'
                        : `${(shippingSuggestion.cents / 100).toLocaleString('de-DE', { minimumFractionDigits: 2 })} €`}{' '}
                      ({shippingSuggestion.zoneLabel}) übernehmen
                    </button>
                  )}
                  {/* Zahlungsstatus Checkboxen */}
                  <div className="flex flex-wrap items-center gap-4 ml-0 sm:ml-4">
                    <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={paymentStatus === 'deposit'}
                        disabled={paymentStatus === 'paid'}
                        onChange={async (e) => {
                          const newStatus = e.target.checked ? 'deposit' : 'open';
                          onPaymentStatusChange?.(newStatus);
                          if (newStatus !== 'deposit') {
                            setDepositInput('');
                            onDepositAmountChange?.(null);
                            return;
                          }
                          if (depositAmountCents != null) {
                            return;
                          }
                          const normalized = (shopAmount || '').replace(',', '.').trim();
                          const parsed = Number.parseFloat(normalized);
                          if (!Number.isFinite(parsed) || parsed <= 0) {
                            return;
                          }
                          const defaultDeposit = Math.round(parsed * 100 * 0.5);
                          setDepositInput((defaultDeposit / 100).toString());
                          onDepositAmountChange?.(defaultDeposit);
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
                    {paymentStatus === 'paid' && (
                      <>
                        {/* Gewählte Zahlungsart wird zur Textzeile ("Bezahlt am …
                            via …") — das Select zeigt sich nur, solange nichts
                            gewählt ist oder der Stift offen ist. */}
                        {(!isLocked || !paymentMethod) && (
                        <select
                          value={paymentMethod || ''}
                          onChange={(e) => {
                            const v = e.target.value;
                            onPaymentMethodChange?.(v === 'paypal' ? 'paypal' : v === 'direktueberweisung' ? 'direktueberweisung' : null);
                          }}
                          className="rounded bg-slate-950 border border-slate-700 px-2 py-1 text-sm text-slate-200"
                          title="Zahlungsart"
                        >
                          <option value="">— Zahlungsart —</option>
                          <option value="paypal">PayPal</option>
                          <option value="direktueberweisung">Direktüberweisung</option>
                        </select>
                        )}
                        {/* Beide Zahlungen bleiben zuordenbar: gab es eine
                            Anzahlung, bleibt ihr Datum auch bei "Bezahlt"
                            korrigierbar (im Bearbeiten-Modus). */}
                        {!isLocked && (depositAmountCents != null || depositPaidAt) && (
                          <label className="flex items-center gap-1.5 text-sm text-slate-400">
                            Anzahlung am
                            <input
                              type="date"
                              value={toDateInputValue(depositPaidAt)}
                              onChange={(e) => onDepositPaidAtChange?.(e.target.value || null)}
                              className="rounded bg-slate-950 border border-slate-700 px-2 py-1 text-sm text-slate-200 [color-scheme:dark]"
                              title="Anzahlung eingegangen am"
                            />
                          </label>
                        )}
                        {!isLocked && (
                        <label className="flex items-center gap-1.5 text-sm text-slate-400">
                          am
                          <input
                            type="date"
                            value={toDateInputValue(paidAt)}
                            onChange={(e) => onPaidAtChange?.(e.target.value || null)}
                            className="rounded bg-slate-950 border border-slate-700 px-2 py-1 text-sm text-slate-200 [color-scheme:dark]"
                            title="Bezahlt am — fürs Abrechnen mit der Banking-App"
                          />
                        </label>
                        )}
                      </>
                    )}
                    {paymentStatus === 'deposit' && (
                      <>
                        {(!isLocked || !paymentMethod) && (
                        <select
                          value={paymentMethod || ''}
                          onChange={(e) => {
                            const v = e.target.value;
                            onPaymentMethodChange?.(v === 'paypal' ? 'paypal' : v === 'direktueberweisung' ? 'direktueberweisung' : null);
                          }}
                          className="rounded bg-slate-950 border border-slate-700 px-2 py-1 text-sm text-slate-200"
                          title="Zahlungsart"
                        >
                          <option value="">— Zahlungsart —</option>
                          <option value="paypal">PayPal</option>
                          <option value="direktueberweisung">Direktüberweisung</option>
                        </select>
                        )}
                        {!isLocked && (
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={depositInput}
                          onChange={(e) => {
                            setDepositInput(e.target.value);
                          }}
                          onBlur={() => {
                            const raw = depositInput.trim();
                            if (!raw) {
                              onDepositAmountChange?.(null);
                              return;
                            }
                            const parsed = Number.parseFloat(raw.replace(',', '.'));
                            if (!Number.isFinite(parsed) || parsed < 0) {
                              return;
                            }
                            const cents = Math.round(parsed * 100);
                            onDepositAmountChange?.(cents);
                            setDepositInput((cents / 100).toString());
                          }}
                          onKeyDown={(e) => {
                            if (e.key !== 'Enter') return;
                            (e.target as HTMLInputElement).blur();
                          }}
                          className="w-28 rounded bg-slate-950 border border-slate-700 px-2 py-1 text-sm text-slate-200"
                          placeholder="Anzahlung €"
                          title="Anzahlungsbetrag in Euro"
                        />
                        )}
                        {!isLocked && (
                        <label className="flex items-center gap-1.5 text-sm text-slate-400">
                          am
                          <input
                            type="date"
                            value={toDateInputValue(depositPaidAt)}
                            onChange={(e) => onDepositPaidAtChange?.(e.target.value || null)}
                            className="rounded bg-slate-950 border border-slate-700 px-2 py-1 text-sm text-slate-200 [color-scheme:dark]"
                            title="Anzahlung eingegangen am — fürs Abrechnen mit der Banking-App"
                          />
                        </label>
                        )}
                      </>
                    )}
                  </div>
                </div>
                {/* Nur noch EINE Rechnung über den vollen Endbetrag — die
                    Raten-Knöpfe (Anzahlung/Restzahlung) sind bewusst weg. */}
                <div className="flex items-center gap-2 w-full sm:w-auto justify-start sm:justify-end">
                  <button
                    onClick={() => {
                      const value = isLocked ? shopAmount : (document.getElementById('endbetrag-input') as HTMLInputElement | null)?.value || '';
                      const isEmpty = !value || !value.trim();
                      if (isEmpty) { alert('Bitte Endbetrag eintragen.'); return; }
                      const shippingNote = (shippingCents ?? 0) > 0
                        ? ` (inkl. ${((shippingCents as number) / 100).toLocaleString('de-DE', { minimumFractionDigits: 2 })} € Versand als eigene Position)`
                        : '';
                      if (!confirm(`Möchten Sie den Auftrag jetzt an WooCommerce übertragen?${shippingNote}`)) return;
                      document.dispatchEvent(new CustomEvent('sync-to-woo'));
                    }}
                    className="rounded bg-sky-600 hover:bg-sky-500 px-3 py-1.5 text-xs font-medium w-full sm:w-auto"
                  >Auftrag in Shop</button>
                </div>
              </div>

              {/* Abrechnungszeile unter dem Betrag: WANN wurde was gezahlt (für
                  den Abgleich mit der Banking-App) und was kommt an Versand
                  dazu. Im gesperrten Zustand ist sie die einzige Anzeige dieser
                  Werte — ändern geht über den Stift. Fehlt ein Datum (Altfälle
                  vor der Umstellung), steht nur der Betrag da. */}
              {(((paymentStatus === 'deposit' || paymentStatus === 'paid') && (depositAmountCents != null || depositPaidAt)) ||
                paymentStatus === 'paid' ||
                (shippingCents ?? 0) > 0) && (
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-400">
                  {(paymentStatus === 'deposit' || paymentStatus === 'paid') && (depositAmountCents != null || depositPaidAt) && (
                    <span>
                      Angezahlt
                      {depositAmountCents != null
                        ? ` ${(depositAmountCents / 100).toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €`
                        : ''}
                      {formatPaidDate(depositPaidAt) ? ` am ${formatPaidDate(depositPaidAt)}` : ''}
                      {paymentStatus === 'deposit' && paymentMethod
                        ? ` via ${paymentMethod === 'paypal' ? 'PayPal' : 'Direktüberweisung'}`
                        : ''}
                    </span>
                  )}
                  {paymentStatus === 'paid' && (
                    <span>
                      Bezahlt
                      {formatPaidDate(paidAt) ? ` am ${formatPaidDate(paidAt)}` : ''}
                      {paymentMethod ? ` via ${paymentMethod === 'paypal' ? 'PayPal' : 'Direktüberweisung'}` : ''}
                    </span>
                  )}
                  {(shippingCents ?? 0) > 0 && (
                    <span title="Geht beim Shop-Sync als Versandposition mit">
                      + Versand {((shippingCents as number) / 100).toLocaleString('de-DE', { minimumFractionDigits: 2 })} €
                    </span>
                  )}
                </div>
              )}

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
              {/* "Scopes: neck, finish" waren rohe englische Schluessel in einer
                  sonst deutschen Oberflaeche — CATEGORY_LABELS deckt dieselben
                  Werte ab und wird daneben ohnehin schon benutzt. */}
              <div className="text-xs text-slate-400">
                Bereiche: {imageScopes.map((s) => CATEGORY_LABELS[s]).join(', ')}
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
            <SuggestionBanner orderId={orderId} />
            <h3 className="font-semibold">Kommunikation</h3>
            <MessageSystem
              ref={messageSystemRef}
              orderId={orderId}
              messages={messages}
              currentUserId={currentUserId}
              onMessagesChange={onMessagesChange}
              images={images}
              onImagesChange={onImagesChange}
              orderTitle={order.title}
              orderType={orderType}
              customerName={order.customer?.name || 'Unbekannt'}
              customerEmail={order.customer?.email}
              mails={order.mails}
              specs={specs}
              activeCategories={activeCategories}
              users={users}
              tasks={initialTasks}
            />
          </div>
        )}



        {activeTab === 'details' && (
          <div className="space-y-4">
            <SuggestionBanner orderId={orderId} />
            <h3 className="font-semibold">Details</h3>

            <OrderParts orderId={orderId} />

            <div className="grid sm:grid-cols-2 gap-4">
              {/* Kunde */}
              <div className="rounded-xl border border-slate-800 p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-semibold">Kunde</div>
                  {order.customer && !editingCustomer && (
                    <div className="flex items-center gap-3">
                      <button
                        className="text-xs text-slate-400 hover:text-sky-400 flex items-center gap-1"
                        title="Auftrag an einen anderen Kunden hängen"
                        onClick={() => setSwitchCustomerOpen(true)}
                      >
                        ⇄ Wechseln
                      </button>
                      <button
                        className="text-xs text-slate-400 hover:text-sky-400 flex items-center gap-1"
                        title="Kundendaten bearbeiten"
                        onClick={startEditCustomer}
                      >
                        ✏️ Bearbeiten
                      </button>
                    </div>
                  )}
                </div>
                {switchCustomerOpen && order.customer && (
                  <CustomerSwitchModal
                    orderId={orderId}
                    currentCustomerId={order.customer.id}
                    onClose={() => setSwitchCustomerOpen(false)}
                    onSwitched={() => {
                      setSwitchCustomerOpen(false);
                      router.refresh();
                    }}
                  />
                )}
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
                      <PhoneLink
                        phone={order.customer.phone}
                        className="text-xs text-slate-400 hover:text-green-400 transition-colors"
                      >
                        {order.customer.phone}
                      </PhoneLink>
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
                      {customerOtherOrdersCount > 0 && (
                        <div className="mt-2 text-xs text-slate-500">
                          Dieser Kunde hängt an {customerOtherOrdersCount} weiteren{' '}
                          {customerOtherOrdersCount === 1 ? 'Auftrag' : 'Aufträgen'}.
                        </div>
                      )}
                    </div>
                  )}
                  {order.customer && editingCustomer && (
                    <div className="mt-2 space-y-2 text-sm">
                      {customerOtherOrdersCount > 0 && (
                        <div className="rounded-lg border border-amber-700/50 bg-amber-900/20 px-2.5 py-2 text-xs text-amber-200">
                          Achtung: Änderungen gelten auch für {customerOtherOrdersCount}{' '}
                          {customerOtherOrdersCount === 1 ? 'weiteren Auftrag' : 'weitere Aufträge'} dieses Kunden.
                          Ist das eigentlich eine andere Person, nutze „Als neuen Kunden anlegen"
                          oder hänge den Auftrag über „Wechseln" um.
                        </div>
                      )}
                      <input className="w-full rounded bg-slate-950 border border-slate-700 px-2 py-1" placeholder="Name" value={customerDraft.name} onChange={(e) => setCustomerDraft({ ...customerDraft, name: e.target.value })} />
                      <input className="w-full rounded bg-slate-950 border border-slate-700 px-2 py-1" placeholder="E-Mail" value={customerDraft.email} onChange={(e) => setCustomerDraft({ ...customerDraft, email: e.target.value })} />
                      <input className="w-full rounded bg-slate-950 border border-slate-700 px-2 py-1" placeholder="Telefon" value={customerDraft.phone} onChange={(e) => setCustomerDraft({ ...customerDraft, phone: e.target.value })} />
                      <input className="w-full rounded bg-slate-950 border border-slate-700 px-2 py-1" placeholder="Adresse (Zeile 1)" value={customerDraft.addressLine1} onChange={(e) => setCustomerDraft({ ...customerDraft, addressLine1: e.target.value })} />
                      <div className="grid grid-cols-3 gap-2">
                        <input className="rounded bg-slate-950 border border-slate-700 px-2 py-1" placeholder="PLZ" value={customerDraft.postalCode} onChange={(e) => setCustomerDraft({ ...customerDraft, postalCode: e.target.value })} />
                        <input className="rounded bg-slate-950 border border-slate-700 px-2 py-1" placeholder="Ort" value={customerDraft.city} onChange={(e) => setCustomerDraft({ ...customerDraft, city: e.target.value })} />
                        <input className="rounded bg-slate-950 border border-slate-700 px-2 py-1" placeholder="Land" value={customerDraft.country} onChange={(e) => setCustomerDraft({ ...customerDraft, country: e.target.value })} />
                      </div>
                      <div className="flex flex-wrap justify-end gap-2">
                        <button className="rounded border border-slate-700 px-3 py-1.5 text-xs hover:bg-slate-800" onClick={() => setEditingCustomer(false)} disabled={creatingCustomer}>Abbrechen</button>
                        <button
                          className="rounded border border-emerald-700/70 bg-emerald-900/20 px-3 py-1.5 text-xs text-emerald-200 hover:bg-emerald-900/40 disabled:opacity-50"
                          onClick={saveAsNewCustomer}
                          disabled={creatingCustomer}
                          title="Legt mit diesen Daten einen neuen Kunden an und hängt den Auftrag dorthin um — der bisherige Kunde bleibt unverändert"
                        >
                          {creatingCustomer ? 'Lege an…' : 'Als neuen Kunden anlegen'}
                        </button>
                        <button className="rounded border border-sky-600 bg-sky-600/20 px-3 py-1.5 text-xs text-sky-200 hover:bg-sky-600/30" onClick={saveCustomer} disabled={creatingCustomer}>Speichern</button>
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
                <div className="text-xs text-slate-400 mb-1">Bereiche für Bilder</div>
                <div className="bg-slate-950 border border-slate-800 rounded px-2 py-1.5">
                  {imageScopes.map((s) => CATEGORY_LABELS[s]).join(', ')}
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

      {/* Reiter des Auftrags, unten fuer den Daumen. Bewusst OHNE Emojis und ohne
          die blaue Pillen-Optik der Hauptnavigation: mit beidem sah die Leiste
          exakt aus wie GlobalMobileNav an derselben Stelle, und Nutzer haben
          "Kommunikation" fuer den Posteingang gehalten. Jetzt ein flacher
          Segmentschalter mit Unterstrich fuer den aktiven Reiter. */}
      <div
        className="fixed left-0 right-0 z-50 border-t border-slate-800 bg-slate-950/95 shadow-[0_-12px_30px_rgba(0,0,0,0.35)] backdrop-blur-md md:hidden"
        style={{
          bottom: '0px',
          margin: '0px',
          padding: '6px 10px calc(10px + env(safe-area-inset-bottom)) 10px'
        }}
      >
        <div className="mx-auto max-w-lg">
          <div className="mb-1 text-center text-[10px] uppercase tracking-wider text-slate-600">
            Ansicht in diesem Auftrag
          </div>
          <div className="grid grid-cols-4 gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex min-h-[38px] items-center justify-center border-b-2 px-1 py-1.5 transition-colors ${activeTab === tab.id
                  ? 'border-sky-400 text-sky-200'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
              >
                <span className="max-w-full truncate text-[11px] font-medium leading-tight">{tab.label}</span>
                {tab.id === 'comm' && hasUnreadComm && activeTab !== 'comm' && (
                  <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-sky-500 animate-pulse" />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Padding unten für mobile Navigation */}
      <div className="h-24 md:hidden"></div>
    </div>
  );
}
