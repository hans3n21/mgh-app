'use client';

import { useRef, useState } from 'react';
import { importDatasheetPdf } from '@/lib/datasheet-import-client';
import { TOOLBAR_BUTTON } from '@/lib/ui-classes';

// Buttons im Datenblatt-Tab: ausfuellbares Kunden-PDF herunterladen (vorbefuellt
// aus dem Auftrag) und ein vom Kunden ausgefuelltes PDF wieder importieren.
// Der Import legt nur Vorschlaege an (SuggestionBanner), uebernimmt nichts direkt.
export default function CustomerDatasheetActions({ orderId }: { orderId: string }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const handleFile = async (file: File) => {
    setImporting(true);
    try {
      const outcome = await importDatasheetPdf({ orderId, file, filename: file.name });
      if (outcome.status === 'cancelled') {
        alert('Import abgebrochen - es wurde nichts uebernommen.');
        return;
      }
      if (outcome.status === 'error') {
        alert(`Import fehlgeschlagen: ${outcome.message}`);
        return;
      }
      window.dispatchEvent(new CustomEvent('mgh:suggestions-updated'));
      alert(outcome.message);
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Fragment statt eigenem Container: so sind die Knoepfe Geschwister der
  // uebrigen Werkzeuge und brechen einzeln um, statt als Block. Sonst steht
  // der Sperrknopf auf schmalen Schirmen allein in seiner Zeile.
  return (
    <>
      <a
        href={`/api/datasheets/fillable?orderId=${encodeURIComponent(orderId)}`}
        className={TOOLBAR_BUTTON}
        title="Ausfüllbares Kunden-Datenblatt (PDF) herunterladen – vorbefüllt mit den aktuellen Auftragsdaten"
        download
      >
        <span aria-hidden>🖊️</span>
        {/* Beschriftung auch auf dem Handy: ein Stift-Symbol allein sagt
            niemandem, dass dahinter das Kundenformular steckt. */}
        <span>Kunden-PDF</span>
      </a>
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={importing}
        className={`${TOOLBAR_BUTTON} disabled:opacity-50`}
        title="Vom Kunden ausgefülltes Datenblatt (PDF) importieren – Werte erscheinen als Vorschläge"
      >
        <span aria-hidden>📥</span>
        <span>{importing ? 'Importiere…' : 'Import'}</span>
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
    </>
  );
}
