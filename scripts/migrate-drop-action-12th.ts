// Einmalige Migration (2026-07): Das Feld "Saitenlage 12. Bund" (action_12th)
// entfaellt. Vorhandene Werte werden als Freitext-Info an die Hals-Extras
// (neck_extras) angehaengt, danach wird die action_12th-Zeile geloescht.
// Aufruf: npx tsx scripts/migrate-drop-action-12th.ts [--apply]
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');

const OLD_KEY = 'action_12th';
const TARGET_KEY = 'neck_extras';
const LABEL = 'Saitenlage 12. Bund';

async function main() {
  const rows = await prisma.orderSpecKV.findMany({
    where: { key: OLD_KEY },
    select: { id: true, orderId: true, value: true },
    orderBy: { orderId: 'asc' },
  });

  if (rows.length === 0) {
    console.log(`Keine ${OLD_KEY}-Eintraege gefunden - nichts zu tun.`);
    return;
  }

  // Backup der zu loeschenden Zeilen, falls doch etwas zurueckgeholt werden muss.
  console.log('Backup der betroffenen Zeilen:');
  console.log(JSON.stringify(rows, null, 2));
  console.log('');

  for (const row of rows) {
    const value = (row.value || '').trim();
    const extras = await prisma.orderSpecKV.findFirst({
      where: { orderId: row.orderId, key: TARGET_KEY },
      select: { id: true, value: true },
    });
    const info = `${LABEL}: ${value}`;
    const current = (extras?.value || '').trim();

    // Wert leer oder schon uebernommen -> nur loeschen.
    const alreadyThere = current.includes(LABEL);
    const nextValue = !value || alreadyThere
      ? current
      : current
        ? `${current}, ${info}`
        : info;

    if (!value) {
      console.log(`${row.orderId}: leerer Wert, wird nur geloescht`);
    } else if (alreadyThere) {
      console.log(`${row.orderId}: "${LABEL}" steht bereits in ${TARGET_KEY}, wird nur geloescht`);
    } else {
      console.log(`${row.orderId}: ${TARGET_KEY} "${current}" -> "${nextValue}"`);
    }

    if (!apply) continue;

    await prisma.$transaction(async (tx) => {
      if (nextValue !== current) {
        if (extras) {
          await tx.orderSpecKV.update({ where: { id: extras.id }, data: { value: nextValue } });
        } else {
          await tx.orderSpecKV.create({ data: { orderId: row.orderId, key: TARGET_KEY, value: nextValue } });
        }
      }
      await tx.orderSpecKV.delete({ where: { id: row.id } });
    });
  }

  // Offene Datenblatt-Vorschlaege auf das entfallene Feld sind wertlos.
  const staleSuggestions = await prisma.orderFieldSuggestion.count({
    where: { field: `order.${OLD_KEY}` },
  });
  if (staleSuggestions > 0) {
    console.log(`\n${staleSuggestions} Vorschlaege auf order.${OLD_KEY} werden entfernt`);
    if (apply) {
      await prisma.orderFieldSuggestion.deleteMany({ where: { field: `order.${OLD_KEY}` } });
    }
  }

  console.log(apply ? '\nMigration angewendet.' : '\nDry-Run beendet (--apply zum Ausfuehren).');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
