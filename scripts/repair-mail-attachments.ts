import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { prisma } from '@/lib/prisma';
import { assignMailToOrder } from '@/lib/mail/actions';
import { deleteAttachment } from '@/lib/mail/attachments';
import { resolveFilesPath } from '@/lib/files-root';

type Args = {
  dryRun: boolean;
  customerName: string | null;
  orderId: string | null;
  runGlobal: boolean;
  cleanupUnlinked: boolean;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const customerArg = argv.find((arg) => arg.startsWith('--customer='));
  const orderArg = argv.find((arg) => arg.startsWith('--order='));
  return {
    dryRun: !argv.includes('--execute'),
    customerName: customerArg ? customerArg.split('=').slice(1).join('=') : null,
    orderId: orderArg ? orderArg.split('=').slice(1).join('=') : null,
    runGlobal: argv.includes('--global'),
    cleanupUnlinked: argv.includes('--cleanup-unlinked'),
  };
}

async function resolveOrderIds(args: Args): Promise<string[]> {
  if (args.orderId) return [args.orderId];

  if (args.customerName) {
    const customer = await prisma.customer.findFirst({
      where: { name: { contains: args.customerName, mode: 'insensitive' } },
      select: { id: true, name: true },
    });
    if (!customer) throw new Error(`Kunde nicht gefunden: ${args.customerName}`);
    const orders = await prisma.order.findMany({
      where: { customerId: customer.id },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    });
    console.log(`Scope Kunde: ${customer.name}, Aufträge: ${orders.length}`);
    return orders.map((o) => o.id);
  }

  if (args.runGlobal) {
    const orders = await prisma.order.findMany({
      select: { id: true },
    });
    console.log(`Globaler Scope: ${orders.length} Aufträge`);
    return orders.map((o) => o.id);
  }

  throw new Error('Bitte Scope setzen: --customer="Name" oder --order=ORD-... oder --global');
}

async function cleanupPersistedUnlinkedAttachments(dryRun: boolean) {
  const targets = await prisma.attachment.findMany({
    where: {
      path: { not: null },
      mail: { orderId: null },
    },
    select: { id: true, path: true },
  });

  console.log(`[cleanup] Persistierte Anhänge ohne Auftrag: ${targets.length}`);
  if (dryRun || targets.length === 0) return;

  let localDeleted = 0;
  let remoteDeleted = 0;
  let failed = 0;

  for (const att of targets) {
    const apiPath = `/api/attachments/${att.id}`;
    try {
      await prisma.orderImage.deleteMany({ where: { path: apiPath } });

      const p = att.path;
      if (p?.startsWith('local:')) {
        const rel = p.slice(6);
        const full = resolveFilesPath(rel);
        if (full && fs.existsSync(full)) {
          fs.unlinkSync(full);
          localDeleted += 1;
        }
      } else if (p?.startsWith('http://') || p?.startsWith('https://')) {
        await deleteAttachment(p);
        remoteDeleted += 1;
      }

      await prisma.attachment.update({
        where: { id: att.id },
        data: { path: null, isPersisted: false },
      });
    } catch (error) {
      failed += 1;
      console.error(`[cleanup] Failed for attachment ${att.id}:`, error);
    }
  }

  console.log(`[cleanup] local gelöscht: ${localDeleted}, remote gelöscht: ${remoteDeleted}, Fehler: ${failed}`);
}

async function main() {
  const args = parseArgs();
  const orderIds = await resolveOrderIds(args);
  if (orderIds.length === 0) {
    console.log('Keine Aufträge im Scope.');
    return;
  }

  const repairCandidates = await prisma.attachment.findMany({
    where: {
      isPersisted: false,
      path: { not: null },
      mail: { orderId: { in: orderIds } },
    },
    select: { id: true },
  });
  const candidateIds = repairCandidates.map((a) => a.id);
  console.log(`[repair] Kandidaten path!=null && isPersisted=false: ${candidateIds.length}`);

  const linkedMails = await prisma.mail.findMany({
    where: { orderId: { in: orderIds } },
    select: { id: true, orderId: true, customerId: true },
    orderBy: { date: 'asc' },
  });
  console.log(`[relink] Zugeordnete Mails im Scope: ${linkedMails.length}`);

  if (args.dryRun) {
    console.log('Dry-run aktiv. Mit --execute wird ausgeführt.');
    if (args.cleanupUnlinked) {
      await cleanupPersistedUnlinkedAttachments(true);
    }
    return;
  }

  if (candidateIds.length > 0) {
    const updateResult = await prisma.attachment.updateMany({
      where: { id: { in: candidateIds } },
      data: { isPersisted: true },
    });
    console.log(`[repair] isPersisted auf true gesetzt: ${updateResult.count}`);
  }

  let relinked = 0;
  let failed = 0;
  for (const mail of linkedMails) {
    if (!mail.orderId) continue;
    try {
      await assignMailToOrder(mail.id, mail.orderId, mail.customerId);
      relinked += 1;
      if (relinked % 25 === 0) {
        console.log(`[relink] ... ${relinked}/${linkedMails.length}`);
      }
    } catch (error) {
      failed += 1;
      console.error(`[relink] Failed for mail ${mail.id}:`, error);
    }
  }
  console.log(`[relink] abgeschlossen: ${relinked}, Fehler: ${failed}`);

  if (args.cleanupUnlinked) {
    await cleanupPersistedUnlinkedAttachments(false);
  }
}

main()
  .catch((error) => {
    console.error('repair-mail-attachments Fehler:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
