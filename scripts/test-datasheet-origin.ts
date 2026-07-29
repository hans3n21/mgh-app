// Prueft den Herkunfts-Abgleich des PDF-Imports: Ein Datenblatt traegt seinen
// Ursprungsauftrag in den Dokument-Metadaten. Der Import muss erkennen, wenn es
// aus einem anderen Auftrag oder Auftragstyp stammt — und wenn es gar nicht aus
// dieser App kommt.
// Aufruf: npx tsx scripts/test-datasheet-origin.ts
import { PDFDocument, PDFDropdown, PDFTextField } from 'pdf-lib';
import { generateFillableDatasheet } from '../lib/pdf/fillable-datasheet';
import {
  isPdfLabelField,
  labelForPdfField,
  parseDatasheetSubject,
  type DatasheetOrigin,
} from '../lib/customer-datasheet';
import { getCategoriesForOrderType, getFieldsForCategory } from '../lib/order-presets';

/** Spiegelt die Warn-Logik der Import-Route. */
function warnCodes(
  probe: { origin: DatasheetOrigin; hasDatasheetFields: boolean },
  targetOrderId: string,
  targetType: string,
): string[] {
  const { origin, hasDatasheetFields } = probe;
  if (!origin.isDatasheet && !hasDatasheetFields) return ['unknown_origin'];
  const codes: string[] = [];
  if (origin.orderId && origin.orderId !== targetOrderId) codes.push('other_order');
  if (origin.type && origin.type !== targetType) codes.push('other_type');
  return codes;
}

async function originOf(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  const fields = doc.getForm().getFields();
  return {
    origin: parseDatasheetSubject(doc.getSubject()),
    hasDatasheetFields: fields.some((f) => {
      const n = f.getName();
      return n.startsWith('order.') || n.startsWith('customer.') || isPdfLabelField(n);
    }),
  };
}

/** Speichern in Acrobat = laden + neu schreiben. Metadaten muessen das ueberleben. */
async function roundtrip(bytes: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes);
  doc.getForm().getTextField('customer.phone').setText('0171 2345678');
  return doc.save();
}

/**
 * Zweiter Teil des Schutzes: Was beim Import in einen Auftrag anderen Typs
 * wegfaellt, muss namentlich benannt werden — nicht nur als Zahl.
 */
async function checkIgnoredFieldLabels(): Promise<number> {
  console.log('\n--- Verworfene Felder benennen ---');
  let failed = 0;

  // Gitarren-Datenblatt, ausgefuellt, soll in einen Hals-Auftrag importiert werden.
  const bytes = await generateFillableDatasheet({
    type: 'GUITAR',
    orderId: 'ORD-2026-023',
    values: {
      'order.body_shape': 'MGH Evil',
      'order.body_material': 'Erle',
      'order.neck_wood': 'Roasted Maple',
      'customer.name': 'Max Mustermann',
    },
  });

  const allowed = new Set<string>();
  for (const category of getCategoriesForOrderType('NECK')) {
    getFieldsForCategory('NECK', category).forEach((k) => allowed.add(k));
  }

  const ignored: Array<{ label: string; value: string }> = [];
  const accepted: string[] = [];
  for (const field of (await PDFDocument.load(bytes)).getForm().getFields()) {
    const name = field.getName();
    if (isPdfLabelField(name)) continue;
    // Wie die Import-Route: Text- und Auswahlfelder liefern beide Werte.
    let value = '';
    if (field instanceof PDFTextField) value = field.getText() || '';
    else if (field instanceof PDFDropdown) value = field.getSelected().join(', ');
    value = value.trim();
    if (!value) continue;
    if (name.startsWith('order.') && !allowed.has(name.slice('order.'.length))) {
      ignored.push({ label: labelForPdfField(name), value });
    } else {
      accepted.push(name);
    }
  }

  console.log(`verworfen: ${ignored.map((i) => `${i.label}="${i.value}"`).join(', ') || '-'}`);
  console.log(`uebernommen: ${accepted.join(', ') || '-'}`);

  // Bodyform gehoert nicht in einen Hals-Auftrag und muss benannt werden.
  const bodyShape = ignored.find((i) => i.value === 'MGH Evil');
  if (!bodyShape) {
    console.error('FEHLER: Bodyform haette verworfen und benannt werden muessen');
    failed++;
  } else if (bodyShape.label !== 'Bodyform') {
    console.error(`FEHLER: Bezeichnung "${bodyShape.label}", erwartet "Bodyform"`);
    failed++;
  }
  // Kundendaten und Hals-Felder gehoeren durch.
  for (const name of ['customer.name', 'order.neck_wood']) {
    if (!accepted.includes(name)) {
      console.error(`FEHLER: ${name} haette uebernommen werden muessen`);
      failed++;
    }
  }
  // Kein Feld darf mit dem internen Praefix auftauchen.
  if (ignored.some((i) => i.label.startsWith('mghlbl'))) {
    console.error('FEHLER: interne Label-Hilfsfelder tauchen in der Liste auf');
    failed++;
  }
  return failed;
}

async function main() {
  let failed = 0;
  const check = (name: string, actual: string[], expected: string[]) => {
    const ok = JSON.stringify(actual.sort()) === JSON.stringify([...expected].sort());
    console.log(`${ok ? 'PASS' : 'FEHLER'} ${name}: [${actual.join(', ') || '-'}]`);
    if (!ok) {
      console.error(`   erwartet: [${expected.join(', ') || '-'}]`);
      failed++;
    }
  };

  const guitarSheet = await generateFillableDatasheet({ type: 'GUITAR', orderId: 'ORD-2026-023' });

  // 1) Richtiger Auftrag, richtiger Typ -> keine Warnung
  check('passendes Datenblatt', warnCodes(await originOf(guitarSheet), 'ORD-2026-023', 'GUITAR'), []);

  // 2) Gleiches PDF in einen fremden Auftrag
  check('fremder Auftrag', warnCodes(await originOf(guitarSheet), 'ORD-2026-031', 'GUITAR'), ['other_order']);

  // 3) Gleiches PDF in einen Auftrag anderen Typs
  check('falscher Auftragstyp', warnCodes(await originOf(guitarSheet), 'ORD-2026-023', 'NECK'), ['other_type']);

  // 4) Beides falsch
  check('fremder Auftrag + Typ', warnCodes(await originOf(guitarSheet), 'ORD-9999-999', 'BODY'), [
    'other_order',
    'other_type',
  ]);

  // 5) Blanko-Datenblatt (ohne Auftrag) darf ueberall rein, solange der Typ passt
  const blank = await generateFillableDatasheet({ type: 'GUITAR' });
  check('Blanko, Typ passt', warnCodes(await originOf(blank), 'ORD-2026-023', 'GUITAR'), []);
  check('Blanko, Typ passt nicht', warnCodes(await originOf(blank), 'ORD-2026-023', 'NECK'), ['other_type']);

  // 6) Metadaten muessen ein Speichern im PDF-Viewer ueberleben
  const resaved = await originOf(await roundtrip(guitarSheet));
  check('nach Speichern im Viewer', warnCodes(resaved, 'ORD-2026-031', 'GUITAR'), ['other_order']);

  // 7) Fremdes PDF ohne Herkunftsstempel und ohne unsere Felder
  const foreign = await PDFDocument.create();
  foreign.addPage();
  foreign.setSubject('Irgendein anderes Dokument');
  check('fremdes PDF', warnCodes(await originOf(await foreign.save()), 'ORD-2026-023', 'GUITAR'), [
    'unknown_origin',
  ]);

  // 8) Unser Datenblatt, aber ein PDF-Programm hat die Metadaten ueberschrieben.
  //    Die Formularfelder verraten die Herkunft — es darf keine Warnung geben,
  //    sonst blockiert jede Rueckmeldung des Kunden hinter einer Rueckfrage.
  const strippedDoc = await PDFDocument.load(guitarSheet);
  strippedDoc.setSubject('Adobe Acrobat hat hier etwas anderes reingeschrieben');
  const stripped = await originOf(await strippedDoc.save());
  check('Metadaten ueberschrieben, Felder erhalten', warnCodes(stripped, 'ORD-2026-023', 'GUITAR'), []);
  check('Metadaten ueberschrieben, fremder Auftrag', warnCodes(stripped, 'ORD-2026-031', 'GUITAR'), []);

  failed += await checkIgnoredFieldLabels();

  console.log(failed === 0 ? '\n✅ Herkunftspruefung OK' : `\n❌ ${failed} Fehler`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
