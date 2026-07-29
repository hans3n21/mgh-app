// Manueller Roundtrip-Test fuer das ausfuellbare Kunden-Datenblatt:
// 1) PDF generieren (mit Vorbelegung), 2) wie ein Kunde ausfuellen,
// 3) Felder wieder auslesen (wie die Import-Route) und vergleichen.
// 4) Je Auftragstyp pruefen, dass Sichtbarkeitslogik + Logobilder drin sind.
// Aufruf: npx tsx scripts/test-fillable-datasheet.ts <outDir>
import { promises as fs } from 'fs';
import path from 'path';
import { AnnotationFlags, PDFCheckBox, PDFDict, PDFDocument, PDFName, PDFTextField, PDFDropdown } from 'pdf-lib';
import { generateFillableDatasheet } from '../lib/pdf/fillable-datasheet';

/** Feldnamen, deren Widget als versteckt markiert ist (ohne die Label-Felder). */
function hiddenFields(doc: PDFDocument): string[] {
  return doc
    .getForm()
    .getFields()
    .filter((f) => {
      const widget = f.acroField.getWidgets()[0];
      return widget && (widget.getFlags() & AnnotationFlags.Hidden) !== 0;
    })
    .map((f) => f.getName())
    .filter((n) => !n.startsWith('mghlbl'))
    .sort();
}

function countImages(doc: PDFDocument): number {
  let images = 0;
  for (const page of doc.getPages()) {
    const xObjects = page.node.Resources()?.lookupMaybe(PDFName.of('XObject'), PDFDict);
    if (xObjects) images += xObjects.keys().length;
  }
  return images;
}

function hasDocumentJavaScript(doc: PDFDocument): boolean {
  const names = doc.catalog.lookupMaybe(PDFName.of('Names'), PDFDict);
  return Boolean(names?.get(PDFName.of('JavaScript')));
}

/**
 * Phase 5: Ankreuzkaestchen mit Freitext-Vorbelegung. In `battery_compartment`
 * steht real z. B. "Batteriefach fräsen" — das Kaestchen muss trotzdem gesetzt
 * sein und der Text darf nicht stillschweigend verschwinden.
 */
async function checkCheckboxPrefill(): Promise<number> {
  let failed = 0;
  console.log('\n--- Ankreuzkaestchen mit Freitext-Vorbelegung ---');

  const bytes = await generateFillableDatasheet({
    type: 'GUITAR',
    values: {
      'order.battery_compartment': 'Batteriefach fräsen',
      'order.spokewheel': 'Nein',
      'order.pickup_mount_direct': 'Ja',
    },
  });
  const form = (await PDFDocument.load(bytes)).getForm();

  const expect: Array<[string, boolean]> = [
    ['order.battery_compartment', true],
    ['order.spokewheel', false],
    ['order.pickup_mount_direct', true],
    ['order.pickup_mount_frame', false],
  ];
  for (const [name, checked] of expect) {
    const actual = form.getCheckBox(name).isChecked();
    console.log(`${name}: angekreuzt=${actual}`);
    if (actual !== checked) {
      console.error(`   FEHLER: erwartet ${checked}`);
      failed++;
    }
  }
  return failed;
}

/** Phase 4: pro Auftragstyp ein Muster-PDF erzeugen und die Struktur pruefen. */
async function checkAllTypes(outDir: string): Promise<number> {
  const cases: Array<{
    type: string;
    label: string;
    values?: Record<string, string>;
    expectHidden: string[];
    expectImages: boolean;
  }> = [
    {
      type: 'GUITAR',
      label: 'guitar-ohne-top',
      expectHidden: ['order.body_top', 'order.body_top_thickness', 'order.finish_body_back', 'order.finish_body_top'],
      expectImages: true,
    },
    {
      type: 'GUITAR',
      label: 'guitar-mit-top',
      values: { 'order.body_has_top': 'Ja' },
      expectHidden: ['order.body_surface_treatment', 'order.finish_body'],
      expectImages: true,
    },
    { type: 'NECK', label: 'neck', expectHidden: [], expectImages: true },
    {
      type: 'BODY',
      label: 'body',
      expectHidden: [
        'order.battery_compartment_details',
        'order.body_top',
        'order.body_top_thickness',
        'order.finish_body_back',
        'order.finish_body_top',
        'order.pickguard_material',
      ],
      expectImages: false,
    },
    { type: 'FINISH_ONLY', label: 'finish-only', expectHidden: [], expectImages: false },
  ];

  let failed = 0;
  console.log('\n--- Sichtbarkeitslogik & Logobilder je Auftragstyp ---');

  for (const c of cases) {
    const bytes = await generateFillableDatasheet({
      type: c.type,
      orderId: `ORD-TEST-${c.label.toUpperCase()}`,
      values: c.values,
    });
    const file = path.join(outDir, `datenblatt-${c.label}.pdf`);
    await fs.writeFile(file, bytes);

    const doc = await PDFDocument.load(bytes);
    const hidden = hiddenFields(doc);
    // Kopfzeilen-Logo zaehlt immer mit — Beispielbilder kommen obendrauf.
    const images = countImages(doc);
    const hasSamples = images > doc.getPageCount();

    console.log(
      `${c.label}: ${Math.round(bytes.length / 1024)} kB, ${doc.getPageCount()} Seiten, ` +
        `${doc.getForm().getFields().length} Felder, Logobilder=${hasSamples}`,
    );
    console.log(`   versteckt: ${hidden.join(', ') || '-'}`);

    const expected = [...c.expectHidden].sort();
    if (JSON.stringify(hidden) !== JSON.stringify(expected)) {
      console.error(`   FEHLER: erwartet versteckt ${JSON.stringify(expected)}`);
      failed++;
    }
    if (!hasDocumentJavaScript(doc)) {
      console.error('   FEHLER: kein Dokument-JavaScript eingebettet');
      failed++;
    }
    if (hasSamples !== c.expectImages) {
      console.error(`   FEHLER: Logobilder=${hasSamples}, erwartet ${c.expectImages}`);
      failed++;
    }
  }

  return failed;
}

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

  // Ankreuzkaestchen — muessen beim Import als "Ja" ankommen.
  form.getCheckBox('order.body_has_top').check();
  form.getCheckBox('order.pickup_mount_direct').check();

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
    else if (field instanceof PDFCheckBox) value = field.isChecked() ? 'Ja' : '';
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
    'order.body_has_top': 'Ja',
    'order.pickup_mount_direct': 'Ja',
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
  console.log(failed === 0 ? '\n✅ Roundtrip OK' : `\n❌ ${failed} Fehler im Roundtrip`);

  failed += await checkAllTypes(outDir);
  failed += await checkCheckboxPrefill();

  console.log(failed === 0 ? '\n✅ Alle Pruefungen OK' : `\n❌ ${failed} Fehler`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
