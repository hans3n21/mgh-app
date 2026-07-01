import 'dotenv/config';
import { prisma } from '@/lib/prisma';
import { assignMailToOrder } from '@/lib/mail/actions';

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.split('=')[1]) : undefined;

  const linkedMails = await prisma.mail.findMany({
    where: { orderId: { not: null } },
    select: { id: true, orderId: true, customerId: true, date: true },
    orderBy: { date: 'asc' },
    ...(limit && Number.isFinite(limit) ? { take: limit } : {}),
  });

  console.log(`Relink start: ${linkedMails.length} zugeordnete Mail(s)${dryRun ? ' (dry-run)' : ''}`);

  if (dryRun) {
    const unlinkedCountBefore = await prisma.mail.count({ where: { orderId: null } });
    console.log(`Unzugeordnete Mails aktuell: ${unlinkedCountBefore}`);
    await prisma.$disconnect();
    return;
  }

  let processed = 0;
  let failed = 0;

  for (const mail of linkedMails) {
    if (!mail.orderId) continue;
    try {
      await assignMailToOrder(mail.id, mail.orderId, mail.customerId);
      processed += 1;
      if (processed % 25 === 0) {
        console.log(`... ${processed}/${linkedMails.length} verarbeitet`);
      }
    } catch (error) {
      failed += 1;
      console.error(`Relink fehlgeschlagen für Mail ${mail.id}:`, error);
    }
  }

  const stillUnlinked = await prisma.mail.count({ where: { orderId: null } });
  console.log(`Relink fertig. Verarbeitet: ${processed}, Fehler: ${failed}, unzugeordnet: ${stillUnlinked}`);

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error('Relink Script Fehler:', error);
  await prisma.$disconnect();
  process.exit(1);
});

