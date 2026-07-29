// Kern des Datenblatt-Imports: PDF auslesen, mit dem Auftrag abgleichen und
// die Abweichungen als OrderFieldSuggestions anlegen. Nichts wird direkt
// uebernommen — alles laeuft ueber den Bestaetigen-Workflow.
//
// Zwei Einstiege nutzen das: der Datei-Upload im Auftrag und der Mail-Anhang
// im Posteingang. Die Logik darf sich zwischen beiden nicht unterscheiden.
import {
  PDFDocument,
  PDFTextField,
  PDFDropdown,
  PDFCheckBox,
  PDFRadioGroup,
  PDFOptionList,
  type PDFField,
} from 'pdf-lib';
import { prisma } from '@/lib/prisma';
import { getCategoriesForOrderType, getFieldsForCategory } from '@/lib/order-presets';
import {
  DATASHEET_TYPE_LABELS,
  isCheckedValue,
  isPdfLabelField,
  labelForPdfField,
  parseDatasheetSubject,
  sanitizePdfText,
} from '@/lib/customer-datasheet';

const CUSTOMER_FIELDS = new Set(['name', 'email', 'phone', 'addressLine1', 'postalCode', 'city', 'country']);

/** Warum das PDF moeglicherweise nicht zu diesem Auftrag gehoert. */
export type MismatchCode = 'unknown_origin' | 'other_order' | 'other_type';
export type ImportWarning = { code: MismatchCode; message: string };
export type IgnoredField = { field: string; label: string; value: string };

export type DatasheetImportResult =
  | { ok: true; created: number; unchanged: number; ignoredFields: IgnoredField[]; warnings?: ImportWarning[] }
  | { ok: false; status: number; error: string; needsConfirmation?: boolean; warnings?: ImportWarning[] };

function typeLabel(type?: string): string {
  if (!type) return 'unbekannt';
  return DATASHEET_TYPE_LABELS[type] || type;
}

export async function importDatasheetIntoOrder(options: {
  orderId: string;
  bytes: Uint8Array | ArrayBuffer;
  /** Herkunfts-Warnung wurde bewusst bestaetigt */
  force?: boolean;
}): Promise<DatasheetImportResult> {
  const { orderId, force = false } = options;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { customer: true, specs: true },
  });
  if (!order) return { ok: false, status: 404, error: 'Order not found' };

  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(options.bytes, { ignoreEncryption: true });
  } catch {
    return { ok: false, status: 400, error: 'Datei konnte nicht als PDF gelesen werden' };
  }

  let fields: PDFField[];
  try {
    fields = doc.getForm().getFields();
  } catch {
    fields = [];
  }
  if (fields.length === 0) {
    return { ok: false, status: 400, error: 'PDF enthaelt keine Formularfelder' };
  }

  // Herkunft pruefen, bevor irgendetwas angelegt wird. Ohne diesen Abgleich
  // landet ein fremdes Datenblatt kommentarlos als Vorschlagsliste im Auftrag.
  const origin = parseDatasheetSubject(doc.getSubject());

  // Der Herkunftsstempel steht in den Dokument-Metadaten. Manche PDF-Programme
  // schreiben die beim Speichern um — deshalb gilt ein PDF auch dann als
  // unser Datenblatt, wenn es die typischen Formularfelder mitbringt.
  const hasDatasheetFields = fields.some((f) => {
    const n = f.getName();
    return n.startsWith('order.') || n.startsWith('customer.') || isPdfLabelField(n);
  });
  const warnings: ImportWarning[] = [];

  if (!origin.isDatasheet && !hasDatasheetFields) {
    warnings.push({
      code: 'unknown_origin',
      message: 'Das PDF stammt nicht aus dieser App - die Felder passen moeglicherweise nicht.',
    });
  } else {
    if (origin.orderId && origin.orderId !== orderId) {
      warnings.push({
        code: 'other_order',
        message: `Das Datenblatt wurde fuer Auftrag ${origin.orderId} erstellt, nicht fuer ${orderId}.`,
      });
    }
    if (origin.type && origin.type !== order.type) {
      warnings.push({
        code: 'other_type',
        message: `Das Datenblatt ist vom Typ "${typeLabel(origin.type)}", der Auftrag ist "${typeLabel(order.type)}" - nicht passende Felder werden verworfen.`,
      });
    }
  }

  if (warnings.length > 0 && !force) {
    return {
      ok: false,
      status: 409,
      error: 'Herkunft des Datenblatts passt nicht zum Auftrag',
      needsConfirmation: true,
      warnings,
    };
  }

  // Erlaubte Spec-Keys fuer diesen Auftragstyp
  const allowedSpecKeys = new Set<string>();
  for (const cat of getCategoriesForOrderType(order.type)) {
    getFieldsForCategory(order.type, cat).forEach((k) => allowedSpecKeys.add(k));
  }

  // Aktuelle Werte, um Unveraendertes zu ueberspringen
  const currentSpecs = new Map<string, string>();
  for (const s of order.specs) {
    const prev = currentSpecs.get(s.key);
    if (!prev || s.value.length > prev.length) currentSpecs.set(s.key, s.value);
  }
  const currentCustomer: Record<string, string | null> = order.customer
    ? {
        name: order.customer.name,
        email: order.customer.email,
        phone: order.customer.phone,
        addressLine1: order.customer.addressLine1,
        postalCode: order.customer.postalCode,
        city: order.customer.city,
        country: order.customer.country,
      }
    : {};

  let created = 0;
  let unchanged = 0;
  // Verworfene Felder mit Klartext-Bezeichnung — eine blosse Zahl laesst den
  // Bediener raten, welche Kundenangaben unter den Tisch gefallen sind.
  const ignoredFields: IgnoredField[] = [];
  const noteIgnored = (field: string, value: string) => {
    ignoredFields.push({ field, label: labelForPdfField(field), value });
  };

  for (const field of fields) {
    const name = field.getName();
    // Reine Layout-Hilfsfelder des PDFs — nicht mitzaehlen, sonst meldet jeder
    // saubere Import "N ignoriert" und man sucht den Fehler an der falschen Stelle.
    if (isPdfLabelField(name)) continue;

    let value = '';
    // Leeres Ankreuzkaestchen ist zunaechst "keine Angabe" — es wird erst dann
    // zu einem "Nein", wenn im Auftrag bisher ein Ja steht (s. unten).
    let uncheckedBox = false;
    if (field instanceof PDFTextField) {
      value = field.getText() || '';
    } else if (field instanceof PDFDropdown) {
      value = field.getSelected().join(', ');
    } else if (field instanceof PDFOptionList) {
      value = field.getSelected().join(', ');
    } else if (field instanceof PDFRadioGroup) {
      value = field.getSelected() || '';
    } else if (field instanceof PDFCheckBox) {
      if (field.isChecked()) value = 'Ja';
      else uncheckedBox = true;
    }
    value = value.trim();
    if (!value && !uncheckedBox) continue;

    let currentValue: string | null | undefined;
    if (name.startsWith('order.')) {
      const key = name.slice('order.'.length);
      if (!allowedSpecKeys.has(key)) { noteIgnored(name, value); continue; }
      currentValue = currentSpecs.get(key);
    } else if (name.startsWith('customer.')) {
      const key = name.slice('customer.'.length);
      if (!CUSTOMER_FIELDS.has(key)) { noteIgnored(name, value); continue; }
      currentValue = currentCustomer[key];
    } else {
      noteIgnored(name, value);
      continue;
    }

    if (uncheckedBox) {
      // Nur ein Widerspruch zum aktuellen Stand ist eine Aussage. Sonst wuerde
      // jedes nicht angekreuzte Kaestchen einen "Nein"-Vorschlag erzeugen.
      if (!isCheckedValue(currentValue ?? undefined)) { unchanged++; continue; }
      value = 'Nein';
    }

    // Der Vergleich muss die PDF-Normalisierung beruecksichtigen: Werte mit
    // typografischen Zeichen kommen zwangslaeufig veraendert zurueck und
    // waeren sonst bei jedem Import ein neuer "Vorschlag".
    const currentTrimmed = currentValue?.trim();
    if (
      currentTrimmed != null &&
      (currentTrimmed === value || sanitizePdfText(currentTrimmed) === value)
    ) {
      unchanged++;
      continue;
    }

    const existing = await prisma.orderFieldSuggestion.findFirst({
      where: { orderId, field: name, value, status: 'suggested' },
    });
    if (existing) {
      unchanged++;
      continue;
    }

    await prisma.orderFieldSuggestion.create({
      data: { orderId, field: name, value, status: 'suggested' },
    });
    created++;
  }

  return {
    ok: true,
    created,
    unchanged,
    ignoredFields,
    // Bei bestaetigtem Import zurueckmelden, was ueberstimmt wurde.
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}
