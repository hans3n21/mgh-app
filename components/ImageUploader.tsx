'use client';

import { useState, useRef } from 'react';

interface OrderImage {
  id: string;
  path: string;
  comment?: string;
  position: number;
  attach: boolean;
  createdAt: Date;
}

interface ImageUploaderProps {
  orderId: string;
  images: OrderImage[];
  onImagesChange: (images: OrderImage[]) => void;
}

export default function ImageUploader({ orderId, images, onImagesChange }: ImageUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [newImageUrl, setNewImageUrl] = useState('');
  const [newImageComment, setNewImageComment] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        }),
      });

      if (response.ok) {
        const newImage = await response.json();
        onImagesChange([...images, newImage]);
        setNewImageUrl('');
        setNewImageComment('');
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

    // In einer echten App würden wir hier die Dateien zu einem Server/Cloud-Storage hochladen
    // Für diese Demo simulieren wir das mit einem lokalen URL
    const file = files[0];
    const url = URL.createObjectURL(file);
    
    // Simuliere Upload-Verzögerung
    setUploading(true);
    setTimeout(async () => {
      try {
        const response = await fetch(`/api/orders/${orderId}/images`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            path: `uploads/${file.name}`, // In Realität: echte Upload-URL
            comment: `Hochgeladen: ${file.name}`,
            position: images.length,
          }),
        });

        if (response.ok) {
          const newImage = await response.json();
          onImagesChange([...images, newImage]);
        }
      } catch (error) {
        console.error('Fehler beim Upload:', error);
        alert('Fehler beim Hochladen des Bildes');
      } finally {
        setUploading(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    }, 1000);
  };

  return (
    <div className="space-y-4">
      {/* Add Image Section */}
      <div className="rounded-lg border border-slate-700 p-3 space-y-3">
        <div className="font-medium text-sm">Bild hinzufügen</div>
        
        {/* File Upload */}
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-full rounded-lg border-2 border-dashed border-slate-600 p-4 text-sm text-slate-400 hover:border-slate-500 hover:text-slate-300 disabled:opacity-50"
          >
            {uploading ? 'Lädt hoch...' : '📁 Datei auswählen oder hier ablegen'}
          </button>
        </div>

        {/* URL Input */}
        <div className="text-xs text-slate-500 text-center">oder</div>
        <div className="flex gap-2">
          <input
            placeholder="Bild-URL eingeben..."
            value={newImageUrl}
            onChange={(e) => setNewImageUrl(e.target.value)}
            className="flex-1 rounded bg-slate-950 border border-slate-700 px-2 py-1.5 text-sm"
          />
          <input
            placeholder="Kommentar (optional)"
            value={newImageComment}
            onChange={(e) => setNewImageComment(e.target.value)}
            className="flex-1 rounded bg-slate-950 border border-slate-700 px-2 py-1.5 text-sm"
          />
          <button
            onClick={addImageByUrl}
            disabled={uploading || !newImageUrl.trim()}
            className="rounded bg-sky-600 hover:bg-sky-500 px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            +
          </button>
        </div>
      </div>

      {/* Images Grid */}
      <div className="space-y-3">
        {images.length === 0 ? (
          <div className="text-slate-500 text-sm text-center py-4">
            Noch keine Bilder hochgeladen
          </div>
        ) : (
          images.map((image, index) => (
            <div key={image.id} className="rounded-lg border border-slate-700 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">#{index + 1}</span>
                    <div className="text-sm font-mono text-slate-300 truncate">
                      {image.path}
                    </div>
                    {image.attach && (
                      <span className="text-xs bg-sky-500/20 text-sky-400 px-1.5 py-0.5 rounded">
                        Anhang
                      </span>
                    )}
                  </div>
                  {image.comment && (
                    <div className="text-sm text-slate-400 mt-1">{image.comment}</div>
                  )}
                  <div className="text-xs text-slate-500 mt-1">
                    {new Date(image.createdAt).toLocaleString('de-DE')}
                  </div>
                </div>
                
                <div className="flex items-center gap-1">
                  {/* Preview Button (falls es eine echte URL ist) */}
                  {(image.path.startsWith('http') || image.path.startsWith('data:')) && (
                    <button
                      onClick={() => window.open(image.path, '_blank')}
                      className="text-xs rounded border border-slate-600 px-2 py-1 hover:bg-slate-800"
                    >
                      👁 Anzeigen
                    </button>
                  )}
                  
                  <button
                    onClick={() => deleteImage(image.id)}
                    className="text-xs rounded border border-red-600 text-red-400 px-2 py-1 hover:bg-red-600/20"
                  >
                    🗑 Löschen
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Info */}
      <div className="text-xs text-slate-500">
        💡 <strong>Demo-Hinweis:</strong> Datei-Uploads werden simuliert. In der Produktion würden echte Dateien zu einem Cloud-Storage hochgeladen.
      </div>
    </div>
  );
}
