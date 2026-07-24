// Einmalige Migration (2026-07): Bei Aufträgen mit Top wird das Body-Finish in
// "Body-Finish (Top)" / "Body-Finish (Korpus)" aufgeteilt. Das alte Gesamt-Finish
// (finish_body + gespiegeltes body_surface_treatment) wird gemäß der unten
// bestätigten Zuordnung auf finish_body_top / finish_body_back verteilt.
// Aufruf: npx tsx scripts/migrate-top-finish.ts [--apply]
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');

// Vom Betreiber bestätigte Zuordnung (Chat 2026-07-24).
const MAPPING: Record<string, { top: string; back: string }> = {
  'ORD-2026-046': { top: 'Stained Purple', back: '' },
  'ORD-2026-044': { top: 'Blood Coal Burst High Gloss', back: '' },
  'ORD-2026-059': { top: 'Blue Burst - High Gloss', back: '' },
  'ORD-2025-017': { top: 'Matte Black', back: 'Natural (lackiert)' },
  'ORD-2025-012': { top: 'Lackiert', back: 'Oil/Wax' },
  'ORD-2026-023': { top: 'Dark Blue Burst (Oil/Wax)', back: 'Mahagoni Natural Rostbraun (Oil/Wax)' },
  'ORD-2026-033': { top: 'Grob geschliffen', back: 'Grob geschliffen' },
};

async function main() {
  for (const [orderId, { top, back }] of Object.entries(MAPPING)) {
    const specs = await prisma.orderSpecKV.findMany({
      where: { orderId, key: { in: ['finish_body', 'body_surface_treatment', 'finish_body_top', 'finish_body_back'] } },
      select: { id: true, key: true, value: true },
    });
    if (specs.length === 0) {
      console.log(`Order ${orderId}: keine Finish-Specs gefunden, übersprungen`);
      continue;
    }
    const hasNew = specs.some((s) => (s.key === 'finish_body_top' || s.key === 'finish_body_back') && s.value.trim());
    if (hasNew) {
      console.log(`Order ${orderId}: neue Felder bereits gepflegt, übersprungen`);
      continue;
    }
    console.log(`Order ${orderId}: Top="${top}"${back ? ` Korpus="${back}"` : ''} (ersetzt ${specs.map((s) => `${s.key}="${s.value}"`).join(', ')})`);

    if (apply) {
      await prisma.$transaction(async (tx) => {
        await tx.orderSpecKV.deleteMany({
          where: { orderId, key: { in: ['finish_body', 'body_surface_treatment', 'finish_body_top', 'finish_body_back'] } },
        });
        await tx.orderSpecKV.create({ data: { orderId, key: 'finish_body_top', value: top } });
        if (back) {
          await tx.orderSpecKV.create({ data: { orderId, key: 'finish_body_back', value: back } });
        }
      });
    }
  }
  console.log(apply ? 'Migration angewendet.' : 'Dry-Run beendet (--apply zum Ausführen).');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
