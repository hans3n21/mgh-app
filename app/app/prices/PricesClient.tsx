'use client';

import React from 'react';

export interface PriceItemDto {
  id: string;
  category: string;
  label: string;
  unit?: string | null;
  price?: number | null;
  min?: number | null;
  max?: number | null;
}

interface PricesClientProps {
  initialItems: PriceItemDto[];
  categories: string[];
}

export default function PricesClient({ initialItems, categories }: PricesClientProps) {
  const [query, setQuery] = React.useState('');
  const [category, setCategory] = React.useState<string>('');
  const [items, setItems] = React.useState<PriceItemDto[]>(initialItems);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      try {
        setLoading(true);
        const params = new URLSearchParams();
        if (query.trim()) params.set('q', query.trim());
        if (category) params.set('category', category);
        const res = await fetch(`/api/prices?${params.toString()}`, { signal: controller.signal });
        if (res.ok) {
          const data = (await res.json()) as PriceItemDto[];
          setItems(data);
        }
      } catch (e) {
        // Ignore aborted
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [query, category]);

  const grouped = React.useMemo(() => {
    const map = new Map<string, PriceItemDto[]>();
    for (const it of items) {
      const list = map.get(it.category) ?? [];
      list.push(it);
      map.set(it.category, list);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [items]);

  return (
    <div className="space-y-4">
      {/* Suchfeld */}
      <div className="flex flex-col gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Suche (Kategorie oder Leistung)"
          className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm"
        />
      </div>

      {/* Mobile Kategorie-Navigation (Buttons) */}
      <div className="block">
        <div className="text-xs text-slate-400 mb-2">Kategorien:</div>
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          <button
            onClick={() => setCategory('')}
            className={`flex-shrink-0 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap ${
              category === ''
                ? 'bg-sky-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            Alle
          </button>
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`flex-shrink-0 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap ${
                category === c
                  ? 'bg-sky-600 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="text-xs text-slate-400">Lade Preise...</div>
      )}

      {/* Ergebnisse */}
      <div className="space-y-6">
        {grouped.length === 0 ? (
          <div className="text-slate-500 text-sm text-center py-8">
            Keine Preise gefunden für "{query}" {category && `in Kategorie "${category}"`}
          </div>
        ) : (
          grouped.map(([cat, list]) => (
            <div key={cat}>
              <h3 className="text-sm font-semibold text-sky-400 mb-3 sticky top-0 bg-slate-900/90 backdrop-blur-sm py-2">
                {cat} ({list.length})
              </h3>
              <div className="space-y-2">
                {list.map((it) => (
                  <div key={it.id} className="rounded-lg border border-slate-800 p-3 hover:bg-slate-800/30">
                    <div className="flex justify-between items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-200">{it.label}</div>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <div className="text-sm font-semibold text-sky-400">
                          {it.price != null && it.price > 0
                            ? `${it.price} €`
                            : it.min != null || it.max != null
                            ? `${it.min ?? ''}${it.min != null && it.max != null ? '–' : ''}${it.max ?? ''} €`
                            : 'auf Anfrage'}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}


