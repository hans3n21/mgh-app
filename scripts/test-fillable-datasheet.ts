// Manueller Roundtrip-Test fuer das ausfuellbare Kunden-Datenblatt:
// 1) PDF generieren (mit Vorbelegung), 2) wie ein Kunde ausfuellen,
// 3) Felder wieder auslesen (wie die Import-Route) und vergleichen.
// Aufruf: npx tsx scripts/test-fillable-datasheet.ts <outDir>
import { promises as fs } from 'fs';
import path from 'path';
import { PDFDocument, PDFTextField, PDFDropdown } from 'pdf-lib';
import { generateFillableDatasheet } from '../lib/pdf/fillable-datasheet';

async function main() {
  const outDir = process.argv[2] || '.';
  await fs.mkdir(outDir, { recursive: true });

  // 1) Generieren — GUITAR mit Vorbelegung (inkl. Wert, der NICHT in den Vorgaben steht)
  const bytes = await generateFillableDatasheet({
    type: 'GUITAR',
    orderId: 'ORD-TEST-001',
    orderTitle: 'Test-Gitarre für Röundtrip äöüß',
    values: {
      'customer.name': 'Max Mustermann',
      'customer.email': 'max@example.com',
      'order.body_shape': 'Headless Bariton (Strandberg-Style)', // custom, nicht in Optionen
      'order.fretboard_scale': '648 mm / 25.5" (Fender)', // in Optionen
    },
  });
  const blankPath = path.join(outDir, 'datenblatt-guitar.pdf');
  await fs.writeFile(blankPath, bytes);
  console.log('Generiert:', blankPath, `(${bytes.length} bytes)`);

  // 2) "Kunde" fuellt aus
  const doc = await PDFDocument.load(bytes);
  const form = doc.getForm();
  console.log('Formularfelder gesamt:', form.getFields().length);

  const scale = form.getDropdown('order.fretboard_scale');
  console.log('Mensur-Vorgaben:', scale.getOptions().length, 'Optionen, editierbar:', scale.isEditable());

  (form.getField('order.body_material') as PDFDropdown).select('Erle');
  (form.getField('order.string_count') as PDFDropdown).select('7');
  const notes = form.getTextField('order.notes');
  notes.setText('Bitte Hardcase dazu – Übergabe persönlich (äöüß).');
  form.getTextField('customer.phone').setText('0171 2345678');

  // Custom-Wert in editierbarem Dropdown (wie ein Viewer, der /V direkt schreibt)
  const tuners = form.getDropdown('order.tuners');
  tuners.setOptions([...tuners.getOptions(), 'Kluson Vintage 6L custom']);
  tuners.select('Kluson Vintage 6L custom');

  const filled = await doc.save();
  const filledPath = path.join(outDir, 'datenblatt-guitar-ausgefuellt.pdf');
  await fs.writeFile(filledPath, filled);
  console.log('Ausgefuellt gespeichert:', filledPath);

  // 3) Wieder einlesen (Import-Logik)
  const doc2 = await PDFDocument.load(filled);
  const extracted: Record<string, string> = {};
  for (const field of doc2.getForm().getFields()) {
    let value = '';
    if (field instanceof PDFTextField) value = field.getText() || '';
    else if (field instanceof PDFDropdown) value = field.getSelected().join(', ');
    value = value.trim();
    if (value) extracted[field.getName()] = value;
  }
  console.log('\nExtrahierte Werte:');
  console.log(JSON.stringify(extracted, null, 2));

  const expect: Record<string, string> = {
    'customer.name': 'Max Mustermann',
    'customer.phone': '0171 2345678',
    'order.body_shape': 'Headless Bariton (Strandberg-Style)',
    'order.body_material': 'Erle',
    'order.string_count': '7',
    'order.tuners': 'Kluson Vintage 6L custom',
    'order.fretboard_scale': '648 mm / 25.5" (Fender)',
  };
  let failed = 0;
  for (const [k, v] of Object.entries(expect)) {
    if (extracted[k] !== v) {
      console.error(`FEHLER: ${k} = ${JSON.stringify(extracted[k])}, erwartet ${JSON.stringify(v)}`);
      failed++;
    }
  }
  if (!extracted['order.notes']?.includes('Hardcase')) {
    console.error('FEHLER: order.notes fehlt/falsch:', extracted['order.notes']);
    failed++;
  }
  console.log(failed === 0 ? '\n✅ Roundtrip OK' : `\n❌ ${failed} Fehler`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
