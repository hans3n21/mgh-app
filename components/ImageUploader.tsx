'use client';

import { useState, useRef } from 'react';
import ImageCarouselModal, { type CarouselImage } from './ImageCarouselModal';

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

interface ImageUploaderProps {
  orderId: string;
  images: OrderImage[];
  allowedScopes?: string[];
  onImagesChange: (images: OrderImage[]) => void;
}

export default function ImageUploader({ orderId, images, allowedScopes, onImagesChange }: ImageUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [newImageUrl, setNewImageUrl] = useState('');
  const [newImageComment, setNewImageComment] = useState('');
  const [selectedScope, setSelectedScope] = useState<string>('');
  const [selectedFieldKey, setSelectedFieldKey] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showUpload, setShowUpload] = useState(true);
  const [lightbox, setLightbox] = useState<{ open: boolean; index: number }>({ open: false, index: 0 });
  const carouselImages: CarouselImage[] = images.map((img) => ({
    id: img.id,
    path: img.path,
    comment: img.comment,
    scope: img.scope,
    attach: img.attach,
    position: img.position,
  }));

  const updateImage = async (id: string, patch: Partial<OrderImage>) => {
    const res = await fetch(`/api/orders/${orderId}/images`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...patch }),
    });
    if (res.ok) {
      const updated = await res.json();
      onImagesChange(images.map((img) => (img.id === id ? updated : img)));
    }
  };

  const addImageByUrl = async () => {
    if (!newImageUrl.trim()) return;

    setUploading(true);
    try {
      const response = await fetch(`/api/orders/${orderId}/images`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: newImageUrl.trim(),
          comment: newImageComment.trim() || undefined,
          position: images.length,
          scope: selectedScope || undefined,
          fieldKey: selectedFieldKey || undefined,
        }),
      });

      if (response.ok) {
        const newImage = await response.json();
        onImagesChange([...images, newImage]);
        setNewImageUrl('');
        setNewImageComment('');
        setSelectedScope('');
        setSelectedFieldKey('');
      }
    } catch (error) {
      console.error('Fehler beim Hinzufügen:', error);
      alert('Fehler beim Hinzufügen des Bildes');
    } finally {
      setUploading(false);
    }
  };

  const deleteImage = async (imageId: string) => {
    try {
      const response = await fetch(`/api/orders/${orderId}/images?imageId=${imageId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        onImagesChange(images.filter(img => img.id !== imageId));
      }
    } catch (error) {
      console.error('Fehler beim Löschen:', error);
      alert('Fehler beim Löschen des Bildes');
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    
    // Mehrere Dateien parallel verarbeiten
    const createdImages: OrderImage[] = [];
    const uploadPromises = Array.from(files).map((file, index) => {
      return new Promise<void>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
          try {
            const dataUrl = e.target?.result as string;
            const response = await fetch(`/api/orders/${orderId}/images`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                path: dataUrl,
                comment: `Hochgeladen: ${file.name}`,
                position: images.length + index,
                scope: selectedScope || undefined,
                fieldKey: selectedFieldKey || undefined,
              }),
            });

            if (response.ok) {
              const newImage: OrderImage = await response.json();
              createdImages.push(newImage);
            }
            resolve();
          } catch (error) {
            console.error(`Fehler beim Upload von ${file.name}:`, error);
            reject(error);
          }
        };
        reader.readAsDataURL(file);
      });
    });

    // Warte auf alle Uploads
    Promise.allSettled(uploadPromises).then((results) => {
      const failed = results.filter(r => r.status === 'rejected').length;
      if (failed > 0) {
        alert(`${failed} von ${files.length} Bildern konnten nicht hochgeladen werden.`);
      }
      
      setUploading(false);
      // Wichtig: onImagesChange mit neuem Array aufrufen
      if (createdImages.length > 0) {
        onImagesChange([...images, ...createdImages]);
      }
      setSelectedScope('');
      setSelectedFieldKey('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    });
  };

  return (
    <div className="space-y-4">
              <div className="flex items-center justify-between">
          <div className="font-medium text-sm">Bilder</div>
        </div>

      <div className="rounded-lg border border-slate-700 p-3 space-y-3">
          {/* Nur noch einfacher Upload */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-full rounded-lg border-2 border-dashed border-slate-600 p-4 text-sm text-slate-400 hover:border-slate-500 hover:text-slate-300 disabled:opacity-50"
          >
            {uploading ? 'Lädt hoch...' : '📁 Bild(er) hinzufügen'}
          </button>
        </div>

      {/* Images Grid */}
      <div>
        {images.length === 0 ? (
          <div className="text-slate-500 text-sm text-center py-4">Noch keine Bilder hochgeladen</div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
            {images.map((image, idx) => (
              <div key={image.id} className="relative group">
                <img
                  src={image.path}
                  alt={image.comment || 'Bild'}
                  className="h-24 w-full object-cover rounded border border-slate-700 cursor-pointer"
                  onClick={() => setLightbox({ open: true, index: idx })}
                />
                {image.scope && (
                  <span className="absolute bottom-1 left-1 text-[10px] px-1 rounded bg-black/60 text-white">
                    {image.scope}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="text-xs text-slate-500">
        💡 <strong>Demo-Hinweis:</strong> Datei-Uploads werden simuliert. Du kannst mehrere Bilder gleichzeitig auswählen. In der Produktion würden echte Dateien zu einem Cloud-Storage hochgeladen.
      </div>

      {lightbox.open && (
        <ImageCarouselModal
          images={carouselImages}
          index={lightbox.index}
          scopes={allowedScopes}
          onClose={() => setLightbox({ open: false, index: 0 })}
          onUpdate={updateImage}
          onDelete={async (id) => {
            await deleteImage(id);
            setLightbox({ open: false, index: 0 });
          }}
        />
      )}
    </div>
  );
}
