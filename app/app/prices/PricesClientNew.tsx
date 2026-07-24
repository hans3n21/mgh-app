'use client';

import React from 'react';

export interface PriceItemDto {
  id: string;
  category: string;
  label: string;
  description?: string | null;
  unit?: string | null;
  price?: number | null;
  min?: number | null;
  max?: number | null;
  priceText?: string | null;
  mainCategory?: string | null;
  active?: boolean;
}

interface PricesClientNewProps {
  initialItems: PriceItemDto[];
}

export default function PricesClientNew({ initialItems }: PricesClientNewProps) {
  const [items, setItems] = React.useState<PriceItemDto[]>(initialItems);
  const [expandedCategories, setExpandedCategories] = React.useState<Set<string>>(new Set());
  const [selectedMainCategory, setSelectedMainCategory] = React.useState<string>('');
  const [editingItem, setEditingItem] = React.useState<PriceItemDto | null>(null);
  const [showAddModal, setShowAddModal] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  // Haupt-Kategorien (Reparaturen / Guitar Parts)
  const mainCategories = React.useMemo(() => {
    const categories = new Set<string>();
    items.forEach(item => {
      if (item.mainCategory) categories.add(item.mainCategory);
    });
    return Array.from(categories).sort();
  }, [items]);

  // Gefilterte Items basierend auf ausgewählter Haupt-Kategorie
  const filteredItems = React.useMemo(() => {
    if (!selectedMainCategory) return items;
    return items.filter(item => item.mainCategory === selectedMainCategory);
  }, [items, selectedMainCategory]);

  // Gruppierung nach Kategorien
  const grouped = React.useMemo(() => {
    const map = new Map<string, PriceItemDto[]>();
    for (const item of filteredItems) {
      const list = map.get(item.category) ?? [];
      list.push(item);
      map.set(item.category, list);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredItems]);

  const formatPrice = (item: PriceItemDto) => {
    if (item.priceText) return item.priceText;
    if (item.price != null && item.price > 0) return `${item.price} €`;
    if (item.min != null || item.max != null) {
      return `${item.min ?? ''}${item.min != null && item.max != null ? '–' : ''}${item.max ?? ''} €`;
    }
    return 'auf Anfrage';
  };

  const toggleCategory = (categoryName: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(categoryName)) {
      newExpanded.delete(categoryName);
    } else {
      newExpanded.add(categoryName);
    }
    setExpandedCategories(newExpanded);
  };

  const expandAll = () => {
    const allCategories = new Set(grouped.map(([name]) => name));
    setExpandedCategories(allCategories);
  };

  const collapseAll = () => {
    setExpandedCategories(new Set());
  };

  const handleEdit = (item: PriceItemDto) => {
    setEditingItem({ ...item });
  };

  const handleSave = async () => {
    if (!editingItem) return;

    setSaving(true);
    try {
      const response = await fetch(`/api/prices/${editingItem.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: editingItem.category,
          label: editingItem.label,
          description: editingItem.description || null,
          unit: editingItem.unit || null,
          price: editingItem.price || null,
          min: editingItem.min || null,
          max: editingItem.max || null,
          priceText: editingItem.priceText || null,
          mainCategory: editingItem.mainCategory || null,
        }),
      });

      if (response.ok) {
        const updatedItem = await response.json();
        setItems(items.map(item => item.id === updatedItem.id ? updatedItem : item));
        setEditingItem(null);
      } else {
        const error = await response.json();
        alert(`Fehler beim Speichern: ${error.error || 'Unbekannter Fehler'}`);
      }
    } catch (error) {
      console.error('Fehler beim Speichern:', error);
      alert('Fehler beim Speichern der Änderungen');
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = async (newItem: Omit<PriceItemDto, 'id'>) => {
    setSaving(true);
    try {
      const response = await fetch('/api/prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: newItem.category,
          label: newItem.label,
          description: newItem.description || null,
          unit: newItem.unit || null,
          price: newItem.price || null,
          min: newItem.min || null,
          max: newItem.max || null,
          priceText: newItem.priceText || null,
          mainCategory: newItem.mainCategory || null,
          active: true,
        }),
      });

      if (response.ok) {
        const createdItem = await response.json();
        setItems([...items, createdItem]);
        setShowAddModal(false);
        // Kategorie aufklappen, wenn sie geschlossen ist
        if (createdItem.category) {
          setExpandedCategories(prev => new Set([...Array.from(prev), createdItem.category]));
        }
      } else {
        const error = await response.json();
        alert(`Fehler beim Hinzufügen: ${error.error || 'Unbekannter Fehler'}`);
      }
    } catch (error) {
      console.error('Fehler beim Hinzufügen:', error);
      alert('Fehler beim Hinzufügen der neuen Leistung');
    } finally {
      setSaving(false);
    }
  };

  // Eindeutige Kategorien für Dropdown
  const uniqueCategories = React.useMemo(() => {
    const cats = new Set<string>();
    items.forEach(item => {
      if (item.category) cats.add(item.category);
    });
    return Array.from(cats).sort();
  }, [items]);

  return (
    <div className="space-y-4 pb-16 sm:pb-0">
      {/* Filter-Buttons für Hauptkategorien */}
      <div className="space-y-3">
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-2 px-2">
          <button
            onClick={() => setSelectedMainCategory('')}
            className={`flex-shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-all ${
              selectedMainCategory === ''
                ? 'bg-sky-600 text-white shadow-lg shadow-sky-600/25'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            Alle
          </button>
          {mainCategories.map((mainCat) => (
            <button
              key={mainCat}
              onClick={() => setSelectedMainCategory(mainCat)}
              className={`flex-shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-all whitespace-nowrap ${
                selectedMainCategory === mainCat
                  ? 'bg-sky-600 text-white shadow-lg shadow-sky-600/25'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {mainCat}
            </button>
          ))}
        </div>
      </div>

      {/* Kontrollen */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-slate-400">
          {selectedMainCategory ? `${selectedMainCategory} (${filteredItems.length})` : `Alle Leistungen (${items.length})`}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowAddModal(true)}
            className="w-full sm:w-auto text-sm bg-sky-600 hover:bg-sky-700 text-white px-4 py-2 rounded-lg transition-colors font-medium"
          >
            + Neue Leistung
          </button>
          <button
            onClick={expandAll}
            className="text-xs text-slate-500 hover:text-sky-400 transition-colors px-2 py-1 rounded"
          >
            Alle aufklappen
          </button>
          <button
            onClick={collapseAll}
            className="text-xs text-slate-500 hover:text-sky-400 transition-colors px-2 py-1 rounded"
          >
            Alle zuklappen
          </button>
        </div>
      </div>

      {/* Mobile: Inline-Hinzufügen */}
      {showAddModal && (
        <div className="sm:hidden">
          <AddInlineForm
            categories={uniqueCategories}
            mainCategories={mainCategories}
            onClose={() => setShowAddModal(false)}
            onSave={handleAdd}
            saving={saving}
          />
        </div>
      )}

      {/* Kategorien */}
      <div className="space-y-1">
        {grouped.length === 0 ? (
          <div className="text-slate-500 text-center py-12 space-y-3">
            <div className="text-5xl opacity-50">📋</div>
            <div className="text-lg font-medium">Keine Preise verfügbar</div>
          </div>
        ) : (
          grouped.map(([categoryName, categoryItems]) => {
            const isExpanded = expandedCategories.has(categoryName);
            return (
              <div key={categoryName} className="border border-slate-800 rounded-lg overflow-hidden">
                {/* Kategorie Header - Klickbar zum Aufklappen */}
                <button
                  onClick={() => toggleCategory(categoryName)}
                  className="w-full px-4 py-3 bg-slate-800/50 hover:bg-slate-800/70 transition-colors flex items-center justify-between group"
                >
                  <div className="flex items-center gap-3">
                    <div className={`transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>
                      <svg className="w-4 h-4 text-slate-400 group-hover:text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                    <h3 className="text-sm font-semibold text-slate-200 group-hover:text-sky-400 transition-colors text-left">
                      {categoryName}
                    </h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs bg-slate-700 text-slate-300 px-2 py-1 rounded-full">
                      {categoryItems.length}
                    </span>
                  </div>
                </button>

                {/* Items - Eingeklappt/Aufgeklappt */}
                {isExpanded && (
                  <div className="border-t border-slate-700">
                    {categoryItems.map((item, index) => {
                      const priceStr = formatPrice(item);
                      const hasLongPrice = !!item.priceText && priceStr.length > 25;
                      return (
                      <div
                        key={item.id}
                        className={`px-4 py-3 hover:bg-slate-800/30 transition-colors ${
                          index < categoryItems.length - 1 ? 'border-b border-slate-800' : ''
                        }`}
                      >
                        {/* Mobile: vertikales Stapel-Layout; Desktop: nebeneinander */}
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 sm:gap-4">
                          <div className="flex-1 min-w-0 flex flex-col gap-1 overflow-hidden">
                            <div className="flex items-center gap-2">
                              <div className="font-medium text-slate-200 text-sm">
                                {item.label}
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEdit(item);
                                }}
                                className="text-slate-500 hover:text-sky-400 transition-colors p-1 rounded flex-shrink-0"
                                title="Bearbeiten"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>
                            </div>
                            {item.description && (
                              <div className="text-xs text-slate-400 leading-relaxed break-words whitespace-pre-line">
                                {item.description}
                              </div>
                            )}
                          </div>
                          <div className={`flex-shrink-0 sm:text-right pt-1 sm:pt-0 border-t border-slate-800/50 sm:border-t-0 ${hasLongPrice ? '' : 'sm:whitespace-nowrap'}`}>
                            <div className="text-sm font-bold text-sky-400 break-words min-w-0">
                              {priceStr}
                            </div>
                          </div>
                        </div>
                      </div>
                    );})}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer Info */}
      <div className="border-t border-slate-800">
        <div className="md:hidden text-xs text-slate-500 text-center py-3 flex items-center justify-center gap-3">
          <span title="Richtpreise, je nach Aufwand">i</span>
          <span title="Materialkosten nicht enthalten">m</span>
        </div>
        <div className="hidden md:block text-xs text-slate-500 text-center py-6 space-y-1">
          <p>
            <strong>Hinweis:</strong> Alle Preise sind Richtpreise und können je nach Instrument, Zustand und Arbeitsaufwand variieren.
          </p>
          <p>
            Materialkosten (z.B. für Bünde, Mechaniken, Pickups, Lack) sind nicht im Grundpreis enthalten.
          </p>
        </div>
      </div>

      {/* Mobile Sticky Add Bar */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-slate-800 bg-slate-950/95 backdrop-blur px-4 py-3">
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="w-full rounded-lg bg-sky-600 hover:bg-sky-700 text-white px-4 py-2 text-sm font-medium"
        >
          + Neue Leistung
        </button>
      </div>

      {/* Bearbeitungs-Modal */}
      {editingItem && (
        <EditModal
          item={editingItem}
          categories={uniqueCategories}
          mainCategories={mainCategories}
          onClose={() => setEditingItem(null)}
          onSave={handleSave}
          onChange={(updates) => setEditingItem({ ...editingItem, ...updates })}
          saving={saving}
        />
      )}

      {/* Hinzufügen-Modal (nur Desktop) */}
      {showAddModal && (
        <div className="hidden sm:block">
          <AddModal
            categories={uniqueCategories}
            mainCategories={mainCategories}
            onClose={() => setShowAddModal(false)}
            onSave={handleAdd}
            saving={saving}
          />
        </div>
      )}
    </div>
  );
}

// Bearbeitungs-Modal Komponente
function EditModal({
  item,
  categories,
  mainCategories,
  onClose,
  onSave,
  onChange,
  saving,
}: {
  item: PriceItemDto;
  categories: string[];
  mainCategories: string[];
  onClose: () => void;
  onSave: () => void;
  onChange: (updates: Partial<PriceItemDto>) => void;
  saving: boolean;
}) {
  const [priceType, setPriceType] = React.useState<'fixed' | 'range' | 'text'>(
    item.priceText ? 'text' : item.min != null || item.max != null ? 'range' : 'fixed'
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-800 rounded-lg max-w-2xl w-full max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 border-b border-slate-800 flex-shrink-0">
          <h2 className="text-lg font-semibold text-slate-200">Leistung bearbeiten</h2>
        </div>
        <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Kategorie *</label>
            <input
              type="text"
              value={item.category}
              onChange={(e) => onChange({ category: e.target.value })}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
              list="categories-list"
            />
            <datalist id="categories-list">
              {categories.map(cat => <option key={cat} value={cat} />)}
            </datalist>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Hauptkategorie</label>
            <select
              value={item.mainCategory || ''}
              onChange={(e) => onChange({ mainCategory: e.target.value || null })}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
            >
              <option value="">Keine</option>
              {mainCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Titel/Name *</label>
            <input
              type="text"
              value={item.label}
              onChange={(e) => onChange({ label: e.target.value })}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Beschreibung</label>
            <textarea
              value={item.description || ''}
              onChange={(e) => onChange({ description: e.target.value || null })}
              rows={3}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Preisart</label>
            <div className="flex gap-4 mb-3">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={priceType === 'fixed'}
                  onChange={() => {
                    setPriceType('fixed');
                    onChange({ priceText: null, min: null, max: null });
                  }}
                  className="text-sky-500"
                />
                <span className="text-sm text-slate-300">Fester Preis</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={priceType === 'range'}
                  onChange={() => {
                    setPriceType('range');
                    onChange({ priceText: null, price: null });
                  }}
                  className="text-sky-500"
                />
                <span className="text-sm text-slate-300">Preisspanne</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={priceType === 'text'}
                  onChange={() => {
                    setPriceType('text');
                    onChange({ price: null, min: null, max: null });
                  }}
                  className="text-sky-500"
                />
                <span className="text-sm text-slate-300">Freitext</span>
              </label>
            </div>

            {priceType === 'fixed' && (
              <div className="flex gap-2">
                <input
                  type="number"
                  value={item.price || ''}
                  onChange={(e) => onChange({ price: e.target.value ? parseInt(e.target.value) : null })}
                  placeholder="Preis in €"
                  min="0"
                  step="1"
                  className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
                <span className="text-slate-400 py-2">€</span>
              </div>
            )}

            {priceType === 'range' && (
              <div className="flex gap-2">
                <input
                  type="number"
                  value={item.min || ''}
                  onChange={(e) => onChange({ min: e.target.value ? parseInt(e.target.value) : null })}
                  placeholder="Min"
                  min="0"
                  step="1"
                  className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
                <span className="text-slate-400 py-2">–</span>
                <input
                  type="number"
                  value={item.max || ''}
                  onChange={(e) => onChange({ max: e.target.value ? parseInt(e.target.value) : null })}
                  placeholder="Max"
                  min="0"
                  step="1"
                  className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
                <span className="text-slate-400 py-2">€</span>
              </div>
            )}

            {priceType === 'text' && (
              <input
                type="text"
                value={item.priceText || ''}
                onChange={(e) => onChange({ priceText: e.target.value || null })}
                placeholder="z.B. '45 € zzgl. Material' oder 'auf Anfrage'"
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            )}
          </div>
        </div>
        <div className="p-4 sm:p-6 border-t border-slate-800 flex justify-end gap-3 flex-shrink-0 bg-slate-900">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded transition-colors disabled:opacity-50"
          >
            Abbrechen
          </button>
          <button
            onClick={onSave}
            disabled={saving || !item.category || !item.label}
            className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Speichern...' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Hinzufügen-Modal Komponente
function AddModal({
  categories,
  mainCategories,
  onClose,
  onSave,
  saving,
}: {
  categories: string[];
  mainCategories: string[];
  onClose: () => void;
  onSave: (item: Omit<PriceItemDto, 'id'>) => void;
  saving: boolean;
}) {
  const [newItem, setNewItem] = React.useState<Omit<PriceItemDto, 'id'>>({
    category: '',
    label: '',
    description: null,
    unit: null,
    price: null,
    min: null,
    max: null,
    priceText: null,
    mainCategory: null,
    active: true,
  });
  const [priceType, setPriceType] = React.useState<'fixed' | 'range' | 'text'>('fixed');

  const handleSave = () => {
    if (!newItem.category || !newItem.label) {
      alert('Bitte füllen Sie mindestens Kategorie und Titel aus.');
      return;
    }
    onSave(newItem);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-800 rounded-lg max-w-2xl w-full max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 border-b border-slate-800 flex-shrink-0">
          <h2 className="text-lg font-semibold text-slate-200">Neue Leistung hinzufügen</h2>
        </div>
        <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Kategorie *</label>
            <input
              type="text"
              value={newItem.category}
              onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
              list="add-categories-list"
            />
            <datalist id="add-categories-list">
              {categories.map(cat => <option key={cat} value={cat} />)}
            </datalist>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Hauptkategorie</label>
            <select
              value={newItem.mainCategory || ''}
              onChange={(e) => setNewItem({ ...newItem, mainCategory: e.target.value || null })}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
            >
              <option value="">Keine</option>
              {mainCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Titel/Name *</label>
            <input
              type="text"
              value={newItem.label}
              onChange={(e) => setNewItem({ ...newItem, label: e.target.value })}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Beschreibung</label>
            <textarea
              value={newItem.description || ''}
              onChange={(e) => setNewItem({ ...newItem, description: e.target.value || null })}
              rows={3}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Preisart</label>
            <div className="flex gap-4 mb-3">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={priceType === 'fixed'}
                  onChange={() => {
                    setPriceType('fixed');
                    setNewItem({ ...newItem, priceText: null, min: null, max: null });
                  }}
                  className="text-sky-500"
                />
                <span className="text-sm text-slate-300">Fester Preis</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={priceType === 'range'}
                  onChange={() => {
                    setPriceType('range');
                    setNewItem({ ...newItem, priceText: null, price: null });
                  }}
                  className="text-sky-500"
                />
                <span className="text-sm text-slate-300">Preisspanne</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={priceType === 'text'}
                  onChange={() => {
                    setPriceType('text');
                    setNewItem({ ...newItem, price: null, min: null, max: null });
                  }}
                  className="text-sky-500"
                />
                <span className="text-sm text-slate-300">Freitext</span>
              </label>
            </div>

            {priceType === 'fixed' && (
              <div className="flex gap-2">
                <input
                  type="number"
                  value={newItem.price || ''}
                  onChange={(e) => setNewItem({ ...newItem, price: e.target.value ? parseInt(e.target.value) : null })}
                  placeholder="Preis in €"
                  min="0"
                  step="1"
                  className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
                <span className="text-slate-400 py-2">€</span>
              </div>
            )}

            {priceType === 'range' && (
              <div className="flex gap-2">
                <input
                  type="number"
                  value={newItem.min || ''}
                  onChange={(e) => setNewItem({ ...newItem, min: e.target.value ? parseInt(e.target.value) : null })}
                  placeholder="Min"
                  min="0"
                  step="1"
                  className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
                <span className="text-slate-400 py-2">–</span>
                <input
                  type="number"
                  value={newItem.max || ''}
                  onChange={(e) => setNewItem({ ...newItem, max: e.target.value ? parseInt(e.target.value) : null })}
                  placeholder="Max"
                  min="0"
                  step="1"
                  className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
                <span className="text-slate-400 py-2">€</span>
              </div>
            )}

            {priceType === 'text' && (
              <input
                type="text"
                value={newItem.priceText || ''}
                onChange={(e) => setNewItem({ ...newItem, priceText: e.target.value || null })}
                placeholder="z.B. '45 € zzgl. Material' oder 'auf Anfrage'"
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            )}
          </div>
        </div>
        <div className="p-4 sm:p-6 border-t border-slate-800 flex justify-end gap-3 flex-shrink-0 bg-slate-900">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded transition-colors disabled:opacity-50"
          >
            Abbrechen
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !newItem.category || !newItem.label}
            className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Hinzufügen...' : 'Hinzufügen'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AddInlineForm({
  categories,
  mainCategories,
  onClose,
  onSave,
  saving,
}: {
  categories: string[];
  mainCategories: string[];
  onClose: () => void;
  onSave: (item: Omit<PriceItemDto, 'id'>) => void;
  saving: boolean;
}) {
  const [newItem, setNewItem] = React.useState<Omit<PriceItemDto, 'id'>>({
    category: '',
    label: '',
    description: null,
    unit: null,
    price: null,
    min: null,
    max: null,
    priceText: null,
    mainCategory: null,
    active: true,
  });
  const [priceType, setPriceType] = React.useState<'fixed' | 'range' | 'text'>('fixed');

  const handleSave = () => {
    if (!newItem.category || !newItem.label) {
      alert('Bitte füllen Sie mindestens Kategorie und Titel aus.');
      return;
    }
    onSave(newItem);
  };

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200">Neue Leistung</h3>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-slate-400 hover:text-slate-200"
        >
          Schließen
        </button>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1">Kategorie *</label>
        <input
          type="text"
          value={newItem.category}
          onChange={(e) => setNewItem(prev => ({ ...prev, category: e.target.value }))}
          className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
          list="add-categories-list"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1">Hauptkategorie</label>
        <select
          value={newItem.mainCategory || ''}
          onChange={(e) => setNewItem(prev => ({ ...prev, mainCategory: e.target.value || null }))}
          className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
        >
          <option value="">Keine</option>
          {mainCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1">Titel/Name *</label>
        <input
          type="text"
          value={newItem.label}
          onChange={(e) => setNewItem(prev => ({ ...prev, label: e.target.value }))}
          className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1">Beschreibung</label>
        <textarea
          value={newItem.description || ''}
          onChange={(e) => setNewItem(prev => ({ ...prev, description: e.target.value || null }))}
          rows={3}
          className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">Preisart</label>
        <div className="flex gap-4 mb-3">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={priceType === 'fixed'}
              onChange={() => {
                setPriceType('fixed');
                setNewItem(prev => ({ ...prev, priceText: null, min: null, max: null }));
              }}
              className="text-sky-500"
            />
            <span className="text-sm text-slate-300">Fester Preis</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={priceType === 'range'}
              onChange={() => {
                setPriceType('range');
                setNewItem(prev => ({ ...prev, priceText: null, price: null }));
              }}
              className="text-sky-500"
            />
            <span className="text-sm text-slate-300">Preisspanne</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={priceType === 'text'}
              onChange={() => {
                setPriceType('text');
                setNewItem(prev => ({ ...prev, price: null, min: null, max: null }));
              }}
              className="text-sky-500"
            />
            <span className="text-sm text-slate-300">Freitext</span>
          </label>
        </div>

        {priceType === 'fixed' && (
          <div className="flex gap-2">
            <input
              type="number"
              value={newItem.price || ''}
              onChange={(e) => setNewItem(prev => ({ ...prev, price: e.target.value ? parseInt(e.target.value) : null }))}
              placeholder="Preis in €"
              min="0"
              step="1"
              className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
            <span className="text-slate-400 py-2">€</span>
          </div>
        )}

        {priceType === 'range' && (
          <div className="flex gap-2">
            <input
              type="number"
              value={newItem.min || ''}
              onChange={(e) => setNewItem(prev => ({ ...prev, min: e.target.value ? parseInt(e.target.value) : null }))}
              placeholder="Min"
              min="0"
              step="1"
              className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
            <span className="text-slate-400 py-2">–</span>
            <input
              type="number"
              value={newItem.max || ''}
              onChange={(e) => setNewItem(prev => ({ ...prev, max: e.target.value ? parseInt(e.target.value) : null }))}
              placeholder="Max"
              min="0"
              step="1"
              className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
            <span className="text-slate-400 py-2">€</span>
          </div>
        )}

        {priceType === 'text' && (
          <input
            type="text"
            value={newItem.priceText || ''}
            onChange={(e) => setNewItem(prev => ({ ...prev, priceText: e.target.value || null }))}
            placeholder="z.B. '45 € zzgl. Material' oder 'auf Anfrage'"
            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving || !newItem.category || !newItem.label}
          className="flex-1 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Speichern...' : 'Speichern'}
        </button>
        <button
          onClick={onClose}
          disabled={saving}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded transition-colors disabled:opacity-50"
        >
          Abbrechen
        </button>
      </div>
    </div>
  );
}