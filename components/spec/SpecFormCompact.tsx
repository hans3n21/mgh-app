'use client';

import { useEffect, useMemo, useState } from 'react';
import { getFieldsForCategory, getCategoriesForOrderType, FIELD_LABELS, sortSpecsByDefinedOrder } from '@/lib/order-presets';

type Props = {
  orderId?: string;
  typeKey?: string;
  value?: Record<string, string>;
  onChange: (kv: Record<string, string>) => void;
};

export default function SpecFormCompact({ orderId, typeKey, value, onChange }: Props) {
  const [resolvedType, setResolvedType] = useState<string>(typeKey || 'GUITAR');
  const [baseKv, setBaseKv] = useState<Record<string, string>>({});

  // Load order data if orderId provided
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!orderId) return;
      try {
        const res = await fetch(`/api/orders/${orderId}`);
        if (!res.ok) return;
        const order = await res.json();
        if (cancelled) return;
        setResolvedType(order.type);
        // Sortiere Specs nach der definierten Reihenfolge
        const sortedSpecs = sortSpecsByDefinedOrder(order.specs || [], order.type);
        // Entferne Duplikate: behalte den "besten" Wert pro Key
        const uniqueSpecsMap = new Map<string, typeof sortedSpecs[0]>();
        for (const spec of sortedSpecs) {
          const existing = uniqueSpecsMap.get(spec.key);
          if (!existing) {
            uniqueSpecsMap.set(spec.key, spec);
          } else {
            const existingLength = existing.value.length;
            const currentLength = spec.value.length;
            if (currentLength > existingLength) {
              uniqueSpecsMap.set(spec.key, spec as any);
            } else if (currentLength === existingLength && (spec as any).id > (existing as any).id) {
              uniqueSpecsMap.set(spec.key, spec as any);
            }
          }
        }
        const kv: Record<string, string> = {};
        for (const s of Array.from(uniqueSpecsMap.values())) kv[s.key] = s.value;
        setBaseKv(kv);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [orderId]);

  useEffect(() => {
    if (typeKey) setResolvedType(typeKey);
  }, [typeKey]);

  const categories = useMemo(() => getCategoriesForOrderType(resolvedType), [resolvedType]);
  const fields = useMemo(() => categories.flatMap((c) => getFieldsForCategory(resolvedType, c)), [categories, resolvedType]);

  const mergedValues = useMemo(() => ({ ...baseKv, ...(value || {}) }), [baseKv, value]);

  return (
    <div className="rounded border border-slate-800 p-3 space-y-2">
      {fields.map((f) => (
        <label key={f} className="block">
          <div className="text-xs text-slate-400 mb-1">{FIELD_LABELS[f] || f}</div>
          <input
            className="w-full rounded bg-slate-950 border border-slate-700 px-2 py-1 text-sm"
            value={mergedValues[f] || ''}
            onChange={(e) => onChange({ ...mergedValues, [f]: e.target.value })}
            onDragOver={(e) => { e.preventDefault(); }}
            onDrop={(e) => {
              e.preventDefault();
              const dropped = e.dataTransfer.getData('text/plain');
              if (typeof dropped === 'string' && dropped.length > 0) {
                onChange({ ...mergedValues, [f]: dropped });
              }
            }}
            placeholder="Wert eingeben…"
          />
        </label>
      ))}
    </div>
  );
}


