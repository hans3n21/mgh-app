// Prueft den Weg Posteingang -> Kunde -> Posteingang:
// 1) Das per Mail verschickte Datenblatt ist dasselbe wie beim Download im
//    Auftrag und traegt den Herkunftsstempel.
// 2) Ein blanko angefordertes Datenblatt wird NICHT heimlich aus dem Auftrag
//    der Mail vorbefuellt.
// 3) Das zurueckkommende PDF wird beim Reimport dem richtigen Auftrag zugeordnet.
// Aufruf: npx tsx scripts/test-datasheet-mailflow.ts <orderId>
import { PDFDocument, PDFDropdown, PDFTextField } from 'pdf-lib';
import { PrismaClient } from '@prisma/client';
import { buildDatasheetForOrder } from '../lib/pdf/datasheet-for-order';
import { isPdfLabelField, parseDatasheetSubject } from '../lib/customer-datasheet';

const prisma = new PrismaClient();

async function readBack(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  const origin = parseDatasheetSubject(doc.getSubject());
  const values: Record<string, string> = {};
  for (const field of doc.getForm().getFields()) {
    // Label-Hilfsfelder tragen immer Text — sie sind keine Kundenangabe.
    if (isPdfLabelField(field.getName())) continue;
    let value = '';
    if (field instanceof PDFTextField) value = field.getText() || '';
    else if (field instanceof PDFDropdown) value = field.getSelected().join(', ');
    value = value.trim();
    if (value) values[field.getName()] = value;
  }
  return { origin, values };
}

async function main() {
  let failed = 0;
  const check = (name: string, ok: boolean, detail?: string) => {
    console.log(`${ok ? 'PASS' : 'FEHLER'} ${name}${detail ? `: ${detail}` : ''}`);
    if (!ok) failed++;
  };

  // Einen echten Auftrag mit Specs nehmen, damit die Vorbelegung aussagekraeftig ist.
  const orderId =
    process.argv[2] ||
    (await prisma.order.findFirst({
      where: { specs: { some: {} } },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    }))?.id;

  if (!orderId) {
    console.log('Kein Auftrag mit Specs gefunden - uebersprungen.');
    return;
  }
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) {
    console.error(`Auftrag ${orderId} nicht gefunden.`);
    process.exit(1);
  }
  console.log(`Testauftrag: ${order.id} (${order.type})\n`);

  // 1) Mailanhang == Download aus dem Auftrag
  const fromOrder = await buildDatasheetForOrder({ orderId });
  const asMailAttachment = await buildDatasheetForOrder({ orderId, type: undefined });
  const a = await readBack(fromOrder.bytes);
  const b = await readBack(asMailAttachment.bytes);

  check('Dateiname enthaelt den Auftrag', fromOrder.filename.includes(orderId), fromOrder.filename);
  check('Herkunftsstempel gesetzt', a.origin.isDatasheet && a.origin.orderId === orderId, JSON.stringify(a.origin));
  check('Typ folgt dem Auftrag', a.origin.type === order.type, `${a.origin.type}`);
  check(
    'Mailanhang identisch zum Download',
    JSON.stringify(a.values) === JSON.stringify(b.values),
    `${Object.keys(a.values).length} vorbefuellte Felder`,
  );
  check('Vorbelegung nicht leer', Object.keys(a.values).length > 0);

  // 2) Blanko darf nicht vorbefuellt sein
  const blank = await buildDatasheetForOrder({ type: order.type });
  const blankRead = await readBack(blank.bytes);
  check('Blanko ohne Auftragsbezug', !blankRead.origin.orderId, JSON.stringify(blankRead.origin));
  check(
    'Blanko ohne Vorbelegung',
    Object.keys(blankRead.values).length === 0,
    `${Object.keys(blankRead.values).length} Felder gefuellt`,
  );
  check('Blanko-Dateiname ohne Auftrag', !blank.filename.includes(orderId), blank.filename);

  // 3) Reimport: Der Stempel muss den richtigen Auftrag benennen
  const returned = await PDFDocument.load(fromOrder.bytes);
  returned.getForm().getTextField('customer.phone').setText('0171 2345678');
  const returnedOrigin = parseDatasheetSubject(
    (await PDFDocument.load(await returned.save())).getSubject(),
  );
  check(
    'Rueckkommendes PDF zeigt auf denselben Auftrag',
    returnedOrigin.orderId === orderId,
    `${returnedOrigin.orderId}`,
  );

  console.log(failed === 0 ? '\n✅ Mailweg OK' : `\n❌ ${failed} Fehler`);
  process.exit(failed === 0 ? 0 : 1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
