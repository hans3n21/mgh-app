'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { ExtractedEntity, EntityType } from '@/lib/mail/extraction';

interface FieldOption {
  field: string;
  label: string;
  applicableTo: EntityType[];
}

const FIELD_OPTIONS: FieldOption[] = [
  { field: 'customer.email',        label: 'Kunden-E-Mail',       applicableTo: ['email'] },
  { field: 'customer.phone',        label: 'Telefonnummer',       applicableTo: ['phone'] },
  { field: 'customer.name',         label: 'Kundenname',          applicableTo: ['name'] },
  { field: 'customer.addressLine1', label: 'Straße',              applicableTo: ['address'] },
  { field: 'customer.postalCode',   label: 'PLZ',                 applicableTo: ['postalCode'] },
  { field: 'customer.city',         label: 'Stadt',               applicableTo: ['postalCode'] },
  { field: 'order.iban',            label: 'IBAN',                applicableTo: ['iban'] },
  { field: 'order.type',            label: 'Auftragstyp',         applicableTo: ['instrumentType'] },
];

interface EntityContextMenuProps {
  entity: ExtractedEntity;
  rect: DOMRect;
  orderId?: string | null;
  mailId: string;
  onApply: (field: string, value: string) => void;
  onClose: () => void;
}

export default function EntityContextMenu({
  entity,
  rect,
  onApply,
  onClose,
}: EntityContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  useEffect(() => {
    const top = rect.bottom + 4;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - 280));
    setPosition({ top, left });
  }, [rect]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [onClose]);

  const options = FIELD_OPTIONS.filter((opt) => opt.applicableTo.includes(entity.type));

  return (
    <div
      ref={menuRef}
      className="fixed z-[100] min-w-[220px] bg-slate-800 border border-slate-600 rounded-lg shadow-xl py-1 animate-in fade-in zoom-in-95 duration-150"
      style={{ top: position.top, left: position.left }}
    >
      <div className="px-3 py-2 border-b border-slate-700">
        <p className="text-xs text-slate-400 truncate">Wert: <strong className="text-slate-200">{entity.text}</strong></p>
        <p className="text-[10px] text-slate-500 mt-0.5">
          Typ: {entity.type} · Quelle: {entity.source} · {Math.round(entity.confidence * 100)}%
        </p>
      </div>

      {options.length > 0 ? (
        <div className="py-1">
          <p className="px-3 py-1 text-[10px] uppercase tracking-wider text-slate-500 font-medium">
            Übernehmen als…
          </p>
          {options.map((opt) => (
            <button
              key={opt.field}
              className="w-full text-left px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700 transition-colors"
              onClick={() => {
                onApply(opt.field, entity.text);
                onClose();
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      ) : (
        <div className="px-3 py-2">
          <p className="text-xs text-slate-400">Keine Zuordnung für diesen Typ verfügbar.</p>
        </div>
      )}

      <div className="border-t border-slate-700 py-1">
        <button
          className="w-full text-left px-3 py-1.5 text-sm text-slate-400 hover:bg-slate-700 hover:text-slate-200 transition-colors"
          onClick={() => {
            if (navigator.clipboard) {
              navigator.clipboard.writeText(entity.text);
            }
            onClose();
          }}
        >
          Kopieren
        </button>
      </div>
    </div>
  );
}
