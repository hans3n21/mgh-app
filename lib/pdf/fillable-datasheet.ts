// Server-seitige Erzeugung ausfüllbarer Kunden-Datenblätter (AcroForm-PDF).
// Felder mit Autofill-Vorgaben werden als editierbare Dropdowns angelegt:
// Der Kunde kann eine Vorgabe wählen ODER frei tippen — wie das Autofill in der App.
//
// Abhängige Felder (z. B. Top-Material nur bei "Top vorhanden: Ja") werden per
// PDF-JavaScript ein- und ausgeblendet, analog zu `shouldRenderField` im
// Auftragsformular. Das läuft in Adobe Acrobat Reader / Foxit / PDF-XChange.
// Viewer ohne JS (Chrome, Edge, macOS Preview) zeigen schlicht alle Felder —
// es geht also nichts verloren, es ist nur weniger komfortabel.
import { promises as fs } from 'fs';
import path from 'path';
import {
  AnnotationFlags,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFPage,
  StandardFonts,
  rgb,
  type PDFField,
  type PDFTextField,
} from 'pdf-lib';
import {
  DATASHEET_TYPE_LABELS,
  buildDatasheetSubject,
  checkboxDetail,
  getCustomerSheetSections,
  isCheckedValue,
  PDF_LABEL_FIELD_PREFIX,
  sanitizePdfText,
  type CustomerFieldSample,
} from '@/lib/customer-datasheet';

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 40;
const CONTENT_W = A4[0] - MARGIN * 2;
const LABEL_W = 178;
const FIELD_X = MARGIN + LABEL_W + 8;
const FIELD_W = A4[0] - MARGIN - FIELD_X;
const ROW_H = 24;
const LABEL_H = 15;
const CHECKBOX_SIZE = 11;
const MULTILINE_H = 46;
const FOOTER_Y = 30;

// Bildbeispiele unter einem Feld (Headstock-Logos)
const SAMPLE_IMG_H = 74;
const SAMPLE_GAP = 12;
const SAMPLE_CAPTION_H = 20;
const SAMPLE_BLOCK_H = SAMPLE_IMG_H + SAMPLE_CAPTION_H + 16;

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

/** Was das eingebettete JavaScript zur Laufzeit auswerten muss. */
type VisibilityRule = {
  /** PDF-Feldname des abhaengigen Felds */
  field: string;
  /** PDF-Feldname des zugehoerigen Label-Felds */
  label: string;
  /** PDF-Feldname des Steuerfelds */
  controller: string;
  show?: string[];
  hide?: string[];
  /** Feld war vorbefuellt -> nie ausblenden (wie `hasLegacyValue` in der App) */
  sticky: boolean;
  /**
   * Steuerfeld ist ein Ankreuzkaestchen. Dessen Wert ist "Off" bzw. der
   * Export-Wert des Haekchens — nicht "Ja"/"Nein". Wird deshalb gesondert
   * ausgewertet: angekreuzt == Ja.
   */
  checkbox: boolean;
};

// WinAnsi-sichere Zeichen erzwingen (Standard-Helvetica kann kein volles Unicode).
// Liegt in customer-datasheet, weil der Import dieselbe Normalisierung zum
// Vergleichen braucht.
const sanitize = sanitizePdfText;

/** Feldname fuer das mitversteckte Label. Ohne Punkt, damit der Import ihn ueberspringt. */
function labelFieldName(fieldName: string): string {
  return `${PDF_LABEL_FIELD_PREFIX}${fieldName.replace(/[^A-Za-z0-9]/g, '_')}`;
}

/** Widget-Annotation als versteckt markieren. */
function hideField(field: PDFField): void {
  for (const widget of field.acroField.getWidgets()) {
    widget.setFlagTo(AnnotationFlags.Hidden, true);
  }
}

/**
 * JavaScript-Aktion, die beim Aendern des Feldwerts feuert.
 * /V (validate) greift bei Text- und Auswahlfeldern, Ankreuzkaestchen brauchen
 * zusaetzlich /U (Maustaste losgelassen) — dort feuert /V nicht zuverlaessig.
 */
function setOnChangeAction(doc: PDFDocument, field: PDFField, js: string, alsoOnMouseUp = false): void {
  const makeAction = () =>
    doc.context.obj({
      S: PDFName.of('JavaScript'),
      JS: PDFHexString.fromText(js),
    });
  const additionalActions = doc.context.obj({});
  additionalActions.set(PDFName.of('V'), makeAction());
  if (alsoOnMouseUp) additionalActions.set(PDFName.of('U'), makeAction());
  field.acroField.dict.set(PDFName.of('AA'), additionalActions);
}

function matches(value: string, candidates: string[]): boolean {
  const v = value.trim().toLowerCase();
  return candidates.some((c) => c.trim().toLowerCase() === v);
}

/** Serverseitige Startsichtbarkeit — gleiche Logik wie das eingebettete JS. */
function isInitiallyVisible(rule: VisibilityRule, values: Record<string, string>): boolean {
  const controllerValue = values[rule.controller] || '';
  if (rule.checkbox) {
    const checked = isCheckedValue(controllerValue);
    if (rule.hide) return !checked;
    if (rule.show) return checked || rule.sticky;
    return true;
  }
  if (rule.hide && matches(controllerValue, rule.hide)) return false;
  if (rule.show && !matches(controllerValue, rule.show)) return rule.sticky;
  return true;
}

/**
 * Das eingebettete Skript. Laeuft beim Oeffnen und nach jeder Aenderung eines
 * Steuerfelds. Alles in try/catch — ein Fehler darf das Formular nie sperren.
 */
function buildVisibilityScript(rules: VisibilityRule[]): string {
  return `
var mghDoc = this;
var MGH_RULES = ${JSON.stringify(rules)};
function mghNorm(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/^\\s+|\\s+$/g, '').toLowerCase();
}
function mghIn(value, list) {
  if (!list) return false;
  for (var i = 0; i < list.length; i++) {
    if (mghNorm(list[i]) === value) return true;
  }
  return false;
}
function mghShow(name, visible) {
  try {
    var f = mghDoc.getField(name);
    if (f) f.display = visible ? display.visible : display.hidden;
  } catch (e) {}
}
function mghSync() {
  for (var i = 0; i < MGH_RULES.length; i++) {
    var r = MGH_RULES[i];
    var current = '';
    try {
      var c = mghDoc.getField(r.controller);
      if (c) current = mghNorm(c.value);
    } catch (e) {}
    var visible = true;
    if (r.checkbox) {
      // Ankreuzkaestchen liefern "Off" bzw. den Export-Wert des Haekchens.
      var checked = current !== '' && current !== 'off';
      if (r.hide) visible = !checked;
      else if (r.show) visible = checked || r.sticky;
    } else if (r.hide && mghIn(current, r.hide)) {
      visible = false;
    } else if (r.show && !mghIn(current, r.show)) {
      visible = r.sticky ? true : false;
    }
    mghShow(r.field, visible);
    mghShow(r.label, visible);
  }
}
mghSync();
`.trim();
}

export async function generateFillableDatasheet(opts: FillableDatasheetOptions): Promise<Uint8Array> {
  const typeLabel = DATASHEET_TYPE_LABELS[opts.type] || opts.type;
  const sections = getCustomerSheetSections(opts.type);
  const values = opts.values || {};

  const doc = await PDFDocument.create();
  doc.setTitle(`MGH Datenblatt - ${typeLabel}`);
  doc.setAuthor('MGH Guitars');
  doc.setSubject(buildDatasheetSubject(opts.type, opts.orderId));

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const form = doc.getForm();

  const embedJpgFile = async (publicPath: string) => {
    try {
      const bytes = await fs.readFile(path.join(process.cwd(), 'public', publicPath.replace(/^\//, '')));
      return await doc.embedJpg(bytes);
    } catch {
      return null;
    }
  };

  // JPG statt PNG: ~200 KB statt ~700 KB — das PDF geht per Mail raus.
  const logo = await embedJpgFile('/images/mgh-eagle-logo.jpg');

  // Bildbeispiele vorab laden; fehlende Dateien werden stillschweigend uebersprungen.
  const sampleImages = new Map<string, Awaited<ReturnType<typeof embedJpgFile>>>();
  for (const section of sections) {
    for (const f of section.fields) {
      for (const sample of f.samples || []) {
        if (sampleImages.has(sample.image)) continue;
        sampleImages.set(sample.image, await embedJpgFile(sample.image));
      }
    }
  }

  // Nur Regeln, deren Steuerfeld in diesem Auftragstyp ueberhaupt vorkommt —
  // sonst wuerde ein Feld dauerhaft ausgeblendet bleiben.
  const allFields = sections.flatMap((s) => s.fields);
  const presentFields = new Set(allFields.map((f) => f.name));
  const checkboxFields = new Set(allFields.filter((f) => f.kind === 'checkbox').map((f) => f.name));
  const rules: VisibilityRule[] = [];
  for (const f of allFields) {
    const c = f.condition;
    if (!c) continue;
    const controller = `order.${c.controller}`;
    if (!presentFields.has(controller)) continue;
    rules.push({
      field: f.name,
      label: labelFieldName(f.name),
      controller,
      show: c.showWhen,
      hide: c.hideWhen,
      sticky: Boolean((values[f.name] || '').trim()),
      checkbox: checkboxFields.has(controller),
    });
  }
  const ruleByField = new Map(rules.map((r) => [r.field, r]));
  const controllerFields = new Set(rules.map((r) => r.controller));

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
    'Das Formular denkt mit: Je nach Auswahl erscheinen oder verschwinden passende Zusatzfelder.',
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

  /** Bildbeispiele nebeneinander unter dem Feld. */
  const drawSamples = (samples: CustomerFieldSample[]) => {
    const usable = samples.filter((s) => sampleImages.get(s.image));
    if (usable.length === 0) return;

    ensureSpace(SAMPLE_BLOCK_H);
    page.drawText(sanitize('Unsere Logos zur Ansicht:'), {
      x: FIELD_X, y: y - 8, size: 7.5, font: bold, color: COLOR_MID,
    });
    y -= 14;

    const colW = (FIELD_W - SAMPLE_GAP * (usable.length - 1)) / usable.length;
    const imgTop = y;
    usable.forEach((sample, i) => {
      const img = sampleImages.get(sample.image)!;
      const scale = Math.min(SAMPLE_IMG_H / img.height, colW / img.width);
      const w = img.width * scale;
      const h = img.height * scale;
      const colX = FIELD_X + i * (colW + SAMPLE_GAP);
      const x = colX + (colW - w) / 2;

      page.drawImage(img, { x, y: imgTop - h, width: w, height: h });
      page.drawRectangle({
        x, y: imgTop - h, width: w, height: h,
        borderColor: COLOR_LINE, borderWidth: 0.6,
      });

      const caption = sanitize(sample.caption);
      const capW = bold.widthOfTextAtSize(caption, 7.2);
      page.drawText(caption, {
        x: colX + Math.max(0, (colW - capW) / 2),
        y: imgTop - SAMPLE_IMG_H - 9,
        size: 7.2, font: bold, color: COLOR_DARK,
      });

      if (sample.hint) {
        const hint = sanitize(sample.hint);
        const hintW = font.widthOfTextAtSize(hint, 6.6);
        page.drawText(hint, {
          x: colX + Math.max(0, (colW - hintW) / 2),
          y: imgTop - SAMPLE_IMG_H - 18,
          size: 6.6, font, color: COLOR_LIGHT, maxWidth: colW,
        });
      }
    });

    y -= SAMPLE_IMG_H + SAMPLE_CAPTION_H + 2;
  };

  // Label-Felder mit Fettschrift muessen nach updateFieldAppearances() nachgezogen
  // werden — der Sammelaufruf rendert sonst alles in der Normalschrift.
  const boldLabelFields: PDFTextField[] = [];

  /** Label als eigenes Feld, damit es zusammen mit der Eingabe verschwinden kann. */
  const drawLabelField = (fieldName: string, text: string, required?: boolean) => {
    const tf = form.createTextField(labelFieldName(fieldName));
    tf.setText(sanitize(text));
    tf.enableReadOnly();
    tf.addToPage(page, {
      x: MARGIN, y: y - LABEL_H, width: LABEL_W, height: LABEL_H,
      borderWidth: 0,
      textColor: COLOR_MID,
      font: required ? bold : font,
    });
    tf.setFontSize(8.6);
    if (required) boldLabelFields.push(tf);
    return tf;
  };

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
      const rule = ruleByField.get(f.name);
      const label = f.label + (f.required ? ' *' : '');

      // Label: bedingte Zeilen brauchen ein Feld (blendet mit aus), sonst Text.
      let labelField: PDFField | null = null;
      if (rule) {
        labelField = drawLabelField(f.name, label, f.required);
      } else {
        page.drawText(sanitize(label), { x: MARGIN, y: y - 10, size: 8.6, font: f.required ? bold : font, color: COLOR_MID, maxWidth: LABEL_W });
      }

      const prefill = values[f.name];
      let field: PDFField;

      if (f.kind === 'checkbox') {
        // Echtes Ankreuzkaestchen — wie die Checkbox im Auftragsdetail.
        const cb = form.createCheckBox(f.name);
        if (isCheckedValue(prefill)) cb.check();
        cb.addToPage(page, {
          x: FIELD_X, y: y - CHECKBOX_SIZE - 2, width: CHECKBOX_SIZE, height: CHECKBOX_SIZE,
          borderColor: COLOR_LINE, borderWidth: 0.8, backgroundColor: FIELD_BG,
        });
        // Freitext aus dem Auftrag stehenlassen — ein Haekchen allein wuerde
        // Angaben wie "Batteriefach fraesen" unterschlagen.
        const detail = checkboxDetail(prefill);
        page.drawText(sanitize(detail ? `bisher notiert: ${detail}` : 'ankreuzen, wenn gewünscht'), {
          x: FIELD_X + CHECKBOX_SIZE + 7, y: y - CHECKBOX_SIZE + 1,
          size: 7.5, font, color: detail ? COLOR_MID : COLOR_LIGHT,
          maxWidth: FIELD_W - CHECKBOX_SIZE - 7,
        });
        field = cb;
      } else if (f.kind === 'choice' && f.options && f.options.length > 0) {
        const dd = form.createDropdown(f.name);
        const ddOptions = f.options.map(sanitize);
        // Bestehende Auftragswerte stehen oft nicht in der Vorgabenliste —
        // dann als zusaetzliche Option anhaengen, damit die Vorbelegung erhalten bleibt.
        const pre = prefill ? sanitize(prefill) : undefined;
        if (pre && !ddOptions.includes(pre)) ddOptions.push(pre);
        dd.setOptions(ddOptions);
        dd.enableEditing();
        // Auswahl sofort uebernehmen, damit die /V-Aktion beim Klick feuert.
        if (controllerFields.has(f.name)) dd.enableSelectOnClick();
        if (pre) dd.select(pre);
        dd.addToPage(page, {
          x: FIELD_X, y: fieldY, width: FIELD_W, height: fieldH,
          borderColor: COLOR_LINE, borderWidth: 0.8, backgroundColor: FIELD_BG,
          font,
        });
        dd.setFontSize(8.5);
        field = dd;
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
        field = tf;
      }

      // Startzustand serverseitig setzen, damit das PDF auch ohne ausgefuehrtes
      // JavaScript sinnvoll aussieht (Acrobat korrigiert beim Oeffnen nach).
      if (rule && !isInitiallyVisible(rule, values)) {
        hideField(field);
        if (labelField) hideField(labelField);
      }

      // Steuerfelder stossen die Neuberechnung an.
      if (controllerFields.has(f.name)) {
        setOnChangeAction(doc, field, 'mghSync();', f.kind === 'checkbox');
      }

      y -= h;

      if (f.samples && f.samples.length > 0) drawSamples(f.samples);
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
  boldLabelFields.forEach((tf) => tf.updateAppearances(bold));

  // Erst nach updateFieldAppearances: das Skript setzt die Sichtbarkeit beim
  // Oeffnen neu, damit auch nachtraeglich geaenderte Werte greifen.
  if (rules.length > 0) {
    doc.addJavaScript('mgh_visibility', buildVisibilityScript(rules));
  }

  return doc.save();
}
