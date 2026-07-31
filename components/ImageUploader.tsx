'use client';

import { useState, useRef } from 'react';
import ImageCarouselModal, { type CarouselImage } from './ImageCarouselModal';
import { compressImageFile } from '@/lib/image-compress';

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
  const [isDragging, setIsDragging] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const deleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`${selectedIds.size} Datei(en) unwiderruflich löschen?`)) return;
    setDeleting(true);
    try {
      for (const id of Array.from(selectedIds)) {
        await fetch(`/api/orders/${orderId}/images?imageId=${id}`, { method: 'DELETE' });
      }
      onImagesChange(images.filter(img => !selectedIds.has(img.id)));
      setSelectedIds(new Set());
    } catch (error) {
      console.error('Fehler beim Löschen:', error);
      alert('Fehler beim Löschen');
    } finally {
      setDeleting(false);
    }
  };
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

  const getFileIcon = (fileType: string, fileName: string): { icon: string; label: string } => {
    if (fileType.startsWith('image/')) {
      return { icon: '🖼️', label: 'Bild' };
    }
    if (fileType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')) {
      return { icon: '📄', label: 'PDF' };
    }
    if (fileType.includes('word') || fileName.toLowerCase().endsWith('.doc') || fileName.toLowerCase().endsWith('.docx')) {
      return { icon: '📝', label: 'Word' };
    }
    if (fileType.includes('excel') || fileType.includes('spreadsheet') || fileName.toLowerCase().endsWith('.xls') || fileName.toLowerCase().endsWith('.xlsx')) {
      return { icon: '📊', label: 'Excel' };
    }
    if (fileType.includes('zip') || fileType.includes('archive') || fileName.toLowerCase().match(/\.(zip|rar|7z|tar|gz)$/)) {
      return { icon: '📦', label: 'Archiv' };
    }
    if (fileType.includes('video')) {
      return { icon: '🎥', label: 'Video' };
    }
    if (fileType.includes('audio')) {
      return { icon: '🎵', label: 'Audio' };
    }
    if (fileType.includes('text') || fileName.toLowerCase().match(/\.(txt|md|csv)$/)) {
      return { icon: '📄', label: 'Text' };
    }
    return { icon: '📎', label: 'Datei' };
  };

  const readAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      // Vorher fehlend: bei einem Lesefehler blieb das Promise fuer immer offen
      // und der Upload-Zaehler haengte.
      reader.onerror = () => reject(new Error(`${file.name} konnte nicht gelesen werden`));
      reader.readAsDataURL(file);
    });

  // Bilder vor dem Speichern verkleinern — dieselbe Funktion, die der Mailweg
  // schon benutzt (MessageSystem, QuickCustomerUpdateButton). Hier fehlte sie:
  // gemessen lagen dadurch 111,5 MB Base64 in der Datenbank, ein einzelnes
  // Handyfoto bis zu 10,6 MB in einer Textspalte.
  //
  // Nur echte Bilder: PDFs, Office-Dokumente und Archive gehen unveraendert
  // durch. Schlaegt die Komprimierung fehl (z.B. HEIC, das der Browser nicht
  // dekodieren kann), wird das Original genommen — lieber gross gespeichert als
  // gar nicht. Und wenn das Ergebnis groesser waere als das Original (kleine
  // PNGs werden durch JPEG-Neukodierung mitunter groesser), bleibt das Original.
  const prepareDataUrl = async (file: File): Promise<string> => {
    const original = await readAsDataUrl(file);
    if (!file.type.startsWith('image/')) return original;
    try {
      const { base64, contentType } = await compressImageFile(file);
      const compressed = `data:${contentType};base64,${base64}`;
      return compressed.length < original.length ? compressed : original;
    } catch (error) {
      console.warn(`Komprimierung von ${file.name} fehlgeschlagen, speichere Original:`, error);
      return original;
    }
  };

  const processFiles = (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    setUploading(true);

    // Mehrere Dateien parallel verarbeiten
    const createdImages: OrderImage[] = [];
    const uploadPromises = fileArray.map(async (file, index) => {
      const dataUrl = await prepareDataUrl(file);
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

      // Vorher wurde ein abgelehnter Upload stillschweigend als Erfolg gezaehlt —
      // die Meldung "X von Y konnten nicht hochgeladen werden" log dadurch.
      if (!response.ok) {
        throw new Error(`${file.name}: Server antwortete mit ${response.status}`);
      }

      const newImage: OrderImage = await response.json();
      createdImages.push(newImage);
    });

    // Warte auf alle Uploads
    Promise.allSettled(uploadPromises).then((results) => {
      const failed = results.filter(r => r.status === 'rejected').length;
      if (failed > 0) {
        alert(`${failed} von ${fileArray.length} Dateien konnten nicht hochgeladen werden.`);
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

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    processFiles(files);
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Nur wenn wir wirklich das Drop-Zone verlassen (nicht nur ein Kind-Element)
    if (e.currentTarget === e.target) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    // Mehrere Dateien: dataTransfer.files oder dataTransfer.items (falls files leer)
    let fileList: File[] = [];
    if (e.dataTransfer.files?.length) {
      fileList = Array.from(e.dataTransfer.files);
    } else if (e.dataTransfer.items) {
      fileList = Array.from(e.dataTransfer.items)
        .filter((item) => item.kind === 'file')
        .map((item) => item.getAsFile())
        .filter((f): f is File => f != null);
    }
    if (fileList.length > 0) {
      processFiles(fileList);
    }
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
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />
          <div
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`w-full rounded-lg border-2 border-dashed p-4 text-sm transition-colors ${
              isDragging
                ? 'border-blue-500 bg-blue-500/10 text-blue-300'
                : 'border-slate-600 text-slate-400 hover:border-slate-500 hover:text-slate-300'
            } ${uploading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              onDragEnter={handleDragEnter}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className="w-full text-left disabled:pointer-events-none"
            >
              {uploading ? 'Lädt hoch...' : isDragging ? '📤 Mehrere Dateien hier ablegen' : '📁 Dateien hinzufügen (oder per Drag & Drop – mehrere möglich)'}
            </button>
          </div>
        </div>

      {/* Images Grid */}
      <div>
        {images.length === 0 ? (
          <div className="text-slate-500 text-sm text-center py-4">Noch keine Bilder hochgeladen</div>
        ) : (
          <>
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-3 mb-2">
                <span className="text-xs text-slate-300">{selectedIds.size} ausgewählt</span>
                <button
                  onClick={deleteSelected}
                  disabled={deleting}
                  className="text-xs px-2.5 py-1 rounded-lg bg-red-600/80 hover:bg-red-600 text-white disabled:opacity-50 transition-colors"
                >
                  {deleting ? 'Lösche…' : `🗑 ${selectedIds.size} löschen`}
                </button>
                <button onClick={() => setSelectedIds(new Set())} className="text-xs text-slate-400 hover:text-slate-300">
                  Auswahl aufheben
                </button>
                <button
                  onClick={() => setSelectedIds(new Set(images.map(i => i.id)))}
                  className="text-xs text-slate-400 hover:text-slate-300"
                >
                  Alle auswählen
                </button>
              </div>
            )}
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
              {images.map((image, idx) => {
                const isImg = image.path.startsWith('data:image/') ||
                  image.comment?.toLowerCase().match(/\.(jpg|jpeg|png|gif|webp|svg|bmp)$/) ||
                  image.path.startsWith('/api/attachments/') && !image.comment?.toLowerCase().match(/\.(pdf|docx?|xlsx?|zip|rar|7z|txt|csv)$/);
                const fileName = image.comment?.replace('Hochgeladen: ', '').replace('Mail-Anhang: ', '') || '';
                const fileType = image.path.startsWith('data:')
                  ? image.path.split(';')[0].replace('data:', '')
                  : '';
                const fileInfo = getFileIcon(fileType, fileName);
                const isSel = selectedIds.has(image.id);

                return (
                  <div key={image.id} className="relative group">
                    {isImg ? (
                      <img
                        src={image.path}
                        alt={image.comment || 'Bild'}
                        className={`h-24 w-full object-cover rounded border-2 cursor-pointer transition-colors ${isSel ? 'border-sky-500 shadow-lg shadow-sky-500/25' : 'border-slate-700 hover:border-slate-500'}`}
                        onClick={() => setLightbox({ open: true, index: idx })}
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          const parent = target.parentElement;
                          if (parent) {
                            const iconDiv = document.createElement('div');
                            iconDiv.className = `h-24 w-full flex items-center justify-center bg-slate-800 rounded border-2 cursor-pointer hover:bg-slate-750 ${isSel ? 'border-sky-500' : 'border-slate-700'}`;
                            iconDiv.innerHTML = `<div class="text-center"><div class="text-3xl mb-1">${fileInfo.icon}</div><div class="text-[10px] text-slate-400">${fileInfo.label}</div></div>`;
                            iconDiv.onclick = () => window.open(image.path, '_blank');
                            parent.appendChild(iconDiv);
                          }
                        }}
                      />
                    ) : (
                      <div
                        className={`h-24 w-full flex items-center justify-center bg-slate-800 rounded border-2 cursor-pointer hover:bg-slate-750 transition-colors ${isSel ? 'border-sky-500 shadow-lg shadow-sky-500/25' : 'border-slate-700 hover:border-slate-500'}`}
                        onClick={() => setLightbox({ open: true, index: idx })}
                      >
                        <div className="text-center">
                          <div className="text-3xl mb-1">{fileInfo.icon}</div>
                          <div className="text-[10px] text-slate-400 truncate px-1 max-w-full">{fileName.slice(0, 15) || fileInfo.label}</div>
                        </div>
                      </div>
                    )}
                    {/* Auswahl-Checkbox */}
                    <button
                      type="button"
                      className={`absolute top-1 left-1 w-5 h-5 rounded flex items-center justify-center text-xs transition-all ${
                        isSel
                          ? 'bg-sky-600 text-white'
                          : 'bg-black/50 text-white/60 opacity-0 group-hover:opacity-100'
                      }`}
                      onClick={(e) => { e.stopPropagation(); toggleSelect(image.id); }}
                      title="Auswählen"
                    >
                      {isSel ? '✓' : '○'}
                    </button>
                    {image.scope && (
                      <span className="absolute bottom-1 left-1 text-[10px] px-1 rounded bg-black/60 text-white">
                        {image.scope}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Info */}
      <div className="text-xs text-slate-500">
        💡 <strong>Hinweis:</strong> Hochgeladene Dateien werden dauerhaft am Auftrag gespeichert. Alle Formate sind möglich (Bilder, PDFs, Office-Dokumente, Archive, etc.). Fotos werden dabei automatisch auf maximal 1920 Pixel verkleinert – andere Dateien bleiben unverändert.
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
