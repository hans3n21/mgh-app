// Definition der kundenseitig ausfüllbaren Datenblätter (PDF-Formulare).
// Baut 1:1 auf den internen Spec-Presets auf: Die PDF-Formularfelder heißen
// `order.<specKey>` bzw. `customer.<feld>` — exakt die Feldnamen, die der
// Vorschlags-Workflow (OrderFieldSuggestion) beim Akzeptieren versteht.
import {
  OrderType,
  SPEC_PRESETS,
  FIELD_LABELS,
  CATEGORY_LABELS,
  type CategoryKey,
} from './order-presets';
import { AUTOFILL_OPTIONS } from './autofill-data';
import { HEADSTOCK_LOGOS_WITH_IMAGE } from './headstock-logos';

export type CustomerFieldKind = 'text' | 'choice' | 'multiline' | 'checkbox';

/**
 * Sichtbarkeitsregel eines Felds — spiegelt `shouldRenderField` aus dem
 * Auftragsformular. Im PDF wird daraus JavaScript, das Zeilen ein-/ausblendet.
 */
export type FieldCondition = {
  /** Spec-Key des Steuerfelds (ohne "order."-Praefix) */
  controller: string;
  /** Sichtbar, wenn der Controller einen dieser Werte hat */
  showWhen?: string[];
  /** Unsichtbar, wenn der Controller einen dieser Werte hat */
  hideWhen?: string[];
};

/** Bildbeispiel unter einem Feld (aktuell nur die Headstock-Logos). */
export type CustomerFieldSample = {
  /** Pfad unter public/ */
  image: string;
  caption: string;
  hint?: string;
};

export type CustomerField = {
  /** PDF-Formularfeldname, z. B. "order.body_shape" oder "customer.name" */
  name: string;
  label: string;
  kind: CustomerFieldKind;
  options?: string[];
  required?: boolean;
  /** Nur gesetzt, wenn das Feld von einem anderen Feld abhaengt */
  condition?: FieldCondition;
  /** Bildbeispiele, die unter dem Feld gezeigt werden */
  samples?: CustomerFieldSample[];
};

// Wie `isTruthySpecValue` in den Formularen — alle Schreibweisen fuer "Ja".
const JA = ['Ja', 'ja', 'JA', 'true', '1', 'yes'];
const GRAVUR = ['Gravur', 'Lasergravur', 'Brandgravur'];

/**
 * Abhaengigkeiten zwischen den Feldern, Key = Spec-Key des abhaengigen Felds.
 * Muss inhaltlich zu `shouldRenderField` (OrderDetailTabsNew/OrderSpecsSidebar/
 * OrderDatasheetForm) und `getConditionalFields` (order-presets) passen.
 */
export const FIELD_CONDITIONS: Record<string, FieldCondition> = {
  // Mit Top: Top-Material/-Dicke + getrenntes Finish. Ohne Top: Gesamt-Finish.
  body_top: { controller: 'body_has_top', showWhen: JA },
  body_top_thickness: { controller: 'body_has_top', showWhen: JA },
  finish_body_top: { controller: 'body_has_top', showWhen: JA },
  finish_body_back: { controller: 'body_has_top', showWhen: JA },
  finish_body: { controller: 'body_has_top', hideWhen: JA },
  body_surface_treatment: { controller: 'body_has_top', hideWhen: JA },

  // Ja/Nein-Feld mit Detailangabe dahinter
  pickguard_material: { controller: 'pickguard_checkbox', showWhen: JA },
  battery_compartment_details: { controller: 'battery_compartment_checkbox', showWhen: JA },

  // Logo-Notizen nur, wenn ueberhaupt ein Logo drauf soll
  headstock_logo_notes: { controller: 'headstock_logo', hideWhen: ['Kein Logo'] },

  // Oberflaechenbehandlung: Gravuren brauchen keine Lack-Angaben, Oel/Wachs kein
  // Farb-/Speziallack-Feld (siehe getConditionalFields).
  farbe: { controller: 'oberflaeche_typ', hideWhen: [...GRAVUR, 'Öl/Wachs'] },
  aged: { controller: 'oberflaeche_typ', hideWhen: GRAVUR },
  speziallack: { controller: 'oberflaeche_typ', hideWhen: [...GRAVUR, 'Öl/Wachs'] },
};

/** Bildbeispiele je Spec-Key. */
const FIELD_SAMPLES: Record<string, CustomerFieldSample[]> = {
  headstock_logo: HEADSTOCK_LOGOS_WITH_IMAGE.map((logo) => ({
    image: logo.thumb,
    caption: logo.value,
    hint: logo.description,
  })),
};

export type CustomerSheetSection = {
  title: string;
  fields: CustomerField[];
};

export const DATASHEET_TYPE_LABELS: Record<string, string> = {
  GUITAR: 'Gitarrenbau',
  BODY: 'Body',
  NECK: 'Hals',
  REPAIR: 'Reparatur',
  PICKGUARD: 'Pickguard',
  PICKUPS: 'Tonabnehmer',
  ENGRAVING: 'Gravur',
  FINISH_ONLY: 'Oberflächenbehandlung',
};

// Labels für Spec-Keys, die (noch) nicht in FIELD_LABELS gepflegt sind.
const EXTRA_LABELS: Record<string, string> = {
  pickguard_checkbox: 'Pickguard gewünscht',
  pickguard_material: 'Pickguard-Material',
  battery_compartment_checkbox: 'Batteriefach gewünscht',
  battery_compartment_details: 'Batteriefach-Details',
};

// Felder ohne Autofill-Vorgaben, die trotzdem reine Ja/Nein-Felder sind.
const JA_NEIN_FIELDS = new Set<string>([
  'pickguard_checkbox',
  'battery_compartment_checkbox',
]);

/**
 * Reine Ja/Nein-Felder werden im PDF als echtes Ankreuzkaestchen ausgegeben —
 * so wie sie im Auftragsdetail als Checkbox erscheinen. Felder mit echten
 * Auswahlwerten (Pickguard-Material, Binding-Farbe) bleiben Dropdowns, sonst
 * gingen die Vorgaben verloren.
 */
function isCheckboxField(key: string): boolean {
  if (JA_NEIN_FIELDS.has(key)) return true;
  const options = AUTOFILL_OPTIONS[key];
  if (!options || options.length !== 2) return false;
  const normalized = options.map((o) => o.trim().toLowerCase()).sort();
  return normalized[0] === 'ja' && normalized[1] === 'nein';
}

/**
 * Praefix der Hilfsfelder, die im PDF nur die Beschriftung bedingter Zeilen
 * tragen (damit sie mit ausgeblendet werden koennen). Sie enthalten keine
 * Kundendaten und muessen beim Import uebergangen werden.
 */
export const PDF_LABEL_FIELD_PREFIX = 'mghlbl_';

/**
 * Herkunftsstempel im PDF-Feld "Subject". Damit erkennt der Import, aus welchem
 * Auftrag und Auftragstyp ein Datenblatt stammt — Acrobat laesst die
 * Dokument-Metadaten beim Speichern unveraendert.
 */
const DATASHEET_MARKER = 'mgh-datasheet';

export type DatasheetOrigin = {
  /** Stammt das PDF nachweislich aus dieser App? */
  isDatasheet: boolean;
  /** Auftragstyp, mit dem das PDF erzeugt wurde */
  type?: string;
  /** Auftrag, aus dem es erzeugt wurde — fehlt bei Blanko-Datenblaettern */
  orderId?: string;
};

export function buildDatasheetSubject(type: string, orderId?: string): string {
  return `${DATASHEET_MARKER};type=${type};orderId=${orderId || ''}`;
}

export function parseDatasheetSubject(subject?: string): DatasheetOrigin {
  const raw = (subject || '').trim();
  if (!raw.startsWith(DATASHEET_MARKER)) return { isDatasheet: false };

  const parts = new Map<string, string>();
  for (const segment of raw.split(';').slice(1)) {
    const index = segment.indexOf('=');
    if (index === -1) continue;
    parts.set(segment.slice(0, index).trim(), segment.slice(index + 1).trim());
  }
  return {
    isDatasheet: true,
    type: parts.get('type') || undefined,
    orderId: parts.get('orderId') || undefined,
  };
}

export function isPdfLabelField(name: string): boolean {
  return name.startsWith(PDF_LABEL_FIELD_PREFIX);
}

/**
 * Zeichen WinAnsi-sicher machen — die Standard-Helvetica im PDF kann kein
 * volles Unicode. Wird beim Erzeugen des PDFs angewandt UND beim Import zum
 * Vergleichen: sonst meldet jeder Reimport typografische Anfuehrungszeichen
 * ("Skull'n'bones" -> "Skull'n'bones") faelschlich als Aenderung.
 */
export function sanitizePdfText(text: string): string {
  return text
    .replace(/[‘’‚]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/–|—/g, '-')
    .replace(/…/g, '...')
    // alles außerhalb Latin-1 ersetzen
    .replace(/[^\x20-\x7E\xA0-\xFF\n]/g, '?');
}

const NEGATIVE_VALUES = new Set(['nein', 'no', 'false', '0', '-', 'n/a']);

/**
 * Angekreuzt oder nicht? Bewusst tolerant, wie die Checkbox-Komponenten im
 * Auftragsdetail (PickguardInput, BatteryCompartmentInput, BindingInput):
 * alles ausser leer und einer ausdruecklichen Verneinung gilt als "ja".
 * In `battery_compartment` steht z. B. real "Batteriefach fräsen" statt "Ja".
 */
export function isCheckedValue(value?: string): boolean {
  const normalized = (value || '').trim().toLowerCase();
  if (!normalized) return false;
  return !NEGATIVE_VALUES.has(normalized);
}

/**
 * Freitext hinter einem Ja/Nein-Feld, falls vorhanden — wird im PDF neben dem
 * Kaestchen angezeigt, damit dem Kunden der bisherige Stand nicht verlorengeht.
 */
export function checkboxDetail(value?: string): string | undefined {
  const trimmed = (value || '').trim();
  if (!trimmed) return undefined;
  const normalized = trimmed.toLowerCase();
  if (NEGATIVE_VALUES.has(normalized)) return undefined;
  if (['ja', 'yes', 'true', '1'].includes(normalized)) return undefined;
  return trimmed;
}

function isMultiline(key: string): boolean {
  return (
    key.endsWith('_notes') ||
    key.endsWith('_extras') ||
    key.endsWith('_description') ||
    key.endsWith('_details') ||
    key === 'notes' ||
    key === 'elektronikparts' ||
    key === 'headstock_logo_notes'
  );
}

export function labelForSpecKey(key: string): string {
  return FIELD_LABELS[key] || EXTRA_LABELS[key] || key.replace(/_/g, ' ');
}

function toCustomerField(key: string, required: boolean): CustomerField {
  const name = `order.${key}`;
  const label = labelForSpecKey(key);
  const extras = {
    required,
    condition: FIELD_CONDITIONS[key],
    samples: FIELD_SAMPLES[key],
  };
  if (isCheckboxField(key)) {
    return { name, label, kind: 'checkbox', ...extras };
  }
  if (isMultiline(key)) {
    return { name, label, kind: 'multiline', ...extras };
  }
  const options = AUTOFILL_OPTIONS[key];
  if (options && options.length > 0) {
    return { name, label, kind: 'choice', options, ...extras };
  }
  return { name, label, kind: 'text', ...extras };
}

/** Kontaktblock — landet beim Import als customer.*-Vorschläge. */
export function getCustomerContactSection(): CustomerSheetSection {
  return {
    title: 'Ihre Kontaktdaten',
    fields: [
      { name: 'customer.name', label: 'Name', kind: 'text', required: true },
      { name: 'customer.email', label: 'E-Mail', kind: 'text', required: true },
      { name: 'customer.phone', label: 'Telefon', kind: 'text' },
      { name: 'customer.addressLine1', label: 'Straße und Hausnummer', kind: 'text' },
      { name: 'customer.postalCode', label: 'PLZ', kind: 'text' },
      { name: 'customer.city', label: 'Ort', kind: 'text' },
    ],
  };
}

/** Spec-Abschnitte für einen Auftragstyp, in Preset-Reihenfolge. */
export function getCustomerSheetSections(orderType: string): CustomerSheetSection[] {
  const preset = SPEC_PRESETS[orderType as OrderType] || SPEC_PRESETS.GUITAR;
  const sections: CustomerSheetSection[] = [getCustomerContactSection()];

  // Manche Keys stehen in mehreren Kategorien (z. B. finish_neck bei GUITAR in
  // "Hals" und "Finish") — PDF-Feldnamen muessen eindeutig sein: erstes Vorkommen gewinnt.
  const seen = new Set<string>();
  for (const category of preset.categories) {
    const keys = (preset.fields[category as CategoryKey] || []).filter((k) => {
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    if (keys.length === 0) continue;
    const required = new Set(preset.required?.[category as CategoryKey] || []);
    sections.push({
      title: CATEGORY_LABELS[category as CategoryKey] || category,
      fields: keys.map((k) => toCustomerField(k, required.has(k))),
    });
  }

  return sections;
}

/** Klartext-Bezeichnung zu einem PDF-Formularfeldnamen (order.x / customer.x). */
export function labelForPdfField(name: string): string {
  if (name.startsWith('order.')) return labelForSpecKey(name.slice('order.'.length));
  if (name.startsWith('customer.')) {
    const key = name.slice('customer.'.length);
    const field = getCustomerContactSection().fields.find((f) => f.name === name);
    return field?.label || key;
  }
  return name;
}

export function isValidDatasheetType(type: string): boolean {
  return Object.prototype.hasOwnProperty.call(SPEC_PRESETS, type);
}
