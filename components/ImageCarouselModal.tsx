'use client';

import { useEffect, useRef, useState } from 'react';

export interface CarouselImage {
  id: string;
  path: string;
  comment?: string;
  scope?: string;
  attach: boolean;
  position: number;
  /** Bei PDFs: wenn gesetzt/erkannt, wird ein iframe statt img gerendert */
  mimeType?: string;
}

interface ImageCarouselModalProps {
  images: CarouselImage[];
  index: number;
  scopes?: string[];
  onClose: () => void;
  onUpdate: (id: string, patch: Partial<CarouselImage>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  /** Im Picker-Modus: Nur Anhang-Toggle, keine Scopes/Löschen */
  pickerMode?: boolean;
}

export default function ImageCarouselModal({
  images,
  index,
  scopes = [],
  onClose,
  onUpdate,
  onDelete,
  pickerMode = false,
}: ImageCarouselModalProps) {
  const [currentIndex, setCurrentIndex] = useState(index);
  const [currentComment, setCurrentComment] = useState<string>('');
  const touchStartXRef = useRef<number | null>(null);
  const mouseStartXRef = useRef<number | null>(null);

  const image = images[currentIndex];
  const isPdf = (m: typeof image) =>
    (m?.mimeType || '').includes('pdf') || (m?.comment || '').toLowerCase().endsWith('.pdf');

  // Synchronisiere lokalen Kommentar-State beim Bildwechsel
  useEffect(() => {
    if (image) {
      setCurrentComment(image.comment || '');
    }
  }, [currentIndex, image?.id, image?.comment]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setCurrentIndex((v) => Math.min(v + 1, images.length - 1));
      if (e.key === 'ArrowLeft') setCurrentIndex((v) => Math.max(v - 1, 0));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [images.length, onClose]);

  useEffect(() => {
    // Browser-Zurück-Integration: Öffnen pusht State; Zurück schließt
    const popHandler = () => onClose();
    const hasHistory = typeof window !== 'undefined' && window.history && window.history.pushState;
    if (hasHistory) {
      window.history.pushState({ modal: 'image' }, '');
      window.addEventListener('popstate', popHandler);
    }
    return () => {
      if (hasHistory) {
        window.removeEventListener('popstate', popHandler);
        // Beim Schließen vorwärts gehen, um den zusätzlichen History-Eintrag zu kompensieren
        try { window.history.forward(); } catch {}
      }
    };
  }, [onClose]);

  if (!image) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 text-white"
      onClick={(e) => {
        // Backdrop-Klick schließt Modal
        if (e.currentTarget === e.target) onClose();
      }}
    >
      {/* Close */}
      <button
        aria-label="Schließen"
        className="absolute right-3 top-3 z-50 flex h-11 w-11 items-center justify-center rounded-full border border-white/70 bg-slate-950/85 text-white shadow-lg shadow-black/40 backdrop-blur-md transition-colors hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-400"
        onClick={onClose}
      >
        ✕
      </button>

      {/* Arrows */}
      <button
        aria-label="Vorheriges Bild"
        className="absolute left-3 top-1/2 z-40 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-slate-950/55 backdrop-blur-md hover:bg-slate-900/80 sm:left-6"
        onClick={() => setCurrentIndex((v) => Math.max(v - 1, 0))}
      >
        ⟵
      </button>
      <button
        aria-label="Nächstes Bild"
        className="absolute right-3 top-1/2 z-40 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-slate-950/55 backdrop-blur-md hover:bg-slate-900/80 sm:right-6"
        onClick={() => setCurrentIndex((v) => Math.min(v + 1, images.length - 1))}
      >
        ⟶
      </button>

      {/* Image area */}
      <div
        className="group h-full w-full flex flex-col"
      >
        <div
          className="flex-1 flex items-center justify-center select-none relative"
          onClick={(e) => {
            // Schließen bei Klick in die "Leere" (nicht auf das Bild)
            if (e.currentTarget === e.target) onClose();
          }}
          onTouchStart={(e) => (touchStartXRef.current = e.touches[0].clientX)}
          onTouchEnd={(e) => {
            if (touchStartXRef.current == null) return;
            const dx = e.changedTouches[0].clientX - touchStartXRef.current;
            if (dx < -40) setCurrentIndex((v) => Math.min(v + 1, images.length - 1));
            if (dx > 40) setCurrentIndex((v) => Math.max(v - 1, 0));
            touchStartXRef.current = null;
          }}
          onMouseDown={(e) => (mouseStartXRef.current = e.clientX)}
          onMouseUp={(e) => {
            if (mouseStartXRef.current == null) return;
            const dx = e.clientX - mouseStartXRef.current;
            if (dx < -40) setCurrentIndex((v) => Math.min(v + 1, images.length - 1));
            if (dx > 40) setCurrentIndex((v) => Math.max(v - 1, 0));
            mouseStartXRef.current = null;
          }}
        >
          {isPdf(image) ? (
            <iframe
              src={image.path}
              title={image.comment || 'PDF'}
              className="h-[62vh] w-full max-w-4xl rounded-lg border border-white/20 bg-white sm:h-[80vh]"
            />
          ) : (
            <img
              src={image.path}
              alt={image.comment || 'Bild'}
              className={`max-h-[62vh] max-w-full object-contain rounded-lg border border-white/20 sm:max-h-[80vh] ${pickerMode ? 'cursor-pointer hover:opacity-90' : ''}`}
              onClick={pickerMode ? () => onUpdate(image.id, { attach: !image.attach }) : undefined}
            />
          )}

          {/* Subtile Positionsanzeige */}
          <div className="absolute top-3 left-3 text-xs text-white/80 bg-black/40 px-2 py-0.5 rounded border border-white/10">
            {currentIndex + 1} / {images.length}
          </div>
        </div>

        {/* Bottom tray with info/controls – modernisierte Optik */}
        <div className="border-t border-white/10 bg-gradient-to-t from-black/80 to-black/30 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-md sm:p-4">
          <div className={`mx-auto max-w-5xl ${pickerMode ? 'space-y-4' : 'grid gap-4 md:grid-cols-[1.2fr_2fr_0.6fr] items-start'}`}>
            {!pickerMode && (
              <>
                {/* Kategorien */}
                <div className="space-y-2">
                  <div className="text-xs text-slate-300">Kategorie</div>
                  <div className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
                    {scopes.map((s) => (
                      <button
                        key={s}
                        className={`min-h-9 shrink-0 rounded-full border px-2.5 py-1 text-xs transition-colors ${image.scope === s ? 'bg-sky-600 border-sky-500' : 'bg-white/10 border-white/10 hover:bg-white/15'}`}
                        onClick={() => onUpdate(image.id, { scope: s })}
                      >
                        {s}
                      </button>
                    ))}
                    <button
                      className={`min-h-9 shrink-0 rounded-full border px-2.5 py-1 text-xs transition-colors ${!image.scope ? 'bg-sky-600 border-sky-500' : 'bg-white/10 border-white/10 hover:bg-white/15'}`}
                      onClick={() => onUpdate(image.id, { scope: undefined })}
                    >
                      ohne
                    </button>
                  </div>
                  <label className="inline-flex items-center gap-2 text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={!!image.attach}
                      onChange={(e) => onUpdate(image.id, { attach: e.target.checked })}
                    />
                    Als Anhang markieren
                  </label>
                </div>

                {/* Notiz */}
                <div className="space-y-1">
                  <div className="text-xs text-slate-300">Notiz</div>
                  <textarea
                    value={currentComment}
                    placeholder="Kurze Notiz zum Bild ..."
                    onChange={(e) => setCurrentComment(e.target.value)}
                    onBlur={() => onUpdate(image.id, { comment: currentComment })}
                    className="w-full rounded-lg bg-white/5 border border-white/10 p-2 text-sm max-h-28 min-h-20 focus:outline-none focus:ring-2 focus:ring-sky-600/40"
                  />
                </div>

                {/* Aktionen */}
                <div className="flex md:flex-col gap-2 justify-end md:justify-start"></div>
              </>
            )}
            {pickerMode && (
              <label className="inline-flex items-center gap-2 text-xs text-slate-300 justify-center">
                <input
                  type="checkbox"
                  checked={!!image.attach}
                  onChange={(e) => onUpdate(image.id, { attach: e.target.checked })}
                />
                Als Anhang hinzufügen (oder Bild anklicken)
              </label>
            )}
          </div>

          {/* Thumbnails */}
          <div className="mt-3 flex gap-2 overflow-x-auto sm:mt-4">
            {images.map((im, idx) =>
              isPdf(im) ? (
                <button
                  key={im.id}
                  type="button"
                  className={`flex h-12 w-12 shrink-0 cursor-pointer flex-col items-center justify-center rounded border bg-slate-800 text-[10px] text-slate-300 sm:h-14 sm:w-14 ${idx === currentIndex ? 'border-sky-500 ring-2 ring-sky-500/30' : 'border-white/10 hover:border-white/20'} ${pickerMode && im.attach ? 'ring-2 ring-emerald-500/60' : ''}`}
                  onClick={() => setCurrentIndex(idx)}
                >
                  📄
                </button>
              ) : (
                <img
                  key={im.id}
                  src={im.path}
                  alt=""
                  className={`h-12 w-12 shrink-0 cursor-pointer rounded border object-cover sm:h-14 sm:w-14 ${idx === currentIndex ? 'border-sky-500 ring-2 ring-sky-500/30' : 'border-white/10 hover:border-white/20'} ${pickerMode && im.attach ? 'ring-2 ring-emerald-500/60' : ''}`}
                  onClick={() => setCurrentIndex(idx)}
                />
              )
            )}
          </div>
        </div>
        {/* Floating Delete Button – nur wenn nicht Picker-Modus */}
        {!pickerMode && (
          <button
            aria-label="Bild löschen"
            className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-40 rounded-full bg-red-600/90 px-4 py-3 text-white shadow-lg shadow-red-900/30 hover:bg-red-600 sm:right-6"
            onClick={() => onDelete(image.id)}
          >
            🗑
          </button>
        )}
      </div>
    </div>
  );
}
