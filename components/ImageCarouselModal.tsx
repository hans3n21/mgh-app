'use client';

import { useEffect, useRef, useState } from 'react';

export interface CarouselImage {
  id: string;
  path: string;
  comment?: string;
  scope?: string;
  attach: boolean;
  position: number;
}

interface ImageCarouselModalProps {
  images: CarouselImage[];
  index: number;
  scopes?: string[];
  onClose: () => void;
  onUpdate: (id: string, patch: Partial<CarouselImage>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export default function ImageCarouselModal({
  images,
  index,
  scopes = [],
  onClose,
  onUpdate,
  onDelete,
}: ImageCarouselModalProps) {
  const [currentIndex, setCurrentIndex] = useState(index);
  const touchStartXRef = useRef<number | null>(null);
  const mouseStartXRef = useRef<number | null>(null);

  const image = images[currentIndex];

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setCurrentIndex((v) => Math.min(v + 1, images.length - 1));
      if (e.key === 'ArrowLeft') setCurrentIndex((v) => Math.max(v - 1, 0));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [images.length, onClose]);

  if (!image) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/90 text-white">
      {/* Close */}
      <button
        aria-label="Schließen"
        className="absolute top-3 right-3 z-50 px-3 py-2 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/10"
        onClick={onClose}
      >
        ✕
      </button>

      {/* Arrows */}
      <button
        aria-label="Vorheriges Bild"
        className="absolute left-6 top-1/2 -translate-y-1/2 z-40 px-3 py-3 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/10"
        onClick={() => setCurrentIndex((v) => Math.max(v - 1, 0))}
      >
        ⟵
      </button>
      <button
        aria-label="Nächstes Bild"
        className="absolute right-6 top-1/2 -translate-y-1/2 z-40 px-3 py-3 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/10"
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
          <img
            src={image.path}
            alt={image.comment || 'Bild'}
            className="max-w-full max-h-[80vh] object-contain"
          />

          {/* Subtile Positionsanzeige */}
          <div className="absolute top-3 left-3 text-xs text-white/80 bg-black/40 px-2 py-0.5 rounded border border-white/10">
            {currentIndex + 1} / {images.length}
          </div>
        </div>

        {/* Bottom tray with info/controls – modernisierte Optik */}
        <div className="p-4 border-t border-white/10 bg-gradient-to-t from-black/70 to-black/20 backdrop-blur-md">
          <div className="mx-auto max-w-5xl grid gap-4 md:grid-cols-[1.2fr_2fr_0.6fr] items-start">
            {/* Kategorien */}
            <div className="space-y-2">
              <div className="text-xs text-slate-300">Kategorie</div>
              <div className="flex flex-wrap gap-2">
                {scopes.map((s) => (
                  <button
                    key={s}
                    className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${image.scope === s ? 'bg-sky-600 border-sky-500' : 'bg-white/10 border-white/10 hover:bg-white/15'}`}
                    onClick={() => onUpdate(image.id, { scope: s })}
                  >
                    {s}
                  </button>
                ))}
                <button
                  className="px-2.5 py-1 rounded-full text-xs bg-white/10 border border-white/10 hover:bg-white/15"
                  onClick={() => onUpdate(image.id, { scope: undefined })}
                >
                  ohne
                </button>
              </div>
              <label className="inline-flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  defaultChecked={image.attach}
                  onChange={(e) => onUpdate(image.id, { attach: e.target.checked })}
                />
                Als Anhang markieren
              </label>
            </div>

            {/* Notiz */}
            <div className="space-y-1">
              <div className="text-xs text-slate-300">Notiz</div>
              <textarea
                defaultValue={image.comment || ''}
                placeholder="Kurze Notiz zum Bild ..."
                onBlur={(e) => onUpdate(image.id, { comment: e.target.value })}
                className="w-full rounded-lg bg-white/5 border border-white/10 p-2 text-sm max-h-28 min-h-20 focus:outline-none focus:ring-2 focus:ring-sky-600/40"
              />
            </div>

            {/* Aktionen – Löschen als schwebender Button unten rechts */}
            <div className="flex md:flex-col gap-2 justify-end md:justify-start"></div>
          </div>

          {/* Thumbnails */}
          <div className="mt-4 overflow-x-auto flex gap-2">
            {images.map((im, idx) => (
              <img
                key={im.id}
                src={im.path}
                className={`h-14 w-14 object-cover rounded border ${idx === currentIndex ? 'border-sky-500 ring-2 ring-sky-500/30' : 'border-white/10 hover:border-white/20'}`}
                onClick={() => setCurrentIndex(idx)}
              />
            ))}
          </div>
        </div>
        {/* Floating Delete Button */}
        <button
          aria-label="Bild löschen"
          className="fixed right-6 bottom-6 z-40 px-4 py-3 rounded-full bg-red-600/90 hover:bg-red-600 text-white shadow-lg shadow-red-900/30"
          onClick={() => onDelete(image.id)}
        >
          🗑
        </button>
      </div>
    </div>
  );
}


