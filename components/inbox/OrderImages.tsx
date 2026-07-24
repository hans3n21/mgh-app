'use client';
import React, { useState, useEffect } from 'react';
import ImageCarouselModal from '@/components/ImageCarouselModal';

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

interface Props {
  orderId: string | null;
  onImagesChange?: (images: OrderImage[]) => void;
  refreshTrigger?: number; // Trigger zum Neuladen der Bilder
}

const SCOPE_LABELS: Record<string, string> = {
  body: 'Body',
  neck: 'Hals',
  headstock: 'Kopfplatte',
  fretboard: 'Griffbrett',
  hardware: 'Hardware',
  electronics: 'Elektronik',
  finish: 'Finish',
  other: 'Sonstiges',
};

const SCOPE_COLORS: Record<string, string> = {
  body: 'bg-emerald-600',
  neck: 'bg-amber-600',
  headstock: 'bg-purple-600',
  fretboard: 'bg-blue-600',
  hardware: 'bg-gray-600',
  electronics: 'bg-red-600',
  finish: 'bg-pink-600',
  other: 'bg-slate-600',
};

export default function OrderImages({ orderId, onImagesChange, refreshTrigger }: Props) {
  const [images, setImages] = useState<OrderImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [lightbox, setLightbox] = useState<{ open: boolean; index: number }>({ open: false, index: 0 });
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set());

  // Lade Bilder wenn Auftrag gewählt wird
  useEffect(() => {
    if (!orderId) {
      setImages([]);
      return;
    }

    let active = true;
    setLoading(true);
    
    (async () => {
      try {
        const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}/images`);
        
        if (!active) return;
        
        if (res.ok) {
          const fetchedImages = await res.json();
          setImages(fetchedImages);
          // Call callback only when images actually change
          if (onImagesChange) {
            onImagesChange(fetchedImages);
          }
        } else {
          console.error('OrderImages: API error:', res.status);
        }
      } catch (error) {
        console.error('Fehler beim Laden der Bilder:', error);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => { active = false; };
  }, [orderId, refreshTrigger]);

  const toggleImageSelection = (imageId: string) => {
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

  const updateImage = async (imageId: string, updates: Partial<OrderImage>) => {
    if (!orderId) return;

    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}/images`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: imageId, ...updates }),
      });

      if (res.ok) {
        const updatedImage = await res.json();
        setImages(prev => prev.map(img => img.id === imageId ? { ...img, ...updatedImage } : img));
        onImagesChange?.(images.map(img => img.id === imageId ? { ...img, ...updatedImage } : img));
      }
    } catch (error) {
      console.error('Fehler beim Aktualisieren des Bildes:', error);
    }
  };

  const deleteImage = async (imageId: string) => {
    if (!orderId) return;

    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}/images?imageId=${imageId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setImages(prev => prev.filter(img => img.id !== imageId));
        onImagesChange?.(images.filter(img => img.id !== imageId));
        setSelectedImages(prev => {
          const newSet = new Set(prev);
          newSet.delete(imageId);
          return newSet;
        });
      }
    } catch (error) {
      console.error('Fehler beim Löschen des Bildes:', error);
    }
  };

  if (!orderId) {
    return (
      <div className="text-xs text-slate-400 text-center py-4">
        Wählen Sie einen Auftrag aus, um Bilder zu sehen
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-xs text-slate-400 text-center py-4">
        Lade Bilder...
      </div>
    );
  }

  return (
    <>
      <div className="mt-1">
        <div className="flex items-center justify-between mb-1">
          <h4 className="text-xs font-medium text-slate-400">
            Auftragsbilder ({images.length})
          </h4>
          {selectedImages.size > 0 && (
            <button 
              onClick={() => setSelectedImages(new Set())}
              className="text-xs text-slate-400 hover:text-slate-300"
              title="Auswahl zurücksetzen"
            >
              Zurücksetzen
            </button>
          )}
        </div>

        {images.length === 0 ? (
          <div className="text-[11px] text-slate-500 text-center py-2 border border-dashed border-slate-700/80 rounded">
            Noch keine Bilder vorhanden
          </div>
        ) : (
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-minimal">
            {images.map((image, index) => (
              <div key={image.id} className="group relative h-14 w-14 shrink-0">
                <div
                  className={`w-full h-full border rounded bg-slate-800 overflow-hidden cursor-pointer transition-all ${
                    selectedImages.has(image.id) 
                      ? 'border-sky-500 shadow-lg shadow-sky-500/25' 
                      : 'border-slate-700 hover:border-slate-500'
                  }`}
                  onClick={() => setLightbox({ open: true, index })}
                  title={image.comment || 'Bild anzeigen'}
                >
                  <img
                    src={image.path}
                    alt={image.comment || 'Auftragsbild'}
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
                  
                  {/* Scope-Label */}
                  {image.scope && (
                    <div className={`absolute top-0.5 left-0.5 text-[9px] leading-none text-white px-1 py-0.5 rounded ${SCOPE_COLORS[image.scope] || 'bg-slate-600'}`}>
                      {SCOPE_LABELS[image.scope] || image.scope}
                    </div>
                  )}
                  
                  {/* Auswahl-Indikator */}
                  {selectedImages.has(image.id) && (
                    <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-sky-600 rounded-full flex items-center justify-center">
                      <span className="text-white text-[9px]">✓</span>
                    </div>
                  )}
                </div>

                {/* Löschen-Button (versteckt, nur bei Hover) */}
                <button
                  className="absolute top-0.5 left-0.5 w-3.5 h-3.5 bg-red-600/90 rounded text-white text-[9px] flex items-center justify-center hover:bg-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`Möchten Sie das Bild "${image.comment || 'Unbekannt'}" wirklich löschen?`)) {
                      deleteImage(image.id);
                    }
                  }}
                  title="Bild löschen"
                >
                  ✕
                </button>

                {/* Auswahl-Button (versteckt, nur bei Hover) */}
                <button
                  className="absolute top-0.5 right-0.5 w-3.5 h-3.5 bg-slate-900/80 rounded text-white text-[9px] flex items-center justify-center hover:bg-slate-900 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleImageSelection(image.id);
                  }}
                  title="Für Anhang markieren"
                >
                  {selectedImages.has(image.id) ? '✓' : '+'}
                </button>
              </div>
            ))}
          </div>
        )}

        {images.length > 0 && (
          <div className="text-[10px] text-slate-500 mt-1">
            💡 Klicken zum Vergrößern • Rechts oben klicken zum Markieren
          </div>
        )}
      </div>

      {/* Lightbox Modal */}
      {lightbox.open && (
        <ImageCarouselModal
          images={images}
          index={lightbox.index}
          scopes={Object.keys(SCOPE_LABELS)}
          onClose={() => setLightbox({ open: false, index: 0 })}
          onUpdate={updateImage}
          onDelete={deleteImage}
        />
      )}
    </>
  );
}
