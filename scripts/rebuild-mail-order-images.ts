import 'dotenv/config';
import { prisma } from '@/lib/prisma';
import { assignMailToOrder } from '@/lib/mail/actions';

type Scope = {
  orderIds: string[];
  label: string;
};

function parseArgs() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--execute');
  const customerArg = args.find((arg) => arg.startsWith('--customer='));
  const customerName = customerArg ? customerArg.split('=').slice(1).join('=') : null;
  const limitArg = args.find((arg) => arg.startsWith('--limit-orders='));
  const limitOrders = limitArg ? Number(limitArg.split('=')[1]) : undefined;
  return { dryRun, customerName, limitOrders };
}

async function resolveScope(customerName: string | null, limitOrders?: number): Promise<Scope> {
  if (customerName) {
    const customer = await prisma.customer.findFirst({
      where: { name: { contains: customerName, mode: 'insensitive' } },
      select: { id: true, name: true },
    });
    if (!customer) {
      throw new Error(`Kunde nicht gefunden: ${customerName}`);
    }
    const orders = await prisma.order.findMany({
      where: { customerId: customer.id },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
      ...(limitOrders && Number.isFinite(limitOrders) ? { take: limitOrders } : {}),
    });
    return {
      orderIds: orders.map((o) => o.id),
      label: `Kunde "${customer.name}"`,
    };
  }

  const orders = await prisma.order.findMany({
    select: { id: true },
    orderBy: { createdAt: 'desc' },
    ...(limitOrders && Number.isFinite(limitOrders) ? { take: limitOrders } : {}),
  });
  return { orderIds: orders.map((o) => o.id), label: 'alle Aufträge' };
}

async function main() {
  const { dryRun, customerName, limitOrders } = parseArgs();
  const scope = await resolveScope(customerName, limitOrders);

  if (scope.orderIds.length === 0) {
    console.log('Keine Aufträge im Scope gefunden.');
    return;
  }

  const mailImageWhere = {
    OR: [
      { comment: { startsWith: 'Mail-Anhang:' } },
      { path: { startsWith: '/api/attachments/' } },
    ],
  } as const;

  const [totalImagesBefore, mailImagesBefore, linkedMails] = await Promise.all([
    prisma.orderImage.count({ where: { orderId: { in: scope.orderIds } } }),
    prisma.orderImage.count({
      where: {
        orderId: { in: scope.orderIds },
        ...mailImageWhere,
      },
    }),
    prisma.mail.findMany({
      where: {
        orderId: { in: scope.orderIds },
      },
      select: { id: true, orderId: true, customerId: true },
      orderBy: { date: 'asc' },
    }),
  ]);

  console.log(`Scope: ${scope.label}`);
  console.log(`Aufträge im Scope: ${scope.orderIds.length}`);
  console.log(`OrderImages gesamt (vorher): ${totalImagesBefore}`);
  console.log(`Mail-basierte OrderImages (vorher): ${mailImagesBefore}`);
  console.log(`Zugeordnete Mails im Scope: ${linkedMails.length}`);

  if (dryRun) {
    console.log('Dry-run beendet. Mit --execute wird bereinigt und neu verknüpft.');
    return;
  }

  const deleteResult = await prisma.orderImage.deleteMany({
    where: {
      orderId: { in: scope.orderIds },
      ...mailImageWhere,
    },
  });
  console.log(`Gelöschte Mail-OrderImages: ${deleteResult.count}`);

  let relinked = 0;
  let failed = 0;

  for (const mail of linkedMails) {
    if (!mail.orderId) continue;
    try {
      await assignMailToOrder(mail.id, mail.orderId, mail.customerId);
      relinked += 1;
      if (relinked % 25 === 0) {
        console.log(`... relinked ${relinked}/${linkedMails.length}`);
      }
    } catch (error) {
      failed += 1;
      console.error(`Relink fehlgeschlagen für Mail ${mail.id}:`, error);
    }
  }

  const [totalImagesAfter, mailImagesAfter] = await Promise.all([
    prisma.orderImage.count({ where: { orderId: { in: scope.orderIds } } }),
    prisma.orderImage.count({
      where: {
        orderId: { in: scope.orderIds },
        ...mailImageWhere,
      },
    }),
  ]);

  console.log('--- Ergebnis ---');
  console.log(`Relinked Mails: ${relinked}`);
  console.log(`Relink-Fehler: ${failed}`);
  console.log(`OrderImages gesamt (nachher): ${totalImagesAfter}`);
  console.log(`Mail-basierte OrderImages (nachher): ${mailImagesAfter}`);
}

main()
  .catch((error) => {
    console.error('Rebuild Script Fehler:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
