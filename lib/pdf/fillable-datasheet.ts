// Server-seitige Erzeugung ausfüllbarer Kunden-Datenblätter (AcroForm-PDF).
// Felder mit Autofill-Vorgaben werden als editierbare Dropdowns angelegt:
// Der Kunde kann eine Vorgabe wählen ODER frei tippen — wie das Autofill in der App.
import { promises as fs } from 'fs';
import path from 'path';
import {
  PDFDocument,
  PDFFont,
  PDFPage,
  StandardFonts,
  rgb,
} from 'pdf-lib';
import {
  DATASHEET_TYPE_LABELS,
  getCustomerSheetSections,
  type CustomerField,
} from '@/lib/customer-datasheet';

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 40;
const CONTENT_W = A4[0] - MARGIN * 2;
const LABEL_W = 178;
const FIELD_X = MARGIN + LABEL_W + 8;
const FIELD_W = A4[0] - MARGIN - FIELD_X;
const ROW_H = 24;
const MULTILINE_H = 46;
const FOOTER_Y = 30;

const COLOR_DARK = rgb(0.12, 0.14, 0.18);
const COLOR_MID = rgb(0.35, 0.38, 0.44);
const COLOR_LIGHT = rgb(0.55, 0.58, 0.64);
const COLOR_LINE = rgb(0.78, 0.8, 0.84);
const FIELD_BG = rgb(0.965, 0.97, 0.985);

export type FillableDatasheetOptions = {
  type: string; // OrderType
  orderId?: string;
  orderTitle?: string;
  /** Vorbelegung: PDF-Feldname (order.x / customer.x) -> Wert */
  values?: Record<string, string>;
};

// WinAnsi-sichere Zeichen erzwingen (Standard-Helvetica kann kein volles Unicode).
function sanitize(text: string): string {
  return text
    .replace(/[‘’‚]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/–|—/g, '-')
    .replace(/…/g, '...')
    // alles außerhalb Latin-1 ersetzen
    .replace(/[^\x20-\x7E\xA0-\xFF\n]/g, '?');
}

export async function generateFillableDatasheet(opts: FillableDatasheetOptions): Promise<Uint8Array> {
  const typeLabel = DATASHEET_TYPE_LABELS[opts.type] || opts.type;
  const sections = getCustomerSheetSections(opts.type);
  const values = opts.values || {};

  const doc = await PDFDocument.create();
  doc.setTitle(`MGH Datenblatt - ${typeLabel}`);
  doc.setAuthor('MGH Guitars');
  doc.setSubject(`mgh-datasheet;type=${opts.type};orderId=${opts.orderId || ''}`);

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const form = doc.getForm();

  // JPG statt PNG: ~200 KB statt ~700 KB — das PDF geht per Mail raus.
  let logo: Awaited<ReturnType<PDFDocument['embedJpg']>> | null = null;
  try {
    const logoBytes = await fs.readFile(path.join(process.cwd(), 'public', 'images', 'mgh-eagle-logo.jpg'));
    logo = await doc.embedJpg(logoBytes);
  } catch {
    logo = null;
  }

  const pages: PDFPage[] = [];
  let page = doc.addPage(A4);
  pages.push(page);
  let y = A4[1] - MARGIN;

  const newPage = () => {
    page = doc.addPage(A4);
    pages.push(page);
    y = A4[1] - MARGIN;
  };

  const ensureSpace = (needed: number) => {
    if (y - needed < FOOTER_Y + 24) newPage();
  };

  const drawText = (text: string, x: number, size: number, opts2?: { font?: PDFFont; color?: ReturnType<typeof rgb>; yOffset?: number }) => {
    page.drawText(sanitize(text), {
      x,
      y: y + (opts2?.yOffset || 0),
      size,
      font: opts2?.font || font,
      color: opts2?.color || COLOR_DARK,
    });
  };

  // ---------- Kopf (nur Seite 1) ----------
  const headerH = 58;
  if (logo) {
    const logoH = 52;
    const logoW = (logo.width / logo.height) * logoH;
    page.drawImage(logo, { x: MARGIN, y: y - logoH + 6, width: logoW, height: logoH });
  }
  page.drawText('MGH Guitars', { x: MARGIN + 62, y: y - 14, size: 17, font: bold, color: COLOR_DARK });
  page.drawText(sanitize(`Kundendatenblatt - ${typeLabel}`), { x: MARGIN + 62, y: y - 32, size: 12, font, color: COLOR_MID });
  if (opts.orderId) {
    const ref = sanitize(`Auftrag: ${opts.orderId}${opts.orderTitle ? ` - ${opts.orderTitle}` : ''}`);
    page.drawText(ref, { x: MARGIN + 62, y: y - 47, size: 9, font, color: COLOR_LIGHT });
  }
  y -= headerH;

  // ---------- Hinweisbox ----------
  const hints = [
    'So funktioniert es: Bitte füllen Sie die Felder direkt am Computer aus (empfohlen: Adobe Acrobat Reader,',
    'kostenlos). Felder mit Pfeil enthalten gängige Vorgaben - Sie können aber jederzeit eigenen Text eintippen.',
    'Lassen Sie Felder, zu denen Sie nichts wissen, einfach leer - das besprechen wir gemeinsam.',
    'Referenzbilder (z. B. Vorlagen, Zeichnungen) hängen Sie bitte einfach mit an die Antwort-E-Mail an.',
    'Danach: Speichern und als Anhang an uns zurücksenden. Vielen Dank!',
  ];
  const boxH = hints.length * 11 + 14;
  page.drawRectangle({ x: MARGIN, y: y - boxH, width: CONTENT_W, height: boxH, borderColor: COLOR_LINE, borderWidth: 0.8, color: rgb(0.985, 0.985, 0.99) });
  hints.forEach((line, i) => {
    page.drawText(sanitize(line), { x: MARGIN + 8, y: y - 16 - i * 11, size: 7.8, font: i === 0 ? bold : font, color: COLOR_MID });
  });
  y -= boxH + 14;

  // ---------- Abschnitte ----------
  for (const section of sections) {
    ensureSpace(ROW_H * 2 + 20);

    // Abschnittsbalken
    page.drawRectangle({ x: MARGIN, y: y - 17, width: CONTENT_W, height: 17, color: COLOR_DARK });
    page.drawText(sanitize(section.title), { x: MARGIN + 7, y: y - 12.5, size: 10, font: bold, color: rgb(1, 1, 1) });
    y -= 17 + 8;

    for (const f of section.fields) {
      const h = f.kind === 'multiline' ? MULTILINE_H : ROW_H;
      ensureSpace(h);

      const fieldH = f.kind === 'multiline' ? MULTILINE_H - 6 : 15;
      const fieldY = y - fieldH;

      // Label
      const label = sanitize(f.label + (f.required ? ' *' : ''));
      page.drawText(label, { x: MARGIN, y: y - 10, size: 8.6, font: f.required ? bold : font, color: COLOR_MID, maxWidth: LABEL_W });

      const prefill = values[f.name];

      if (f.kind === 'choice' && f.options && f.options.length > 0) {
        const dd = form.createDropdown(f.name);
        const ddOptions = f.options.map(sanitize);
        // Bestehende Auftragswerte stehen oft nicht in der Vorgabenliste —
        // dann als zusaetzliche Option anhaengen, damit die Vorbelegung erhalten bleibt.
        const pre = prefill ? sanitize(prefill) : undefined;
        if (pre && !ddOptions.includes(pre)) ddOptions.push(pre);
        dd.setOptions(ddOptions);
        dd.enableEditing();
        if (pre) dd.select(pre);
        dd.addToPage(page, {
          x: FIELD_X, y: fieldY, width: FIELD_W, height: fieldH,
          borderColor: COLOR_LINE, borderWidth: 0.8, backgroundColor: FIELD_BG,
          font,
        });
        dd.setFontSize(8.5);
      } else {
        const tf = form.createTextField(f.name);
        if (f.kind === 'multiline') tf.enableMultiline();
        if (prefill) tf.setText(sanitize(prefill));
        tf.addToPage(page, {
          x: FIELD_X, y: fieldY, width: FIELD_W, height: fieldH,
          borderColor: COLOR_LINE, borderWidth: 0.8, backgroundColor: FIELD_BG,
          font,
        });
        tf.setFontSize(8.5);
      }

      y -= h;
    }

    y -= 10;
  }

  // Pflichtfeld-Legende
  ensureSpace(14);
  page.drawText(sanitize('* Pflichtangabe'), { x: MARGIN, y: y - 8, size: 7.5, font, color: COLOR_LIGHT });

  // ---------- Fusszeilen ----------
  const footer = sanitize(`MGH Guitars - Datenblatt ${typeLabel}${opts.orderId ? ` - Auftrag ${opts.orderId}` : ''}`);
  pages.forEach((p, i) => {
    p.drawText(footer, { x: MARGIN, y: FOOTER_Y, size: 7.5, font, color: COLOR_LIGHT });
    const pn = `Seite ${i + 1} / ${pages.length}`;
    const pnW = font.widthOfTextAtSize(pn, 7.5);
    p.drawText(pn, { x: A4[0] - MARGIN - pnW, y: FOOTER_Y, size: 7.5, font, color: COLOR_LIGHT });
  });

  form.updateFieldAppearances(font);
  return doc.save();
}
