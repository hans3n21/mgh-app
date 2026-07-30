"use client";

import * as React from 'react';
import { createPortal } from 'react-dom';
import { compressImageFile } from '@/lib/image-compress';

type Props = {
  orderId: string;
  customerName?: string | null;
  customerEmail?: string | null;
  currentUserId?: string | null;
};

type Photo = {
  file: File;
  previewUrl: string;
};

export default function QuickCustomerUpdateButton({ orderId, customerName, customerEmail, currentUserId }: Props) {
  const [open, setOpen] = React.useState(false);
  const [photos, setPhotos] = React.useState<Photo[]>([]);
  const [caption, setCaption] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  // Name des angemeldeten Mitarbeiters — steht unter dem Gruss, damit der Kunde
  // weiss, wer ihm geschrieben hat.
  const [staffName, setStaffName] = React.useState('');
  React.useEffect(() => {
    fetch('/api/auth/session')
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => { if (s?.user?.name) setStaffName(String(s.user.name)); })
      .catch(() => {});
  }, []);

  const defaultCaption = React.useMemo(() => {
    const firstName = (customerName || 'du').split(' ')[0];
    // Meist sind es mehrere Bilder, deshalb "Update" statt "Foto".
    // Bewusst ohne "Bei Fragen melde dich gerne".
    const signature = staffName ? `\n${staffName.split(' ')[0]}` : '';
    return `Hallo ${firstName},\n\nanbei ein Update zu deinem Auftrag.\n\nViele Grüße${signature}`;
  }, [customerName, staffName]);

  // Hintergrund-Scroll sperren, solange das Modal offen ist — mit garantiertem Restore.
  React.useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  // Absender-Postfach: wird beim Oeffnen geladen und laesst sich umstellen.
  // Ohne diese Anzeige faellt ein falsch gewaehltes Postfach erst beim Kunden auf.
  type MailAccount = { id: string; name: string; email: string };
  const [accounts, setAccounts] = React.useState<MailAccount[]>([]);
  const [accountId, setAccountId] = React.useState('');
  const [accountLoading, setAccountLoading] = React.useState(false);
  // Auswahl ist gesperrt, bis jemand ausdruecklich "Bearbeiten" drueckt.
  const [accountEditable, setAccountEditable] = React.useState(false);
  // Bilder lassen sich ueberall ins Fenster ziehen.
  const [dragOver, setDragOver] = React.useState(false);

  // Serienkamera im Dialog. Der native Dateidialog kann das nicht: mit
  // `capture` gibt es genau ein Foto pro Aufruf, also drei Schritte je Bild.
  // Hier bleibt die Vorschau offen — ein Tipp pro Foto.
  const [cameraOn, setCameraOn] = React.useState(false);
  const [cameraError, setCameraError] = React.useState<string | null>(null);
  const [cameraStarting, setCameraStarting] = React.useState(false);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  // getUserMedia gibt es nur in sicherem Kontext (https oder localhost).
  const [cameraSupported, setCameraSupported] = React.useState(false);
  React.useEffect(() => {
    setCameraSupported(Boolean(navigator.mediaDevices?.getUserMedia));
  }, []);

  const stopCamera = React.useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
  }, []);

  const startCamera = async () => {
    setCameraError(null);
    setCameraStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        // Rueckkamera bevorzugen, aber nicht erzwingen — Notebooks haben nur eine.
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOn(true);
    } catch (error) {
      const name = error instanceof DOMException ? error.name : '';
      setCameraError(
        name === 'NotAllowedError'
          ? 'Kamerazugriff wurde abgelehnt.'
          : name === 'NotFoundError'
            ? 'Keine Kamera gefunden.'
            : 'Kamera konnte nicht geöffnet werden.',
      );
    } finally {
      setCameraStarting(false);
    }
  };

  // Stream erst anhaengen, wenn das <video> im DOM ist.
  React.useEffect(() => {
    if (cameraOn && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [cameraOn]);

  // Kamera nie im Hintergrund weiterlaufen lassen.
  React.useEffect(() => {
    if (!open) stopCamera();
  }, [open, stopCamera]);
  React.useEffect(() => stopCamera, [stopCamera]);

  const takePhoto = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      // Verkleinert wird spaeter beim Senden (compressImageFile).
      addFiles([new File([blob], `kamera-${photos.length + 1}.jpg`, { type: 'image/jpeg' })]);
    }, 'image/jpeg', 0.92);
  };

  const selectedAccountLabel = React.useMemo(() => {
    const a = accounts.find((x) => x.id === accountId);
    return a ? `${a.name} – ${a.email}` : 'wird geladen…';
  }, [accounts, accountId]);

  React.useEffect(() => {
    if (!open) return;
    let active = true;
    setAccountLoading(true);
    fetch(`/api/orders/${encodeURIComponent(orderId)}/mail-account`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!active || !data) return;
        setAccounts(data.accounts || []);
        if (data.selected?.id) setAccountId(data.selected.id);
      })
      .catch(() => {})
      .finally(() => { if (active) setAccountLoading(false); });
    return () => { active = false; };
  }, [open, orderId]);

  // Zuletzt eingesetzte Vorlage — daran erkennen wir, ob von Hand geaendert wurde.
  const appliedDefaultRef = React.useRef('');

  const openPicker = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!customerEmail) return;
    setCaption(defaultCaption);
    appliedDefaultRef.current = defaultCaption;
    setSent(false);
    // Postfachwahl startet immer gesperrt.
    setAccountEditable(false);
    setDragOver(false);
    setOpen(true);
  };

  // Faellt der Mitarbeitername erst nach dem Oeffnen ein, Vorlage nachziehen —
  // aber nur, solange der Text unveraendert ist.
  React.useEffect(() => {
    if (!open) return;
    setCaption((prev) => (prev === appliedDefaultRef.current ? defaultCaption : prev));
    appliedDefaultRef.current = defaultCaption;
  }, [open, defaultCaption]);

  const closeModal = (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    if (sending) return;
    photos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    setPhotos([]);
    setOpen(false);
  };

  // Nimmt Bilder aus Dateidialog, Drag&Drop und Serienkamera entgegen.
  const addFiles = (fileList: FileList | File[] | null) => {
    if (!fileList || fileList.length === 0) return;
    const next: Photo[] = Array.from(fileList)
      .filter((f) => f.type.startsWith('image/'))
      .map((file) => ({ file, previewUrl: URL.createObjectURL(file) }));
    setPhotos((prev) => [...prev, ...next]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removePhoto = (idx: number) => {
    setPhotos((prev) => {
      const next = [...prev];
      const [removed] = next.splice(idx, 1);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return next;
    });
  };

  const send = async () => {
    if (photos.length === 0 || sending || !customerEmail) return;
    setSending(true);
    try {
      // Diese Fotos sind immer frisch (Kamera, Dateiauswahl, Drag & Drop) —
      // nie aus der Galerie des Auftrags. Sie duerfen deshalb ausnahmslos dort
      // abgelegt werden, ohne Dubletten zu erzeugen.
      const attachments: { filename: string; content: string; contentType: string; addToGallery: boolean }[] = [];
      for (let i = 0; i < photos.length; i++) {
        const compressed = await compressImageFile(photos[i].file);
        attachments.push({
          filename: `foto-${i + 1}.jpg`,
          content: compressed.base64,
          contentType: compressed.contentType,
          addToGallery: true,
        });
      }

      const res = await fetch(`/api/orders/${orderId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: caption.trim() || defaultCaption,
          senderType: 'staff',
          senderId: currentUserId ?? null,
          sendEmail: true,
          attachments,
          ...(accountId ? { accountId } : {}),
        }),
      });

      if (!res.ok) {
        let errorText = 'Unbekannter Fehler';
        try {
          const errorBody = await res.json();
          errorText = errorBody?.error || errorText;
        } catch { /* keine JSON-Antwort */ }
        alert(`E-Mail konnte nicht gesendet werden: ${errorText}`);
        return;
      }

      photos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      setPhotos([]);
      setSent(true);
      setTimeout(() => setOpen(false), 1200);
    } catch (error) {
      console.error('Fehler beim Senden des Foto-Updates:', error);
      alert('Fehler beim Senden der E-Mail');
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={openPicker}
        disabled={!customerEmail}
        title={customerEmail ? 'Foto-Update an Kunde senden' : 'Kein Kunden-E-Mail hinterlegt'}
        // Rahmenlos und feste Groesse — die Rahmen liessen die drei
        // Aktionsknoepfe unterschiedlich gross wirken.
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-sky-300 transition-colors hover:bg-sky-900/30 disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label="Foto-Update an Kunde senden"
      >
        {/* SVG statt Emoji: Emojis rendern je nach System in anderer Groesse
            als die Icons der Nachbarknoepfe. */}
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2.2l1.4-2.1A1 1 0 0 1 8.93 4.5h6.14a1 1 0 0 1 .83.4L17.3 7h2.2A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5v-9Z" />
          <circle cx="12" cy="13" r="3.2" />
        </svg>
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4"
          onClick={closeModal}
        >
          <div
            className={`relative w-full max-w-lg rounded-xl border bg-slate-900 p-4 shadow-2xl transition-colors ${
              dragOver ? 'border-sky-500' : 'border-slate-700'
            }`}
            // Nur die Weitergabe stoppen (Backdrop schliesst sonst, darunter liegt
            // ausserdem der Link der Auftragszeile). KEIN preventDefault: das wuerde
            // die Standardaktion des Foto-Labels abbrechen, der Dateidialog bliebe zu.
            onClick={(e) => e.stopPropagation()}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes('Files')) return;
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={(e) => {
              // Nicht zuruecksetzen, wenn der Zeiger nur auf ein Kindelement wechselt.
              if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
              setDragOver(false);
            }}
            onDrop={(e) => {
              if (!e.dataTransfer.types.includes('Files')) return;
              e.preventDefault();
              setDragOver(false);
              addFiles(e.dataTransfer.files);
            }}
          >
            {dragOver && (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-sky-950/80 text-sm text-sky-200">
                Bilder hier ablegen
              </div>
            )}
            <h3 className="text-sm font-semibold text-slate-100">Foto-Update an {customerName || 'Kunde'}</h3>

            {sent ? (
              <div className="mt-4 rounded-lg border border-emerald-700/50 bg-emerald-900/20 px-3 py-4 text-center text-sm text-emerald-300">
                ✓ E-Mail gesendet
              </div>
            ) : (
              <>
                {/* Absender fest angezeigt. Bewusst nicht direkt aenderbar —
                    ein versehentlich umgestelltes Postfach faellt erst beim
                    Kunden auf. Erst "Bearbeiten" gibt die Auswahl frei. */}
                <div className="mt-3 flex items-center gap-2 text-xs">
                  <span className="flex-shrink-0 text-slate-500">Von:</span>
                  {accountLoading && accounts.length === 0 ? (
                    <span className="text-slate-500">wird geladen…</span>
                  ) : accounts.length === 0 ? (
                    <span className="text-amber-400">Kein aktives Postfach gefunden</span>
                  ) : accountEditable ? (
                    <>
                      <select
                        value={accountId}
                        onChange={(e) => setAccountId(e.target.value)}
                        disabled={sending}
                        className="min-w-0 flex-1 rounded border border-sky-700 bg-slate-950 px-2 py-1 text-xs text-slate-200 disabled:opacity-60"
                      >
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>{a.name} – {a.email}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setAccountEditable(false)}
                        className="flex-shrink-0 rounded border border-slate-700 px-2 py-1 text-slate-300 hover:bg-slate-800"
                      >
                        Fertig
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="min-w-0 flex-1 truncate text-slate-300" title={selectedAccountLabel}>
                        {selectedAccountLabel}
                      </span>
                      <button
                        type="button"
                        onClick={() => setAccountEditable(true)}
                        disabled={sending}
                        className="flex-shrink-0 rounded border border-slate-700 px-2 py-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200 disabled:opacity-60"
                        title="Anderes Postfach wählen"
                      >
                        Bearbeiten
                      </button>
                    </>
                  )}
                </div>

                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  rows={8}
                  className="mt-3 w-full rounded bg-slate-950 border border-slate-700 px-3 py-2 text-sm resize-none"
                  placeholder="Nachricht an Kunden…"
                />

                {/* Bilder unter dem Text — dort wird angehaengt, nicht geschrieben. */}
                <div className="mt-3 flex flex-wrap gap-2">
                  {photos.map((p, idx) => (
                    <div key={p.previewUrl} className="relative">
                      <img src={p.previewUrl} alt={`Foto ${idx + 1}`} className="h-16 w-16 rounded object-cover border border-slate-700" />
                      <button
                        type="button"
                        onClick={() => removePhoto(idx)}
                        className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-red-600 text-white text-xs leading-5"
                        title="Entfernen"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {/* Natives Label statt JS-Klick: oeffnet den Dateidialog zuverlaessig.
                      Ohne `capture` — sonst erzwingt das Handy die Kamera und die
                      Mehrfachauswahl aus der Galerie faellt weg. */}
                  <label
                    className="flex h-16 w-16 cursor-pointer flex-col items-center justify-center rounded border border-dashed border-slate-600 text-slate-400 hover:border-slate-400 hover:text-slate-200"
                    title="Fotos aufnehmen oder auswählen (mehrere möglich)"
                  >
                    <span className="text-xl">📷</span>
                    <span className="text-[10px]">Foto</span>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="sr-only"
                      onChange={(e) => {
                        addFiles(e.target.files);
                        // Ohne Zuruecksetzen laesst sich dieselbe Datei nicht erneut waehlen.
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}
                    />
                  </label>

                  {/* Serienkamera: einmal oeffnen, dann ein Tipp je Foto. */}
                  {cameraSupported && !cameraOn && (
                    <button
                      type="button"
                      onClick={startCamera}
                      disabled={cameraStarting}
                      className="flex h-16 w-16 flex-col items-center justify-center rounded border border-dashed border-slate-600 text-slate-400 hover:border-slate-400 hover:text-slate-200 disabled:opacity-60"
                      title="Kamera öffnen und mehrere Fotos hintereinander aufnehmen"
                    >
                      <span className="text-xl">🎥</span>
                      <span className="text-[10px]">{cameraStarting ? '…' : 'Serie'}</span>
                    </button>
                  )}

                  <span className="self-center text-[11px] text-slate-500">
                    oder Bilder ins Fenster ziehen
                  </span>
                </div>

                {cameraError && (
                  <div className="mt-2 rounded border border-amber-700/50 bg-amber-900/20 px-2 py-1.5 text-xs text-amber-300">
                    {cameraError}
                  </div>
                )}

                {cameraOn && (
                  <div className="mt-3 overflow-hidden rounded-lg border border-slate-700 bg-black">
                    <video
                      ref={videoRef}
                      playsInline
                      muted
                      className="max-h-64 w-full bg-black object-contain"
                    />
                    <div className="flex items-center justify-between gap-2 bg-slate-900 px-2 py-2">
                      <span className="text-xs text-slate-400">
                        {photos.length} Foto{photos.length === 1 ? '' : 's'} aufgenommen
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={takePhoto}
                          className="rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-slate-900 hover:bg-slate-200"
                          title="Foto aufnehmen – Kamera bleibt offen"
                        >
                          ● Auslösen
                        </button>
                        <button
                          type="button"
                          onClick={stopCamera}
                          className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
                        >
                          Fertig
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="mt-4 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={closeModal}
                    disabled={sending}
                    className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-60"
                  >
                    Abbrechen
                  </button>
                  <button
                    type="button"
                    onClick={send}
                    disabled={sending || photos.length === 0}
                    className="rounded-lg border border-emerald-700/70 bg-emerald-900/30 px-3 py-1.5 text-sm text-emerald-200 hover:bg-emerald-900/50 disabled:opacity-60"
                  >
                    {sending ? 'Sendet…' : 'Senden'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
