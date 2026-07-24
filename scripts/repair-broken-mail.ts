import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function canReadMail(id: string) {
  try {
    await prisma.mail.findUnique({ where: { id } });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  console.log('🔎 Scanning mails for unreadable records...');

  const ids = await prisma.mail.findMany({
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`   Total mails: ${ids.length}`);

  let brokenId: string | null = null;
  for (const row of ids) {
    const ok = await canReadMail(row.id);
    if (!ok) {
      brokenId = row.id;
      break;
    }
  }

  if (!brokenId) {
    console.log('✅ No unreadable mail record found.');
    return;
  }

  console.log(`❌ Found unreadable mail id: ${brokenId}`);

  const probes: Array<{ name: string; select: Record<string, boolean> }> = [
    { name: 'messageId', select: { id: true, messageId: true } },
    { name: 'subject', select: { id: true, subject: true } },
    { name: 'fromEmail', select: { id: true, fromEmail: true } },
    { name: 'fromName', select: { id: true, fromName: true } },
    { name: 'toEmail', select: { id: true, toEmail: true } },
    { name: 'toName', select: { id: true, toName: true } },
    { name: 'snippet', select: { id: true, snippet: true } },
    { name: 'text', select: { id: true, text: true } },
    { name: 'html', select: { id: true, html: true } },
    { name: 'inReplyTo', select: { id: true, inReplyTo: true } },
    { name: 'to', select: { id: true, to: true } },
    { name: 'cc', select: { id: true, cc: true } },
    { name: 'bcc', select: { id: true, bcc: true } },
    { name: 'references', select: { id: true, references: true } },
  ];

  const badFields: string[] = [];
  for (const probe of probes) {
    try {
      await prisma.mail.findUnique({ where: { id: brokenId }, select: probe.select as any });
    } catch {
      badFields.push(probe.name);
    }
  }

  if (badFields.length > 0) {
    console.log(`   Suspect fields: ${badFields.join(', ')}`);
  } else {
    console.log('   Could not isolate a single field, applying broad sanitation.');
  }

  const fallbackFromEmail = `repair+${brokenId.slice(0, 8)}@local.invalid`;
  const fallbackMessageId = `<repaired-${brokenId.slice(0, 12)}@local.invalid>`;

  await prisma.$executeRaw`
    UPDATE "Mail"
    SET
      "subject" = '[Repaired] Malformed mail content removed',
      "fromEmail" = COALESCE(NULLIF("fromEmail", ''), ${fallbackFromEmail}),
      "fromName" = NULL,
      "toEmail" = NULL,
      "toName" = NULL,
      "to" = '[]'::jsonb,
      "cc" = NULL,
      "bcc" = NULL,
      "text" = NULL,
      "html" = NULL,
      "snippet" = '[Repaired malformed content]',
      "inReplyTo" = NULL,
      "references" = '[]'::jsonb,
      "messageId" = COALESCE(NULLIF("messageId", ''), ${fallbackMessageId})
    WHERE "id" = ${brokenId}
  `;

  const repaired = await canReadMail(brokenId);
  if (!repaired) {
    throw new Error(`Mail ${brokenId} is still unreadable after sanitation`);
  }

  console.log(`✅ Repaired unreadable mail: ${brokenId}`);
}

main()
  .catch((err) => {
    console.error('❌ repair-broken-mail failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

