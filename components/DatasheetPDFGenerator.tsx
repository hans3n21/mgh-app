"use client";

import { useEffect, useState } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { FIELD_LABELS, CATEGORY_LABELS, getCategoriesForOrderType, getFieldsForCategory } from '@/lib/order-presets';

interface OrderSpec {
  id: string;
  key: string;
  value: string;
}

interface AttachImage {
  id: string;
  path: string;
  comment?: string;
  position?: number;
}

interface DatasheetPDFGeneratorProps {
  orderId: string;
  orderTitle: string;
  orderType: string;
  customerName: string;
  orderCreatedAt?: string | Date;
  specs: OrderSpec[];
  activeCategories: Set<string>;
  assigneeName?: string; // Name des zugewiesenen Gitarrenbauers
  finalAmount?: string; // Preis des Auftrags
  paymentStatus?: string; // Zahlungsstatus: 'open' | 'deposit' | 'paid'
  paymentMethod?: string; // Zahlungsart: 'paypal' | 'direktueberweisung'
  depositAmount?: string; // Anzahlungsbetrag in Euro
  attachImages?: AttachImage[]; // Als Anhang markierte Bilder für Seite 2
  onPDFGenerated?: (pdfBlob: Blob, filename: string) => void;
  buttonText?: string;
  datasheetVersion?: number;
  datasheetUpdatedAt?: string | Date;
  stringCount?: string; // Saitenzahl
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

// Hilfsfunktion für Adler-Hintergrund
async function addEagleBackground(pdf: jsPDF, pageWidth: number, pageHeight: number) {
  try {
    // Erst versuchen, das Bild zu laden
    const eagleImagePath = '/images/mgh-eagle-logo.jpg';
    console.log('Lade Adler-Logo von:', eagleImagePath);
    
    const eagleImage = await fetch(eagleImagePath);
    console.log('Fetch-Response:', eagleImage.status, eagleImage.statusText);
    
    if (eagleImage.ok) {
      console.log('Adler-Logo erfolgreich geladen');
      const imageBlob = await eagleImage.blob();
      console.log('Blob erstellt, Größe:', imageBlob.size, 'bytes, Type:', imageBlob.type);
      
      // Konvertiere zu Base64
      const imageBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          console.log('Base64 erstellt, Länge:', result.length, 'Prefix:', result.substring(0, 50));
          resolve(result);
        };
        reader.onerror = reject;
        reader.readAsDataURL(imageBlob);
      });
      
      // Adler-Logo in Originalgröße (bereits A4-angepasst)
      const eagleWidth = pageWidth; // Volle Seitenbreite
      const eagleHeight = pageHeight; // Volle Seitenhöhe  
      const eagleX = 0; // Links bündig
      const eagleY = 0; // Oben bündig
      
      console.log('Füge Bild hinzu:', { eagleX, eagleY, eagleWidth, eagleHeight });
      
      // Teste verschiedene Ansätze
      try {
        // Adler-Logo mit 10% Transparenz über die volle Breite
        pdf.addImage(imageBase64, 'JPEG', eagleX, eagleY, eagleWidth, eagleHeight, '', 'FAST', 0.1);
        console.log('✅ MGH-Eagle-Logo als Hintergrund hinzugefügt (Originalgröße A4, 1:1 Mapping)');
      } catch (imageError) {
        console.error('❌ Fehler beim Hinzufügen des Bildes:', imageError);
        
        // Fallback: Text-Wasserzeichen
        addTextWatermark(pdf, pageWidth, pageHeight);
      }
      
    } else {
      console.log('❌ MGH-Eagle-Logo nicht gefunden - Status:', eagleImage.status);
      // Fallback: Text-Wasserzeichen
      addTextWatermark(pdf, pageWidth, pageHeight);
    }
    
  } catch (error) {
    console.warn('❌ Adler-Hintergrund Fehler:', error);
    // Fallback: Text-Wasserzeichen
    addTextWatermark(pdf, pageWidth, pageHeight);
  }
}

// Hilfsfunktion: Bild laden, Format + Dimensionen ermitteln (für Seitenverhältnis)
async function loadImageForPdf(path: string): Promise<{ data: string; format: 'JPEG' | 'PNG' | 'GIF' | 'WEBP'; width: number; height: number } | null> {
  try {
    let dataUrl: string;
    if (path.startsWith('data:image/')) {
      dataUrl = path;
    } else {
      const url = path.startsWith('/') ? `${typeof window !== 'undefined' ? window.location.origin : ''}${path}` : path;
      const res = await fetch(url);
      if (!res.ok) return null;
      const blob = await res.blob();
      dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }
    const match = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!match) return null;
    const ext = match[1].toLowerCase();
    const format = (ext === 'jpeg' || ext === 'jpg') ? 'JPEG' : ext === 'png' ? 'PNG' : ext === 'gif' ? 'GIF' : ext === 'webp' ? 'WEBP' : 'JPEG';
    const data = match[2];

    // Dimensionen ermitteln, um Seitenverhältnis zu wahren (kein Stauchen)
    const { width, height } = await new Promise<{ width: number; height: number }>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => resolve({ width: 1, height: 1 }); // Fallback
      img.src = dataUrl;
    });
    return { data, format, width, height };
  } catch {
    return null;
  }
}

// Fallback: Text-Wasserzeichen
function addTextWatermark(pdf: jsPDF, pageWidth: number, pageHeight: number) {
  console.log('🔄 Erstelle Text-Wasserzeichen als Fallback');
  
  const centerX = pageWidth / 2;
  const centerY = pageHeight / 2;
  
  // Speichere aktuelle Textfarbe
  const originalColor = pdf.getTextColor();
  
  // Sehr helle graue Farbe für Wasserzeichen
  pdf.setTextColor(230, 230, 230);
  
  // MGH-Logo als Text
  pdf.setFontSize(60);
  pdf.setFont('helvetica', 'bold');
  pdf.text('MGH', centerX, centerY - 15, { align: 'center' });
  
  pdf.setFontSize(14);
  pdf.setFont('helvetica', 'normal');
  pdf.text('MANUFACTURING', centerX, centerY + 5, { align: 'center' });
  pdf.text('GUITARS AND HARDWARE', centerX, centerY + 18, { align: 'center' });
  
  // Textfarbe zurücksetzen
  pdf.setTextColor(originalColor);
  
  console.log('✅ Text-Wasserzeichen hinzugefügt');
}

export default function DatasheetPDFGenerator({
  orderId,
  orderTitle,
  orderType,
  customerName,
  orderCreatedAt,
  specs,
  activeCategories,
  assigneeName,
  finalAmount,
  paymentStatus,
  paymentMethod,
  depositAmount,
  attachImages = [],
  onPDFGenerated,
  buttonText = 'Datenblatt als PDF',
  datasheetVersion,
  datasheetUpdatedAt,
  stringCount,
}: DatasheetPDFGeneratorProps) {
  const [generating, setGenerating] = useState(false);
  const [resolvedVersion, setResolvedVersion] = useState<number | undefined>(
    typeof datasheetVersion === 'number' ? datasheetVersion : undefined
  );
  const [resolvedUpdatedAt, setResolvedUpdatedAt] = useState<string | Date | undefined>(
    datasheetUpdatedAt
  );
  const [resolvedCreatedAt, setResolvedCreatedAt] = useState<string | Date | undefined>(undefined);

  // Fallback: Wenn keine Version/UpdatedAt-Props übergeben wurden, hole sie live vom Server
  useEffect(() => {
    let active = true;
    async function loadLatest() {
      if (typeof datasheetVersion === 'number' && datasheetUpdatedAt) return; // bereits vorhanden (wird aber nicht mehr angezeigt)
      try {
        const res = await fetch(
          `/api/orders/${encodeURIComponent(orderId)}/datasheet/latest?type=${encodeURIComponent(orderType)}`
        );
        if (!active) return;
        if (res.ok) {
          const json = await res.json();
          if (json?.ok && json?.datasheet) {
            setResolvedUpdatedAt(json.datasheet.updatedAt);
            setResolvedCreatedAt(json.datasheet.createdAt);
            return;
          }
        }
        // Kein Treffer – setze sinnvolle Defaults
        setResolvedUpdatedAt(undefined);
        setResolvedCreatedAt(undefined);
      } catch {
        if (!active) return;
        setResolvedUpdatedAt(undefined);
        setResolvedCreatedAt(undefined);
      }
    }
    loadLatest();
    return () => {
      active = false;
    };
  }, [orderId, orderType, datasheetVersion, datasheetUpdatedAt]);

  const generatePDF = async () => {
    setGenerating(true);
    
    try {
      console.log('Starte PDF-Generierung...', { orderId, orderTitle, specs: specs.length });
      
      // Querformat A4 mit Kompression
      const pdf = new jsPDF({
        orientation: 'l', // landscape (Querformat)
        unit: 'mm',
        format: 'a4',
        compress: true // PDF-Kompression aktivieren
      });
      const pageWidth = pdf.internal.pageSize.getWidth(); // 297mm
      const pageHeight = pdf.internal.pageSize.getHeight(); // 210mm
      
      // Kompakteres Layout mit besserer Raumnutzung
      const margin = 10;
      const usableWidth = pageWidth - 2 * margin;
      const middleX = pageWidth / 2;
      
      // Adler-Hintergrund hinzufügen (wenn verfügbar)
      await addEagleBackground(pdf, pageWidth, pageHeight);
      
      // Header-Bereich - kompakter
      let currentY = 15;
      
      // Haupttitel
      pdf.setFontSize(20);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Datenblatt', middleX, currentY, { align: 'center' });
      
      currentY += 12;
      
      // Auftragsinformationen in kompakter Tabelle
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      
      // Header-Tabelle für Auftragsinformationen
      const createdAtRaw =
        (paymentStatus === 'deposit' || paymentStatus === 'paid')
          ? (resolvedUpdatedAt ?? datasheetUpdatedAt ?? orderCreatedAt ?? resolvedCreatedAt ?? undefined)
          : (orderCreatedAt ?? resolvedCreatedAt ?? undefined);
      const updatedAtRaw = resolvedUpdatedAt ?? datasheetUpdatedAt;
      const createdAtLabel = createdAtRaw
        ? new Date(createdAtRaw).toLocaleDateString('de-DE')
        : new Date().toLocaleDateString('de-DE');
      const updatedAtLabel = updatedAtRaw
        ? new Date(updatedAtRaw).toLocaleString('de-DE')
        : new Date().toLocaleString('de-DE');
      const headerData = [
        ['Auftrag:', orderTitle, 'Auftrag-ID:', orderId],
        ['Typ:', TYPE_LABEL[orderType] || orderType, 'Erstellt:', `${createdAtLabel} / ${updatedAtLabel}`],
        ['Kunde:', customerName, 'Gitarrenbauer:', assigneeName || '–'],
        ['Saitenzahl:', specs.find(s => s.key === 'string_count')?.value || '–', 'Preis:', finalAmount ? `${finalAmount} €` : '–']
      ];
      
      // Spaltenbreiten für Header-Tabelle
      const col1Width = 25;
      const col2Width = usableWidth * 0.35;
      const col3Width = 25;
      const col4Width = usableWidth * 0.35;
      
      headerData.forEach((row, rowIndex) => {
        const y = currentY + (rowIndex * 5);
        
        // Labels fett
        pdf.setFont('helvetica', 'bold');
        pdf.text(row[0], margin, y);
        pdf.text(row[2], margin + col1Width + col2Width + 10, y);
        
        // Werte normal
        pdf.setFont('helvetica', 'normal');
        pdf.text(row[1], margin + col1Width, y);
        const priceX = margin + col1Width + col2Width + 10 + col3Width;
        pdf.text(row[3], priceX, y);
        
        // Zahlungsstatus-Checkboxen rechts neben dem Preis (nur in der Preis-Zeile)
        if (rowIndex === 3 && finalAmount) {
          const checkboxSize = 3;
          const checkboxY = y - 2.2; // Angepasst für bessere Ausrichtung mit Text
          const checkboxSpacing = 20;
          let checkboxX = priceX + pdf.getTextWidth(row[3]) + 5;
          
          // Wenn bezahlt: nur "Bezahlt" anzeigen (+ optional Zahlungsart)
          if (paymentStatus === 'paid') {
            // Checkbox für "Bezahlt"
            pdf.setLineWidth(0.3);
            pdf.rect(checkboxX, checkboxY, checkboxSize, checkboxSize);
            // Häkchen zeichnen
            pdf.setLineWidth(0.5);
            pdf.line(checkboxX + 0.5, checkboxY + 1.5, checkboxX + 1.2, checkboxY + 2.5);
            pdf.line(checkboxX + 1.2, checkboxY + 2.5, checkboxX + 2.5, checkboxY + 0.5);
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(9);
            const bezahltLabel = 'Bezahlt';
            pdf.text(bezahltLabel, checkboxX + checkboxSize + 2, y);
            // Zahlungsart neben Bezahlt anzeigen
            if (paymentMethod === 'paypal' || paymentMethod === 'direktueberweisung') {
              const methodLabel = paymentMethod === 'paypal' ? 'PayPal' : 'Direktüberweisung';
              const methodX = checkboxX + checkboxSize + 2 + pdf.getTextWidth(bezahltLabel) + 4;
              pdf.text(`(${methodLabel})`, methodX, y);
            }
          } 
          // Wenn angezahlt (und nicht bezahlt): nur "Angezahlt" anzeigen
          else if (paymentStatus === 'deposit') {
            // Checkbox für "Angezahlt"
            pdf.setLineWidth(0.3);
            pdf.rect(checkboxX, checkboxY, checkboxSize, checkboxSize);
            // Häkchen zeichnen
            pdf.setLineWidth(0.5);
            pdf.line(checkboxX + 0.5, checkboxY + 1.5, checkboxX + 1.2, checkboxY + 2.5);
            pdf.line(checkboxX + 1.2, checkboxY + 2.5, checkboxX + 2.5, checkboxY + 0.5);
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(9);
            const depositLabel = depositAmount ? `Angezahlt (${depositAmount} €)` : 'Angezahlt';
            pdf.text(depositLabel, checkboxX + checkboxSize + 2, y);
            if (paymentMethod === 'paypal' || paymentMethod === 'direktueberweisung') {
              const methodLabel = paymentMethod === 'paypal' ? 'PayPal' : 'Direktüberweisung';
              const methodX = checkboxX + checkboxSize + 2 + pdf.getTextWidth(depositLabel) + 4;
              pdf.text(`(${methodLabel})`, methodX, y);
            }
          }
          // Wenn open oder undefined: beide Checkboxen leer anzeigen
          else {
            // Checkbox für "Angezahlt" (leer)
            pdf.setLineWidth(0.3);
            pdf.rect(checkboxX, checkboxY, checkboxSize, checkboxSize);
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(9);
            pdf.text('Angezahlt', checkboxX + checkboxSize + 2, y);
            
            // Checkbox für "Bezahlt" (leer)
            checkboxX += checkboxSpacing;
            pdf.setLineWidth(0.3);
            pdf.rect(checkboxX, checkboxY, checkboxSize, checkboxSize);
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(9);
            pdf.text('Bezahlt', checkboxX + checkboxSize + 2, y);
          }
          
          // Font-Größe zurücksetzen
          pdf.setFontSize(10);
        }
      });
      
      currentY += headerData.length * 5 + 8;

      // Trennlinie
      pdf.setLineWidth(0.5);
      pdf.line(margin, currentY, pageWidth - margin, currentY);
      currentY += 8;

      // Spezifikationen nach Kategorien organisieren - verwende order-presets
      const specsByCategory: Record<string, typeof specs> = {};
      const isTruthySpecValue = (value?: string) => {
        const normalized = (value || '').trim().toLowerCase();
        return normalized === 'ja' || normalized === 'true' || normalized === '1' || normalized === 'yes';
      };
      const hasTop =
        specs.some((spec) => spec.key === 'body_has_top' && isTruthySpecValue(spec.value)) ||
        specs.some((spec) => spec.key === 'body_top' && Boolean((spec.value || '').trim()));
      const validSpecs = specs
        .filter(spec => spec.value && spec.value.trim())
        .filter(spec => spec.key !== 'string_count') // Wird bereits im Header angezeigt
        // Mit Top gilt das aufgeteilte Finish (Top/Korpus), das Gesamt-Finish entfällt.
        .filter(spec => !(hasTop && (spec.key === 'finish_body' || spec.key === 'body_surface_treatment')))
        .filter(spec => {
          // Binding-Felder: Nur anzeigen wenn aktiviert (nicht "Nein")
          if (spec.key === 'body_binding' || spec.key === 'neck_binding') {
            return spec.value !== 'Nein' && spec.value !== 'nein' && spec.value !== 'no';
          }
          // Checkbox-Felder: Nur anzeigen wenn aktiviert
          if (
            spec.key === 'pickguard' ||
            spec.key === 'battery_compartment' ||
            spec.key === 'pickup_mount_direct' ||
            spec.key === 'pickup_mount_frame' ||
            spec.key === 'customer_provides_body' ||
            spec.key === 'customer_provides_neck'
          ) {
            return spec.value !== 'Nein' && spec.value !== 'nein' && spec.value !== 'no';
          }
          if (spec.key === 'spokewheel') {
            return spec.value === 'Ja' || spec.value === 'ja' || spec.value === 'true';
          }
          return true;
        });
      
      const finishKeys = new Set([
        'finish_body',
        'finish_body_top',
        'finish_body_back',
        'finish_neck',
        'headstock_finish',
        'body_surface_treatment',
        'headstock_logo',
        'headstock_logo_notes',
      ]);
      const finishFieldOrder = [
        'finish_body',
        'finish_body_top',
        'finish_body_back',
        'finish_neck',
        'headstock_finish',
        'headstock_logo',
        'headstock_logo_notes',
        'electronics',
        'pickups',
        'elektronikparts',
        'hardware_color',
        'strap_pins',
        'strings',
        'tuning',
        'notes',
      ];
      const hasTopMaterial = validSpecs.some((spec) => spec.key === 'body_top');

      // Verwende die definierten Kategorien aus order-presets
      const categories = getCategoriesForOrderType(orderType);
      
      categories.forEach(category => {
        const fieldsInCategory = getFieldsForCategory(orderType, category);
        let categorySpecs = validSpecs.filter(spec => fieldsInCategory.includes(spec.key));
        if (category === 'body') {
          const directMountEnabled = isTruthySpecValue(
            validSpecs.find((spec) => spec.key === 'pickup_mount_direct')?.value,
          );
          const frameMountEnabled = isTruthySpecValue(
            validSpecs.find((spec) => spec.key === 'pickup_mount_frame')?.value,
          );
          const mountSuffix = [
            directMountEnabled ? 'Direct Mount' : null,
            frameMountEnabled ? 'Frame Mount' : null,
          ].filter(Boolean) as string[];

          categorySpecs = categorySpecs
            .filter((spec) => spec.key !== 'pickup_mount_direct' && spec.key !== 'pickup_mount_frame')
            .map((spec) => {
              if (spec.key !== 'pickups_routes' || mountSuffix.length === 0) {
                return spec;
              }
              return {
                ...spec,
                value: `${spec.value} · ${mountSuffix.join(', ')}`,
              };
            });

          if (hasTopMaterial) {
            categorySpecs = categorySpecs.filter((spec) => spec.key !== 'body_has_top');
          }
        }

        // Finish-Felder in PDF immer unter "Finish" bündeln.
        if (category !== 'finish') {
          categorySpecs = categorySpecs.filter(spec => !finishKeys.has(spec.key));
        } else {
          const specMap = new Map(categorySpecs.map((spec) => [spec.key, spec]));
          const bodyFinishFromBody = validSpecs.find((spec) => spec.key === 'body_surface_treatment');
          if (!specMap.has('finish_body') && bodyFinishFromBody) {
            specMap.set('finish_body', {
              ...bodyFinishFromBody,
              key: 'finish_body',
            });
          }
          const headstockLogo = validSpecs.find((spec) => spec.key === 'headstock_logo');
          const headstockLogoNotes = validSpecs.find((spec) => spec.key === 'headstock_logo_notes');
          if (!specMap.has('headstock_logo') && headstockLogo) {
            specMap.set('headstock_logo', headstockLogo);
          }
          if (!specMap.has('headstock_logo_notes') && headstockLogoNotes) {
            specMap.set('headstock_logo_notes', headstockLogoNotes);
          }
          const orderedFinishSpecs = fieldsInCategory
            .map((fieldKey) => specMap.get(fieldKey))
            .filter((spec): spec is typeof categorySpecs[number] => Boolean(spec));
          categorySpecs = orderedFinishSpecs;
        }

        if (categorySpecs.length > 0) {
          specsByCategory[CATEGORY_LABELS[category]] = categorySpecs;
        }
      });

      // Für Einzelaufträge (BODY/NECK) trotzdem einen Finish-Block erzeugen,
      // wenn Finish-relevante Felder vorhanden sind.
      if (!categories.includes('finish')) {
        const finishSpecMap = new Map(
          validSpecs
            .filter((spec) => finishKeys.has(spec.key))
            .map((spec) => [spec.key, spec]),
        );
        const bodyFinishFromBody = validSpecs.find((spec) => spec.key === 'body_surface_treatment');
        if (!finishSpecMap.has('finish_body') && bodyFinishFromBody) {
          finishSpecMap.set('finish_body', {
            ...bodyFinishFromBody,
            key: 'finish_body',
          });
        }
        const fallbackFinishSpecs = finishFieldOrder
          .map((fieldKey) => finishSpecMap.get(fieldKey))
          .filter((spec): spec is typeof specs[number] => Boolean(spec));
        if (fallbackFinishSpecs.length > 0) {
          specsByCategory[CATEGORY_LABELS.finish] = fallbackFinishSpecs;
        }
      }

      if (Object.keys(specsByCategory).length === 0) {
        pdf.setFontSize(10);
        pdf.text('Keine Spezifikationen vorhanden.', margin, currentY);
      } else {
        // Tabellarische Darstellung der Spezifikationen in zwei Spalten
        // Verwende die tatsächlichen Kategorien aus specsByCategory
        const availableCategories = Object.keys(specsByCategory);
        
        // Optimiertes Zwei-Spalten-Layout
        const labelWidth = 75;
        const valueWidth = 60;
        const tableWidth = labelWidth + valueWidth;
        const leftColumnX = margin;
        const rightColumnX = middleX + 5;
        
        
        // Dynamische Spaltenverteilung: Maximale Raumnutzung
        let currentColumnX = leftColumnX;
        let currentColumnY = currentY;
        let useLeftColumn = true;

        availableCategories.forEach((categoryName) => {
          const categorySpecs = specsByCategory[categoryName];
          
          // Prüfe ob Kategorie-Header noch Platz hat
          if (currentColumnY + 8 > pageHeight - 10) {
            // Wechsle zur rechten Spalte wenn noch nicht verwendet
            if (useLeftColumn) {
              useLeftColumn = false;
              currentColumnX = rightColumnX;
              currentColumnY = currentY; // Zurück zum Start der Seite
            } else {
              // Beide Spalten voll → neue Seite
              pdf.addPage();
              useLeftColumn = true;
              currentColumnX = leftColumnX;
              currentColumnY = currentY;
            }
          }

          // Kategorie-Header
          pdf.setFillColor(240, 240, 240);
          pdf.setDrawColor(0, 0, 0);
          pdf.setLineWidth(0.3);
          pdf.rect(currentColumnX, currentColumnY, tableWidth, 8, 'FD');
          
          pdf.setFontSize(11);
          pdf.setFont('helvetica', 'bold');
          pdf.text(categoryName, currentColumnX + 3, currentColumnY + 5);
          currentColumnY += 8;

          // Spezifikationen
          pdf.setFontSize(9);
          
          categorySpecs.forEach(spec => {
            const label = FIELD_LABELS[spec.key] || spec.key;
            
            // Berechne Zeilenhöhe für mehrzeilige Werte
            const lines = pdf.splitTextToSize(spec.value, valueWidth - 6);
            const rowHeight = Math.max(lines.length * 3.5 + 2, 6); // Mehr Platz unten bei mehrzeiligen Texten
            
            // Prüfe vor jeder Zeile ob noch Platz ist
            if (currentColumnY + rowHeight > pageHeight - 10) {
              if (useLeftColumn) {
                useLeftColumn = false;
                currentColumnX = rightColumnX;
                currentColumnY = currentY;
              } else {
                pdf.addPage();
                useLeftColumn = true;
                currentColumnX = leftColumnX;
                currentColumnY = currentY;
              }
            }
            
            // Tabellenzeile mit Umrandung
            pdf.setDrawColor(200, 200, 200);
            pdf.setLineWidth(0.2);
            
            // Label-Zelle
            pdf.rect(currentColumnX, currentColumnY, labelWidth, rowHeight, 'D');
            pdf.setFont('helvetica', 'bold');
            pdf.text(`${label}:`, currentColumnX + 3, currentColumnY + 4);
            
            // Wert-Zelle
            pdf.rect(currentColumnX + labelWidth, currentColumnY, valueWidth, rowHeight, 'D');
            pdf.setFont('helvetica', 'normal');
            // Für spezielle Felder die Anzeige anpassen
            let displayValue = lines;
            if (spec.key === 'spokewheel' && (spec.value === 'Ja' || spec.value === 'true')) {
              displayValue = 'Ja';
            } else if ((spec.key === 'pickguard' || spec.key === 'battery_compartment' || spec.key === 'neck_binding') && (spec.value === 'Ja' || spec.value === 'true')) {
              displayValue = 'Ja';
            }
            pdf.text(displayValue, currentColumnX + labelWidth + 3, currentColumnY + 4);
            
            currentColumnY += rowHeight;
          });
          
          // Minimaler Abstand zwischen Kategorien
          currentColumnY += 4;
        });
        
        // Finale Y-Position setzen
        currentY = currentColumnY;
      }

      // Seite 2: Als Anhang markierte Bilder (wenn vorhanden) – ohne Wasserzeichen für klare Darstellung
      if (attachImages.length > 0) {
        const sortedAttach = [...attachImages].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
        pdf.addPage('l', 'a4' as any);
        // Kein Adler-Hintergrund auf Anhänge-Seite – Bilder sollen nicht „getaucht“/verblasst wirken
        let attachY = 15;
        pdf.setFontSize(16);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Anhänge – Auftragsbilder', margin, attachY);
        attachY += 10;

        const imgMargin = 8;
        const captionHeight = 8;
        const maxImgWidth = (usableWidth - imgMargin) / 2;
        const maxImgHeight = Math.min(165, pageHeight - attachY - captionHeight - 15);
        const rowHeight = maxImgHeight + captionHeight;
        let imgCol = 0;
        let imgRowY = attachY;

        for (const img of sortedAttach) {
          const loaded = await loadImageForPdf(img.path);
          if (!loaded) continue;

          if (imgRowY + maxImgHeight > pageHeight - 20) {
            pdf.addPage('l', 'a4' as any);
            imgRowY = 15;
            imgCol = 0;
          }
          const imgX = margin + imgCol * (maxImgWidth + imgMargin);
          const scale = Math.min(maxImgWidth / loaded.width, maxImgHeight / loaded.height);
          const drawW = loaded.width * scale;
          const drawH = loaded.height * scale;
          const offsetX = (maxImgWidth - drawW) / 2;
          const offsetY = (maxImgHeight - drawH) / 2;
          const drawX = imgX + offsetX;
          const drawY = imgRowY + offsetY;
          try {
            // PNG/WebP können Transparenz haben – neutraler grauer Hintergrund für weiße Symbole
            if (loaded.format === 'PNG' || loaded.format === 'WEBP') {
              pdf.setFillColor(200, 200, 200);
              pdf.rect(drawX, drawY, drawW, drawH, 'F');
            }
            pdf.addImage(loaded.data, loaded.format, drawX, drawY, drawW, drawH);
            if (img.comment?.trim()) {
              pdf.setFontSize(8);
              pdf.setFont('helvetica', 'normal');
              const caption = img.comment.trim().substring(0, 50) + (img.comment.length > 50 ? '…' : '');
              pdf.text(caption, imgX, imgRowY + maxImgHeight + 4, { maxWidth: maxImgWidth });
            }
          } catch {
            // Bild konnte nicht eingebettet werden – überspringen
          }

          imgCol++;
          if (imgCol >= 2) {
            imgCol = 0;
            imgRowY += rowHeight;
          }
        }
      }

      // PDF als Blob generieren
      const pdfBlob = pdf.output('blob');
      
      // Bereinige Kundenname für Dateinamen
      const sanitizedCustomerName = customerName
        .trim()
        .replace(/\s+/g, '-')           // Leerzeichen zu Bindestrichen
        .replace(/[^a-zA-Z0-9äöüÄÖÜß\-]/g, '') // Nur erlaubte Zeichen
        .substring(0, 50);              // Max 50 Zeichen
      
      const filename = `Datenblatt_${orderId}_${sanitizedCustomerName}_${new Date().toISOString().split('T')[0]}.pdf`;
      
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
      alert(`Fehler beim Erstellen der PDF: ${error instanceof Error ? error.message : String(error)}`);
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
