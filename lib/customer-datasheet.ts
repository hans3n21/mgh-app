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

export type CustomerFieldKind = 'text' | 'choice' | 'multiline';

export type CustomerField = {
  /** PDF-Formularfeldname, z. B. "order.body_shape" oder "customer.name" */
  name: string;
  label: string;
  kind: CustomerFieldKind;
  options?: string[];
  required?: boolean;
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

// Checkbox-artige Felder: im PDF als Ja/Nein-Auswahl.
const JA_NEIN_FIELDS = new Set<string>([
  'pickguard_checkbox',
  'battery_compartment_checkbox',
]);

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
  if (JA_NEIN_FIELDS.has(key)) {
    return { name, label, kind: 'choice', options: ['Ja', 'Nein'], required };
  }
  if (isMultiline(key)) {
    return { name, label, kind: 'multiline', required };
  }
  const options = AUTOFILL_OPTIONS[key];
  if (options && options.length > 0) {
    return { name, label, kind: 'choice', options, required };
  }
  return { name, label, kind: 'text', required };
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

export function isValidDatasheetType(type: string): boolean {
  return Object.prototype.hasOwnProperty.call(SPEC_PRESETS, type);
}
