'use client';

import { useState } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { FIELD_LABELS, CATEGORY_LABELS } from '@/lib/order-presets';

interface OrderSpec {
  id: string;
  key: string;
  value: string;
}

interface DatasheetPDFGeneratorProps {
  orderId: string;
  orderTitle: string;
  orderType: string;
  customerName: string;
  specs: OrderSpec[];
  activeCategories: Set<string>;
  onPDFGenerated?: (pdfBlob: Blob, filename: string) => void;
  buttonText?: string;
}

const TYPE_LABEL: Record<string, string> = {
  GUITAR: 'Gitarrenbau',
  BODY: 'Body',
  NECK: 'Hals',
  REPAIR: 'Reparatur',
  PICKGUARD: 'Pickguard',
  PICKUPS: 'Tonabnehmer',
  FINISH_ONLY: 'Oberflächenbehandlung',
};

export default function DatasheetPDFGenerator({
  orderId,
  orderTitle,
  orderType,
  customerName,
  specs,
  activeCategories,
  onPDFGenerated,
  buttonText = 'Datenblatt als PDF',
}: DatasheetPDFGeneratorProps) {
  const [generating, setGenerating] = useState(false);

  const generatePDF = async () => {
    setGenerating(true);
    
    try {
      console.log('Starte PDF-Generierung...', { orderId, orderTitle, specs: specs.length });
      
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      let currentY = 20;

      // Header
      pdf.setFontSize(20);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Datenblatt', 20, currentY);
      
      currentY += 15;
      
      // Auftragsinformationen in zwei Spalten
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'normal');
      
      // Linke Spalte
      pdf.text(`Auftrag: ${orderTitle}`, 20, currentY);
      pdf.text(`Typ: ${TYPE_LABEL[orderType] || orderType}`, 20, currentY + 6);
      pdf.text(`Kunde: ${customerName}`, 20, currentY + 12);
      
      // Rechte Spalte
      pdf.text(`Auftrag-ID: ${orderId}`, 120, currentY);
      pdf.text(`Erstellt: ${new Date().toLocaleDateString('de-DE')}`, 120, currentY + 6);
      
      currentY += 20;

      // Linie
      pdf.setLineWidth(0.5);
      pdf.line(20, currentY, pageWidth - 20, currentY);
      currentY += 10;

      // Spezifikationen nach Kategorien organisieren
      const specsByCategory: Record<string, typeof specs> = {};
      const validSpecs = specs.filter(spec => spec.value && spec.value.trim());
      
      // Kategorien definieren basierend auf tatsächlicher Datenblatt-Struktur
      const categories = {
        'Korpus': ['body_', 'bridge', 'pickups_routes', 'neck_construction'],
        'Hals': ['headstock', 'neck_', 'fretboard', 'fret', 'inlays', 'nut', 'side_dots', 'action_12th', 'tuner'],
        'Finish': ['finish_', 'electronics', 'hardware', 'strap_pins', 'strings'],
        'Tonabnehmer': ['pickup', 'bobbin', 'magnet', 'wire', 'dc_resistance', 'cover'],
        'Oberflächenbehandlung': ['objekt', 'oberflaeche', 'farbe', 'aged', 'speziallack'],
        'Allgemein': []
      };
      
      // Specs den Kategorien zuordnen
      validSpecs.forEach(spec => {
        let assigned = false;
        for (const [categoryName, keywords] of Object.entries(categories)) {
          if (keywords.some(keyword => spec.key.includes(keyword))) {
            if (!specsByCategory[categoryName]) specsByCategory[categoryName] = [];
            specsByCategory[categoryName].push(spec);
            assigned = true;
            break;
          }
        }
        if (!assigned) {
          if (!specsByCategory['Allgemein']) specsByCategory['Allgemein'] = [];
          specsByCategory['Allgemein'].push(spec);
        }
      });

      if (Object.keys(specsByCategory).length === 0) {
        pdf.setFontSize(12);
        pdf.text('Keine Spezifikationen vorhanden.', 25, currentY);
      } else {
        // Kategorien in der gewünschten Reihenfolge durchgehen
        const categoryOrder = ['Korpus', 'Hals', 'Finish', 'Tonabnehmer', 'Oberflächenbehandlung', 'Allgemein'];
        categoryOrder.forEach(categoryName => {
          const categorySpecs = specsByCategory[categoryName];
          if (!categorySpecs || categorySpecs.length === 0) return;

          // Kategorie-Header
          pdf.setFontSize(12);
          pdf.setFont('helvetica', 'bold');
          pdf.text(categoryName, 20, currentY);
          currentY += 8;

          // Felder kompakt in einer Zeile (Label: Wert)
          pdf.setFontSize(9);
          pdf.setFont('helvetica', 'normal');
          
          categorySpecs.forEach(spec => {
            const label = FIELD_LABELS[spec.key] || spec.key;
            
            // Prüfe ob wir eine neue Seite brauchen
            if (currentY > pageHeight - 20) {
              pdf.addPage();
              currentY = 20;
            }
            
            // Label und Wert in einer Zeile
            pdf.setFont('helvetica', 'bold');
            const labelText = `${label}:`;
            const labelWidth = pdf.getTextWidth(labelText);
            pdf.text(labelText, 25, currentY);
            
            pdf.setFont('helvetica', 'normal');
            // Wert direkt nach dem Label, mit etwas Abstand
            const valueX = 25 + labelWidth + 3;
            const availableWidth = pageWidth - valueX - 20;
            const lines = pdf.splitTextToSize(spec.value, availableWidth);
            pdf.text(lines, valueX, currentY);
            
            // Nächste Zeile
            currentY += Math.max(lines.length * 4, 6);
          });
          
          currentY += 5; // Abstand zwischen Kategorien
        });
      }

      // PDF als Blob generieren
      const pdfBlob = pdf.output('blob');
      const filename = `Datenblatt_${orderId}_${new Date().toISOString().split('T')[0]}.pdf`;
      
      console.log('PDF erfolgreich generiert:', filename, 'Größe:', pdfBlob.size, 'bytes');
      
      if (onPDFGenerated) {
        console.log('Übergebe PDF an Callback...');
        onPDFGenerated(pdfBlob, filename);
      } else {
        // Fallback: PDF direkt herunterladen
        console.log('Direkter Download...');
        const url = URL.createObjectURL(pdfBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
      
    } catch (error) {
      console.error('Fehler beim PDF-Export:', error);
      alert(`Fehler beim Erstellen der PDF: ${error.message}`);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <button
      onClick={generatePDF}
      disabled={generating}
      className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-slate-200"
    >
      {generating ? 'Erstelle PDF...' : buttonText}
    </button>
  );
}
