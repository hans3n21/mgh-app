// Misst, wie viel Bildmaterial als Base64 direkt in der Datenbank steckt.
// Hintergrund: der Bilder-Tab speichert hochgeladene Dateien nicht auf Platte,
// sondern als "data:image/...;base64,..."-String in OrderImage.path. Dadurch
// waechst die Tabelle mit jedem Foto, und jedes JSON-Backup schleppt sie mit.
//
// Rein lesend — nur Aggregate, keine Bildinhalte in der Ausgabe.
//
//   npx tsx scripts/measure-image-storage.ts
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type Row = {
  gesamt: bigint;
  base64: bigint;
  dateipfad: bigint;
  base64_bytes: bigint | null;
  groesstes: bigint | null;
};

async function main() {
  const [row] = await prisma.$queryRaw<Row[]>`
    SELECT
      COUNT(*)                                                 AS gesamt,
      COUNT(*) FILTER (WHERE "path" LIKE 'data:%')             AS base64,
      COUNT(*) FILTER (WHERE "path" NOT LIKE 'data:%')         AS dateipfad,
      SUM(LENGTH("path")) FILTER (WHERE "path" LIKE 'data:%')  AS base64_bytes,
      MAX(LENGTH("path")) FILTER (WHERE "path" LIKE 'data:%')  AS groesstes
    FROM "OrderImage"
  `;

  const mb = (b: bigint | null) => (b ? (Number(b) / 1024 / 1024).toFixed(1) : '0.0');

  console.log('');
  console.log('Bilder gesamt:         ', Number(row.gesamt));
  console.log('  davon Base64 in DB:  ', Number(row.base64));
  console.log('  davon Dateiverweis:  ', Number(row.dateipfad));
  console.log('Base64-Menge in der DB:', mb(row.base64_bytes), 'MB');
  console.log('groesstes Einzelbild:  ', mb(row.groesstes), 'MB');

  const [size] = await prisma.$queryRaw<{ tabelle: string }[]>`
    SELECT pg_size_pretty(pg_total_relation_size('"OrderImage"')) AS tabelle
  `;
  console.log('Tabelle OrderImage:    ', size.tabelle, '(inkl. Index und TOAST)');
  console.log('');
}

main()
  .catch((e) => {
    console.error('Fehler:', e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
