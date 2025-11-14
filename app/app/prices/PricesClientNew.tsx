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
}

interface PricesClientNewProps {
  initialItems: PriceItemDto[];
}

export default function PricesClientNew({ initialItems }: PricesClientNewProps) {
  const [expandedCategories, setExpandedCategories] = React.useState<Set<string>>(new Set());
  const [selectedMainCategory, setSelectedMainCategory] = React.useState<string>('');

  // Haupt-Kategorien (Reparaturen / Guitar Parts)
  const mainCategories = React.useMemo(() => {
    const categories = new Set<string>();
    initialItems.forEach(item => {
      if (item.mainCategory) categories.add(item.mainCategory);
    });
    return Array.from(categories).sort();
  }, [initialItems]);

  // Gefilterte Items basierend auf ausgewählter Haupt-Kategorie
  const filteredItems = React.useMemo(() => {
    if (!selectedMainCategory) return initialItems;
    return initialItems.filter(item => item.mainCategory === selectedMainCategory);
  }, [initialItems, selectedMainCategory]);

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

  return (
    <div className="space-y-4">
      {/* Filter-Buttons für Hauptkategorien */}
      <div className="space-y-3">
        <div className="flex gap-2">
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
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-400">
          {selectedMainCategory ? `${selectedMainCategory} (${filteredItems.length})` : `Alle Leistungen (${initialItems.length})`}
        </div>
        <div className="flex gap-2">
          <button
            onClick={expandAll}
            className="text-xs text-slate-500 hover:text-sky-400 transition-colors px-2 py-1 rounded"
          >
            Alle aufklappen
          </button>
          <span className="text-slate-700">•</span>
          <button
            onClick={collapseAll}
            className="text-xs text-slate-500 hover:text-sky-400 transition-colors px-2 py-1 rounded"
          >
            Alle zuklappen
          </button>
        </div>
      </div>

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
                    {categoryItems.map((item, index) => (
                      <div
                        key={item.id}
                        className={`px-4 py-3 hover:bg-slate-800/30 transition-colors ${
                          index < categoryItems.length - 1 ? 'border-b border-slate-800' : ''
                        }`}
                      >
                        <div className="flex justify-between items-start gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-slate-200 text-sm mb-1">
                              {item.label}
                            </div>
                            {item.description && (
                              <div className="text-xs text-slate-400 leading-relaxed">
                                {item.description}
                              </div>
                            )}
                          </div>
                          <div className="flex-shrink-0 text-right">
                            <div className="text-sm font-bold text-sky-400 whitespace-nowrap">
                              {formatPrice(item)}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer Info */}
      <div className="text-xs text-slate-500 text-center py-6 border-t border-slate-800 space-y-1">
        <p>
          <strong>Hinweis:</strong> Alle Preise sind Richtpreise und können je nach Instrument, Zustand und Arbeitsaufwand variieren.
        </p>
        <p>
          Materialkosten (z.B. für Bünde, Mechaniken, Pickups, Lack) sind nicht im Grundpreis enthalten.
        </p>
      </div>
    </div>
  );
}