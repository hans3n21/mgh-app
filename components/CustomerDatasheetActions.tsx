'use client';

import { useRef, useState } from 'react';

// Buttons im Datenblatt-Tab: ausfuellbares Kunden-PDF herunterladen (vorbefuellt
// aus dem Auftrag) und ein vom Kunden ausgefuelltes PDF wieder importieren.
// Der Import legt nur Vorschlaege an (SuggestionBanner), uebernimmt nichts direkt.
export default function CustomerDatasheetActions({ orderId }: { orderId: string }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const handleFile = async (file: File) => {
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/orders/${orderId}/datasheet/import`, {
        method: 'POST',
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(`Import fehlgeschlagen: ${data.error || res.statusText}`);
        return;
      }
      window.dispatchEvent(new CustomEvent('mgh:suggestions-updated'));
      const parts = [`${data.created} neue Vorschlaege angelegt`];
      if (data.unchanged) parts.push(`${data.unchanged} unveraendert/bereits vorhanden`);
      if (data.ignored) parts.push(`${data.ignored} ignoriert`);
      alert(`Datenblatt importiert: ${parts.join(', ')}.\n\nDie Vorschlaege kannst du im lila Banner pro Feld uebernehmen oder ablehnen.`);
    } catch {
      alert('Import fehlgeschlagen (Netzwerkfehler).');
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="flex items-center gap-2">
      <a
        href={`/api/datasheets/fillable?orderId=${encodeURIComponent(orderId)}`}
        className="flex items-center gap-2 px-2.5 py-1.5 text-sm bg-slate-600 hover:bg-slate-500 rounded-lg text-slate-200"
        title="Ausfüllbares Kunden-Datenblatt (PDF) herunterladen – vorbefüllt mit den aktuellen Auftragsdaten"
        download
      >
        <span aria-hidden>🖊️</span>
        <span className="hidden sm:inline">Kunden-PDF</span>
      </a>
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={importing}
        className="flex items-center gap-2 px-2.5 py-1.5 text-sm bg-violet-700/70 hover:bg-violet-600/70 rounded-lg text-violet-100 disabled:opacity-50"
        title="Vom Kunden ausgefülltes Datenblatt (PDF) importieren – Werte erscheinen als Vorschläge"
      >
        <span aria-hidden>📥</span>
        <span className="hidden sm:inline">{importing ? 'Importiere…' : 'PDF-Import'}</span>
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
    </div>
  );
}
