import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

const mails = await p.mail.findMany({ where: { toEmail: null }, select: { id: true, to: true } });
let updated = 0;
for (const m of mails) {
  try {
    const toArr = typeof m.to === 'string' ? JSON.parse(m.to) : (Array.isArray(m.to) ? m.to : []);
    if (toArr.length > 0) {
      await p.mail.update({ where: { id: m.id }, data: { toEmail: toArr[0] } });
      updated++;
    }
  } catch {}
}
console.log(`Updated ${updated} of ${mails.length} mails with toEmail`);
await p.$disconnect();
