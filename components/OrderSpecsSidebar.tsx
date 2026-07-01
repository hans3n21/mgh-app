'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import {
  getCategoriesForOrderType,
  getFieldsForCategory,
  getRequiredFieldsForCategory,
  isFieldRequired,
  shouldShowField,
  getDefaultValues,
  sortSpecsByDefinedOrder,
  FIELD_LABELS,
  CATEGORY_LABELS,
  CategoryKey,
} from '@/lib/order-presets';
import AutoFillInput from '@/components/AutoFillInput';
import BindingInput from '@/components/BindingInput';
import PickguardInput from '@/components/PickguardInput';
import BatteryCompartmentInput from '@/components/BatteryCompartmentInput';
import SpokewheelInput from '@/components/SpokewheelInput';
import NeckBindingInput from '@/components/NeckBindingInput';
import HeadstockLogoInput from '@/components/HeadstockLogoInput';
import PickupMountInput from '@/components/PickupMountInput';
import DatasheetPDFGenerator from '@/components/DatasheetPDFGenerator';
import { AUTO_FIELDS } from '@/lib/autofill-data';
import ImageCarouselModal, { type CarouselImage } from './ImageCarouselModal';

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

interface OrderSpecsSidebarProps {
  orderId: string;
  orderType: string;
  specs: OrderSpec[];
  images: OrderImage[];
  order: {
    id: string;
    title: string;
    type: string;
    createdAt?: Date;
    customer: { id: string; name: string; email?: string; phone?: string } | null;
  };
  assigneeId: string | null;
  users: Array<{ id: string; name: string }>;
  shopAmount?: string;
  paymentStatus?: string | null;
  paymentMethod?: string | null;
  depositAmountCents?: number | null;
}

export default function OrderSpecsSidebar({
  orderId,
  orderType,
  specs,
  images,
  order,
  assigneeId,
  users,
  shopAmount = '',
  paymentStatus,
  paymentMethod,
  depositAmountCents,
}: OrderSpecsSidebarProps) {
  const LINKED_SPEC_KEYS: Record<string, string> = {
    body_surface_treatment: 'finish_body',
    finish_body: 'body_surface_treatment',
  };

  const categories = getCategoriesForOrderType(orderType);
  const [activeCategories, setActiveCategories] = useState<Set<CategoryKey>>(() => {
    return new Set(categories);
  });
  const [lightbox, setLightbox] = useState<{ open: boolean; index: number }>({ open: false, index: 0 });
  const [datasheetVersion, setDatasheetVersion] = useState<number | undefined>(undefined);
  const [datasheetUpdatedAt, setDatasheetUpdatedAt] = useState<string | undefined>(undefined);

  const [specValues, setSpecValues] = useState<Record<string, string>>(() => {
    const defaultValues = getDefaultValues(orderType);
    const sortedSpecs = sortSpecsByDefinedOrder(specs, orderType);

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

  const updateSpec = (key: string, value: string) => {
    const nextUpdates: Record<string, string> = { [key]: value };
    const linkedKey = LINKED_SPEC_KEYS[key];
    if (linkedKey && (specValues[linkedKey] ?? '') !== (value ?? '')) {
      nextUpdates[linkedKey] = value;
    }

    setSpecValues(prev => ({ ...prev, ...nextUpdates }));

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(async () => {
      setSaving(true);
      try {
        const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}/spec`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(nextUpdates),
        });
        if (!res.ok) throw new Error('Speichern fehlgeschlagen');
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
    if (fieldKey === 'pickup_mount_frame' || fieldKey === 'headstock_logo_notes') return false;
    if (fieldKey !== 'body_top' && fieldKey !== 'body_top_thickness') return true;
    const hasTop = isTruthySpecValue(specValues['body_has_top']);
    const hasLegacyValue = Boolean((specValues[fieldKey] || '').trim());
    return hasTop || hasLegacyValue;
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

  // Konvertiere OrderImages zu CarouselImage-Format
  const carouselImages: CarouselImage[] = useMemo(() => {
    return (images || []).map(img => ({
      id: img.id,
      path: img.path,
      comment: img.comment || '',
      position: img.position,
      attach: img.attach,
      scope: img.scope || '',
      fieldKey: img.fieldKey || '',
      createdAt: img.createdAt,
    }));
  }, [images]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-800 p-3 bg-slate-900/60">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm">Datenblatt - {TYPE_LABEL[orderType] || orderType}</h3>
          <div className="flex items-center gap-2">
            {saving && <div className="text-xs text-slate-400">Speichert...</div>}
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
              assigneeName={assigneeId ? users.find(u => u.id === assigneeId)?.name : undefined}
              finalAmount={shopAmount}
              paymentStatus={paymentStatus || undefined}
              paymentMethod={paymentMethod || undefined}
              depositAmount={depositAmountCents != null ? (depositAmountCents / 100).toFixed(2) : undefined}
              attachImages={images?.filter(img => img.attach).map(img => ({ id: img.id, path: img.path, comment: img.comment, position: img.position })) || []}
              buttonText="📄"
              datasheetVersion={datasheetVersion}
              datasheetUpdatedAt={datasheetUpdatedAt}
              stringCount={specValues['string_count'] || '–'}
            />
          </div>
        </div>

        {/* Category Chips */}
        {categories.length > 1 && (
          <div className="flex flex-wrap gap-2 mb-4">
            <button
              onClick={() => setActiveCategories(new Set(categories))}
              className={`rounded-full px-2 py-1 text-xs ${activeCategories.size === categories.length ? 'bg-slate-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
            >
              Alle
            </button>
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => toggleCategory(category)}
                className={`rounded-full px-2 py-1 text-xs ${activeCategories.has(category) ? 'bg-slate-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
              >
                {CATEGORY_LABELS[category]}
              </button>
            ))}
          </div>
        )}

        {/* Specs Fields */}
        <div className="space-y-4 max-h-[calc(100vh-300px)] overflow-y-auto">
          {Array.from(activeCategories).map((category) => {
            const categoryFields = getFieldsForCategory(orderType, category);
            if (categoryFields.length === 0) return null;

            return (
              <div key={category} className="space-y-2">
                <h4 className="text-xs font-medium text-slate-300 border-b border-slate-800 pb-1">
                  {CATEGORY_LABELS[category]}
                </h4>

                {/* Category Images */}
                {images?.some(img => img.scope === category) && (
                  <div className="mb-2">
                    <div className="flex gap-1 overflow-x-auto pb-1">
                      {images
                        .filter(img => img.scope === category)
                        .slice(0, 3)
                        .map((image) => {
                          const imageIndex = images?.findIndex(img => img.id === image.id) || 0;
                          return (
                            <div
                              key={image.id}
                              className="flex-shrink-0 w-12 h-12 rounded bg-slate-800 border border-slate-700 overflow-hidden cursor-pointer hover:border-slate-500 transition-colors"
                              onClick={() => setLightbox({ open: true, index: imageIndex })}
                              title={image.comment || 'Bild anzeigen'}
                            >
                              <img
                                src={image.path}
                                alt={image.comment || 'Bild'}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  target.style.display = 'none';
                                }}
                              />
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* Fields - Single Column für Sidebar */}
                <div className="space-y-2">
                  {categoryFields.map((fieldKey) => {
                    const isRequired = isFieldRequired(orderType, category, fieldKey);
                    const hasError = validationErrors[fieldKey];
                    const label = FIELD_LABELS[fieldKey] || fieldKey;

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
                          {isRequired && <span className="text-red-400">*</span>}
                        </div>

                        {fieldKey === 'pickguard' ? (
                          <PickguardInput
                            value={specValues[fieldKey] || ''}
                            onChange={(v) => updateSpec(fieldKey, v)}
                            hasError={!!hasError}
                          />
                        ) : fieldKey === 'pickup_mount_direct' ? (
                          <PickupMountInput
                            directValue={specValues['pickup_mount_direct'] || ''}
                            frameValue={specValues['pickup_mount_frame'] || ''}
                            onDirectChange={(v) => updateSpec('pickup_mount_direct', v)}
                            onFrameChange={(v) => updateSpec('pickup_mount_frame', v)}
                          />
                        ) : fieldKey === 'headstock_logo' ? (
                          <HeadstockLogoInput
                            logoValue={specValues['headstock_logo'] || ''}
                            notesValue={specValues['headstock_logo_notes'] || ''}
                            onLogoChange={(v) => updateSpec('headstock_logo', v)}
                            onNotesChange={(v) => updateSpec('headstock_logo_notes', v)}
                            hasError={!!hasError}
                          />
                        ) : fieldKey === 'customer_provides_body' || fieldKey === 'customer_provides_neck' ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id={`${fieldKey}-checkbox-sidebar`}
                              checked={isTruthySpecValue(specValues[fieldKey])}
                              onChange={(e) => updateSpec(fieldKey, e.target.checked ? 'Ja' : 'Nein')}
                              className="rounded border-slate-600 bg-slate-950 text-sky-600 focus:ring-sky-500 focus:ring-offset-0"
                            />
                            <label htmlFor={`${fieldKey}-checkbox-sidebar`} className="text-xs cursor-pointer">
                              {label}
                            </label>
                          </div>
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
                        ) : fieldKey === 'body_has_top' ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id={`body-top-checkbox-sidebar-${fieldKey}`}
                              checked={isTruthySpecValue(specValues[fieldKey])}
                              onChange={(e) => updateSpec(fieldKey, e.target.checked ? 'Ja' : 'Nein')}
                              className="rounded border-slate-600 bg-slate-950 text-sky-600 focus:ring-sky-500 focus:ring-offset-0"
                            />
                            <label htmlFor={`body-top-checkbox-sidebar-${fieldKey}`} className="text-xs cursor-pointer">
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
                          />
                        ) : (
                          <input
                            value={specValues[fieldKey] || ''}
                            onChange={(e) => updateSpec(fieldKey, e.target.value)}
                            className={`w-full rounded bg-slate-950 border px-2 py-1 text-xs ${hasError ? 'border-red-500 focus:border-red-400' : 'border-slate-800 focus:border-slate-600'}`}
                            placeholder={isRequired ? 'Pflichtfeld...' : 'Wert eingeben...'}
                          />
                        )}

                        {hasError && <div className="text-xs text-red-400 mt-0.5">{hasError}</div>}
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {activeCategories.size === 0 && (
            <div className="text-center py-4 text-slate-500 text-xs">
              Kategorie auswählen
            </div>
          )}
        </div>
      </div>

      {/* Lightbox für Bilder */}
      {lightbox.open && carouselImages.length > 0 && (
        <ImageCarouselModal
          images={carouselImages}
          index={lightbox.index}
          scopes={[]}
          onClose={() => setLightbox({ open: false, index: 0 })}
          onUpdate={async () => {}}
          onDelete={async () => {}}
        />
      )}
    </div>
  );
}
