// Einmaliges Nachziehen der Zahlungsdaten (depositPaidAt/paidAt) aus dem
// Shop-Verlauf: Für Aufträge mit WooCommerce-Bestellung liefert deren
// `date_paid` das echte Bezahldatum. Aufträge ohne Shop-Bestellung
// (Direktüberweisung außerhalb des Shops) haben keine verlässliche Quelle
// und bleiben zum manuellen Nachtragen leer.
//
//   npx tsx scripts/backfill-payment-dates.ts           → Trockenlauf
//   npx tsx scripts/backfill-payment-dates.ts --apply   → schreibt die Daten
import dotenv from 'dotenv';
// Die WC_*-Zugangsdaten liegen in .env.local (Next.js-Konvention) — plain
// dotenv lädt nur .env, deshalb beide.
dotenv.config();
dotenv.config({ path: '.env.local' });
import { prisma } from '../lib/prisma';

function sanitizeEnv(v?: string | null): string | undefined {
  if (typeof v !== 'string') return undefined;
  return v.trim().replace(/^['"]|['"]$/g, '');
}

async function fetchWooOrder(wcOrderId: string): Promise<{ datePaid: string | null; status: string } | null> {
  const base = sanitizeEnv(process.env.WC_BASE_URL);
  const key = sanitizeEnv(process.env.WC_CONSUMER_KEY);
  const secret = sanitizeEnv(process.env.WC_CONSUMER_SECRET);
  if (!base || !key || !secret) throw new Error('WC_BASE_URL/KEY/SECRET fehlen');

  const url = new URL(`${base.replace(/\/$/, '')}/wp-json/wc/v3/orders/${wcOrderId}`);
  // Query-Param-Auth wie der Fallback in lib/woocommerce.ts — funktioniert auf
  // Hosts, die den Authorization-Header blocken, und ist read-only.
  url.searchParams.set('consumer_key', key);
  url.searchParams.set('consumer_secret', secret);

  const res = await fetch(url.toString());
  if (!res.ok) return null;
  const data = await res.json();
  return { datePaid: data?.date_paid ?? null, status: String(data?.status ?? '') };
}

async function main() {
  const apply = process.argv.includes('--apply');

  const orders = await prisma.order.findMany({
    where: {
      deletedAt: null,
      paymentStatus: { in: ['deposit', 'paid'] },
      wcOrderId: { not: null },
      OR: [
        { paymentStatus: 'deposit', depositPaidAt: null },
        { paymentStatus: 'paid', paidAt: null },
      ],
    },
    select: { id: true, title: true, paymentStatus: true, wcOrderId: true, depositPaidAt: true, paidAt: true },
    orderBy: { id: 'asc' },
  });

  console.log(`${orders.length} Aufträge mit Shop-Bestellung und fehlendem Zahlungsdatum. Modus: ${apply ? 'APPLY' : 'Trockenlauf'}`);

  let filled = 0;
  for (const order of orders) {
    const woo = await fetchWooOrder(order.wcOrderId as string);
    if (!woo) {
      console.log(`${order.id} | wc:${order.wcOrderId} | Shop-Bestellung nicht abrufbar — übersprungen`);
      continue;
    }
    if (!woo.datePaid) {
      console.log(`${order.id} | wc:${order.wcOrderId} | Shop-Status "${woo.status}", kein date_paid — bleibt manuell`);
      continue;
    }

    const paidDate = new Date(woo.datePaid);
    const field = order.paymentStatus === 'deposit' ? 'depositPaidAt' : 'paidAt';
    console.log(`${order.id} | wc:${order.wcOrderId} | ${field} ← ${paidDate.toLocaleDateString('de-DE')} (${woo.datePaid}) | ${order.title.slice(0, 40)}`);

    if (apply) {
      await prisma.order.update({ where: { id: order.id }, data: { [field]: paidDate } });
    }
    filled += 1;
  }

  console.log(`${filled} von ${orders.length} befüllbar${apply ? ' — geschrieben.' : ' — noch NICHTS geschrieben (--apply zum Anwenden).'}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
