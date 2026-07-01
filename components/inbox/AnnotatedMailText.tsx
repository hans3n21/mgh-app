'use client';

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import type { ExtractedEntity, EntityType } from '@/lib/mail/extraction';

const PII_LABEL: Record<string, string> = {
  email: 'E-Mail',
  phone: 'Telefon',
  iban: 'IBAN',
  address: 'Adresse',
  postalCode: 'PLZ/Ort',
  name: 'Name',
  customerNumber: 'Kundennr.',
};

const PII_TYPE_OPTIONS: { value: EntityType; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'email', label: 'E-Mail' },
  { value: 'phone', label: 'Telefon' },
  { value: 'address', label: 'Adresse' },
  { value: 'iban', label: 'IBAN' },
  { value: 'customerNumber', label: 'Kundennr.' },
];

interface SelectionInfo {
  text: string;
  start: number;
  end: number;
  rect: DOMRect;
}

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
];

interface AnnotatedMailTextProps {
  plaintext: string;
  entities: ExtractedEntity[];
  onEntityClick?: (entity: ExtractedEntity, rect: DOMRect) => void;
  excludedIndices?: Set<number>;
  onExcludeToggle?: (index: number) => void;
  showReviewPanel?: boolean;
  onAddEntity?: (entity: { text: string; start: number; end: number; type: EntityType }) => void;
  onRemoveEntity?: (index: number) => void;
  onApplyField?: (field: string, value: string) => void;
}

interface EntityPopup {
  globalIndex: number;
  entity: ExtractedEntity;
  rect: DOMRect;
}

export default function AnnotatedMailText({
  plaintext,
  entities,
  onEntityClick,
  excludedIndices = new Set(),
  onExcludeToggle,
  showReviewPanel = false,
  onAddEntity,
  onRemoveEntity,
  onApplyField,
}: AnnotatedMailTextProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [selection, setSelection] = useState<SelectionInfo | null>(null);
  const [entityPopup, setEntityPopup] = useState<EntityPopup | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const preRef = useRef<HTMLPreElement>(null);

  const handleEntityClick = useCallback((entity: ExtractedEntity, globalIndex: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    setEntityPopup({ globalIndex, entity, rect });
    setSelection(null);
    if (onEntityClick) onEntityClick(entity, rect);
  }, [onEntityClick]);

  const getOffsetFromNode = useCallback((node: Node, offsetInNode: number): number | null => {
    if (!preRef.current) return null;
    let el: HTMLElement | null = node.nodeType === Node.TEXT_NODE
      ? node.parentElement
      : node as HTMLElement;

    while (el && el !== preRef.current) {
      const dataOffset = el.getAttribute('data-offset');
      if (dataOffset !== null) {
        return parseInt(dataOffset, 10) + offsetInNode;
      }
      el = el.parentElement;
    }
    return null;
  }, []);

  const handleMouseUp = useCallback(() => {
    if (!onAddEntity) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) {
      setSelection(null);
      return;
    }

    const range = sel.getRangeAt(0);
    if (!preRef.current?.contains(range.startContainer)) {
      setSelection(null);
      return;
    }

    const startOffset = getOffsetFromNode(range.startContainer, range.startOffset);
    const endOffset = getOffsetFromNode(range.endContainer, range.endOffset);

    if (startOffset === null || endOffset === null || startOffset >= endOffset) {
      setSelection(null);
      return;
    }

    const selectedText = plaintext.slice(startOffset, endOffset).trim();
    if (selectedText.length < 2) {
      setSelection(null);
      return;
    }

    const trimStart = plaintext.indexOf(selectedText, startOffset);
    const rect = range.getBoundingClientRect();
    setSelection({
      text: selectedText,
      start: trimStart >= 0 ? trimStart : startOffset,
      end: (trimStart >= 0 ? trimStart : startOffset) + selectedText.length,
      rect,
    });
  }, [onAddEntity, plaintext, getOffsetFromNode]);

  useEffect(() => {
    if (!entityPopup && !selection) return;
    function handleClose(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (target.closest('[data-popup]')) return;
      setSelection(null);
      setEntityPopup(null);
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') { setSelection(null); setEntityPopup(null); }
    }
    document.addEventListener('mousedown', handleClose);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClose);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [entityPopup, selection]);

  const addAsType = useCallback((type: EntityType) => {
    if (!selection || !onAddEntity) return;
    onAddEntity({ text: selection.text, start: selection.start, end: selection.end, type });
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  }, [selection, onAddEntity]);

  const piiEntities = entities
    .map((e, i) => ({ entity: e, globalIndex: i }))
    .filter(({ entity }) => entity.pii);

  const sorted = [...piiEntities].sort((a, b) => a.entity.start - b.entity.start);

  const segments: React.ReactNode[] = [];
  let cursor = 0;

  for (let i = 0; i < sorted.length; i++) {
    const { entity, globalIndex } = sorted[i];
    if (entity.start < cursor) continue;

    const isExcluded = excludedIndices.has(globalIndex);

    if (entity.start > cursor) {
      segments.push(
        <span key={`text-${cursor}`} data-offset={cursor}>{plaintext.slice(cursor, entity.start)}</span>
      );
    }

    const isHovered = hoveredIdx === i;
    const label = PII_LABEL[entity.type] || entity.type;

    if (isExcluded) {
      segments.push(
        <span key={`entity-${i}`} data-offset={entity.start}>
          {plaintext.slice(entity.start, entity.end)}
        </span>
      );
    } else {
      segments.push(
        <span
          key={`entity-${i}`}
          data-offset={entity.start}
          className={`
            inline cursor-pointer transition-all
            underline decoration-violet-400 decoration-2 underline-offset-2
            bg-violet-500/15 rounded-sm px-0.5
            ${isHovered ? 'bg-violet-500/30 decoration-solid' : 'decoration-dotted'}
          `}
          title={`${label} – wird bei KI-Versand anonymisiert`}
          onMouseEnter={() => setHoveredIdx(i)}
          onMouseLeave={() => setHoveredIdx(null)}
          onClick={(e) => handleEntityClick(entity, globalIndex, e)}
        >
          {plaintext.slice(entity.start, entity.end)}
        </span>
      );
    }

    cursor = entity.end;
  }

  if (cursor < plaintext.length) {
    segments.push(
      <span key={`text-${cursor}`} data-offset={cursor}>{plaintext.slice(cursor)}</span>
    );
  }

  const activeCount = piiEntities.filter(({ globalIndex }) => !excludedIndices.has(globalIndex)).length;

  const groupedPii = useMemo(() => {
    const groups = new Map<string, { entity: ExtractedEntity; globalIndices: number[] }>();
    for (const { entity, globalIndex } of piiEntities) {
      const key = `${entity.type}|${entity.text}`;
      const existing = groups.get(key);
      if (existing) {
        existing.globalIndices.push(globalIndex);
      } else {
        groups.set(key, { entity, globalIndices: [globalIndex] });
      }
    }
    return Array.from(groups.values());
  }, [piiEntities]);

  const containerRect = containerRef.current?.getBoundingClientRect();
  const selectionStyle = selection && containerRect ? {
    position: 'absolute' as const,
    top: selection.rect.bottom - containerRect.top + 4,
    left: Math.max(0, selection.rect.left - containerRect.left),
    zIndex: 50,
  } : undefined;

  return (
    <div ref={containerRef} className="relative">
      <pre
        ref={preRef}
        className="whitespace-pre-wrap text-sm text-slate-200 font-sans leading-relaxed"
        onMouseUp={handleMouseUp}
      >
        {segments}
      </pre>

      {selection && selectionStyle && (
        <div data-popup style={selectionStyle} className="bg-slate-800 border border-slate-600 rounded-lg shadow-xl p-2 space-y-1.5">
          <div className="text-[10px] text-slate-400 px-1">
            &quot;{selection.text.length > 30 ? selection.text.slice(0, 30) + '...' : selection.text}&quot; markieren als:
          </div>
          <div className="flex flex-wrap gap-1">
            {PII_TYPE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => addAsType(opt.value)}
                className="px-2 py-0.5 text-[11px] rounded bg-violet-600/20 text-violet-300 hover:bg-violet-600/40 transition-colors border border-violet-500/30"
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {entityPopup && containerRect && (() => {
        const popupStyle = {
          position: 'absolute' as const,
          top: entityPopup.rect.bottom - containerRect.top + 4,
          left: Math.max(0, Math.min(entityPopup.rect.left - containerRect.left, containerRect.width - 240)),
          zIndex: 50,
        };
        const isExcluded = excludedIndices.has(entityPopup.globalIndex);
        const fieldOptions = FIELD_OPTIONS.filter(opt => opt.applicableTo.includes(entityPopup.entity.type));
        return (
          <div data-popup style={popupStyle} className="bg-slate-800 border border-slate-600 rounded-lg shadow-xl min-w-[160px] overflow-hidden">
            <div className="py-1 flex flex-col">
              <button
                className="w-full text-left px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700 transition-colors"
                onClick={() => {
                  navigator.clipboard?.writeText(entityPopup.entity.text);
                  setEntityPopup(null);
                }}
              >
                Kopieren
              </button>
              {onExcludeToggle && (
                <button
                  className={`w-full text-left px-3 py-1.5 text-xs transition-colors hover:bg-slate-700 ${
                    isExcluded ? 'text-violet-300' : 'text-amber-300'
                  }`}
                  onClick={() => {
                    onExcludeToggle(entityPopup.globalIndex);
                    setEntityPopup(null);
                  }}
                >
                  {isExcluded ? 'Wieder anonymisieren' : 'Nicht anonymisieren'}
                </button>
              )}
              {onRemoveEntity && (
                <button
                  className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-slate-700 transition-colors"
                  onClick={() => {
                    onRemoveEntity(entityPopup.globalIndex);
                    setEntityPopup(null);
                  }}
                >
                  Entfernen
                </button>
              )}
              {fieldOptions.length > 0 && onApplyField && (
                <>
                  <div className="border-t border-slate-700 my-0.5" />
                  {fieldOptions.map(opt => (
                    <button
                      key={opt.field}
                      className="w-full text-left px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-700 hover:text-slate-300 transition-colors"
                      onClick={() => {
                        onApplyField(opt.field, entityPopup.entity.text);
                        setEntityPopup(null);
                      }}
                    >
                      → {opt.label}
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>
        );
      })()}

      <div className="mt-3 pt-3 border-t border-slate-700/50 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-violet-400/80">
            {activeCount} {activeCount === 1 ? 'Stelle' : 'Stellen'} werden bei KI-Versand anonymisiert
          </span>
        </div>

        {showReviewPanel && (onExcludeToggle || onRemoveEntity) && (
          <div className="space-y-1">
            {groupedPii.map(({ entity, globalIndices }, i) => {
              const allExcluded = globalIndices.every(idx => excludedIndices.has(idx));
              const label = PII_LABEL[entity.type] || entity.type;
              const count = globalIndices.length;
              return (
                <div
                  key={`review-${i}`}
                  className={`flex items-center gap-2 px-2 py-1 rounded text-xs transition-colors ${
                    allExcluded ? 'text-slate-500' : 'text-slate-300 bg-violet-500/5'
                  } hover:bg-slate-800`}
                >
                  {onExcludeToggle && (
                    <input
                      type="checkbox"
                      checked={!allExcluded}
                      onChange={() => {
                        for (const idx of globalIndices) {
                          const isExcluded = excludedIndices.has(idx);
                          if (!allExcluded && !isExcluded) onExcludeToggle(idx);
                          if (allExcluded && isExcluded) onExcludeToggle(idx);
                        }
                      }}
                      className="rounded border-slate-600 bg-slate-900 text-violet-500 focus:ring-violet-500/30 h-3.5 w-3.5 cursor-pointer"
                    />
                  )}
                  <span className={`text-[10px] uppercase tracking-wider font-medium w-14 ${allExcluded ? 'text-slate-600' : 'text-violet-400/70'}`}>
                    {label}
                  </span>
                  <span className={`truncate flex-1 ${allExcluded ? 'line-through' : ''}`}>
                    {entity.text}
                  </span>
                  {count > 1 && (
                    <span className="text-[10px] text-slate-500 tabular-nums">{count}×</span>
                  )}
                  {onRemoveEntity && entity.source === 'manual' && (
                    <button
                      onClick={() => { for (const idx of globalIndices) onRemoveEntity(idx); }}
                      className="text-red-400/60 hover:text-red-400 text-[10px] ml-auto"
                      title="Entfernen"
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
