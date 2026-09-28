// Einmalige Migration (2026-09): Beim Auftragstyp Pickguard entfallen die
// Felder "Dicke" (pg_thickness) und "Farbe/Finish" (pg_color_finish).
// "Farbe/Finish" wird durch die Checkbox "Custom Finish" mit Detailangabe
// ersetzt: vorhandene Werte wandern nach pg_custom_finish_details und setzen
// die Checkbox auf "Ja". "Dicke" hat keinen Nachfolger, der Wert wird als
// Freitext an die Notizen (pg_notes) angehaengt.
// Aufruf: npx tsx scripts/migrate-drop-pickguard-fields.ts [--apply]
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');

const CUSTOM_FINISH_KEY = 'pg_custom_finish';
const CUSTOM_FINISH_DETAILS_KEY = 'pg_custom_finish_details';
const NOTES_KEY = 'pg_notes';

const OLD_KEYS = ['pg_thickness', 'pg_color_finish'] as const;
const LABELS: Record<string, string> = {
  pg_thickness: 'Dicke',
  pg_color_finish: 'Farbe/Finish',
};

/** Wert an ein Freitextfeld anhaengen, ohne bestehende Angaben zu verlieren. */
async function appendToSpec(orderId: string, key: string, addition: string) {
  const existing = await prisma.orderSpecKV.findFirst({
    where: { orderId, key },
    select: { id: true, value: true },
  });
  const current = (existing?.value || '').trim();
  if (current.includes(addition)) return { current, next: current, existing };
  const next = current ? `${current}\n${addition}` : addition;
  return { current, next, existing };
}

async function main() {
  const rows = await prisma.orderSpecKV.findMany({
    where: { key: { in: [...OLD_KEYS] } },
    select: { id: true, orderId: true, key: true, value: true },
    orderBy: [{ key: 'asc' }, { orderId: 'asc' }],
  });

  if (rows.length === 0) {
    console.log(`Keine ${OLD_KEYS.join('/')}-Eintraege gefunden - nichts zu retten.`);
  } else {
    // Backup der zu loeschenden Zeilen, falls doch etwas zurueckgeholt werden muss.
    console.log('Backup der betroffenen Zeilen:');
    console.log(JSON.stringify(rows, null, 2));
    console.log('');
  }

  for (const row of rows) {
    const value = (row.value || '').trim();

    if (!value) {
      console.log(`${row.orderId} / ${row.key}: leerer Wert, wird nur geloescht`);
      if (apply) await prisma.orderSpecKV.delete({ where: { id: row.id } });
      continue;
    }

    if (row.key === 'pg_color_finish') {
      // Farbe/Finish war immer ein Custom-Wunsch -> Checkbox setzen + Detail.
      const detail = await appendToSpec(row.orderId, CUSTOM_FINISH_DETAILS_KEY, value);
      console.log(
        `${row.orderId} / ${row.key}: "${value}" -> ${CUSTOM_FINISH_KEY}=Ja, ` +
          `${CUSTOM_FINISH_DETAILS_KEY} "${detail.current}" -> "${detail.next}"`,
      );
      if (!apply) continue;

      await prisma.$transaction(async (tx) => {
        if (detail.next !== detail.current) {
          if (detail.existing) {
            await tx.orderSpecKV.update({ where: { id: detail.existing.id }, data: { value: detail.next } });
          } else {
            await tx.orderSpecKV.create({
              data: { orderId: row.orderId, key: CUSTOM_FINISH_DETAILS_KEY, value: detail.next },
            });
          }
        }
        const checkbox = await tx.orderSpecKV.findFirst({
          where: { orderId: row.orderId, key: CUSTOM_FINISH_KEY },
          select: { id: true },
        });
        if (checkbox) {
          await tx.orderSpecKV.update({ where: { id: checkbox.id }, data: { value: 'Ja' } });
        } else {
          await tx.orderSpecKV.create({ data: { orderId: row.orderId, key: CUSTOM_FINISH_KEY, value: 'Ja' } });
        }
        await tx.orderSpecKV.delete({ where: { id: row.id } });
      });
      continue;
    }

    // pg_thickness: kein Nachfolgerfeld -> als Freitext in die Notizen.
    const info = `${LABELS[row.key]}: ${value}`;
    const notes = await appendToSpec(row.orderId, NOTES_KEY, info);
    console.log(`${row.orderId} / ${row.key}: ${NOTES_KEY} "${notes.current}" -> "${notes.next}"`);
    if (!apply) continue;

    await prisma.$transaction(async (tx) => {
      if (notes.next !== notes.current) {
        if (notes.existing) {
          await tx.orderSpecKV.update({ where: { id: notes.existing.id }, data: { value: notes.next } });
        } else {
          await tx.orderSpecKV.create({ data: { orderId: row.orderId, key: NOTES_KEY, value: notes.next } });
        }
      }
      await tx.orderSpecKV.delete({ where: { id: row.id } });
    });
  }

  // Offene Datenblatt-Vorschlaege auf die entfallenen Felder sind wertlos.
  const staleFields = OLD_KEYS.map((k) => `order.${k}`);
  const staleSuggestions = await prisma.orderFieldSuggestion.count({
    where: { field: { in: staleFields } },
  });
  if (staleSuggestions > 0) {
    console.log(`\n${staleSuggestions} Vorschlaege auf ${staleFields.join('/')} werden entfernt`);
    if (apply) {
      await prisma.orderFieldSuggestion.deleteMany({ where: { field: { in: staleFields } } });
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
