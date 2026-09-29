import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getPlaintext } from '@/lib/mail/extraction';
import { stripQuotedContent } from '@/lib/mail/stripQuotedContent';
import { orderFields, sourceHash } from '@/lib/mail-training/review';
import type { Snapshot } from './contracts';

export class TrainingError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
const select = { id: true, date: true, text: true, html: true, senderId: true, fromEmail: true,
  accountId: true, customerId: true, orderId: true, threadId: true, messageId: true, inReplyTo: true,
  isDeleted: true, account: { select: { email: true } }, order: { select: { type: true, deletedAt: true } } } as const;
type MailRow = Prisma.MailGetPayload<{ select: typeof select }>;
export function freshText(mail: { text: string | null; html: string | null }) {
  return stripQuotedContent(getPlaintext(mail.text, mail.html)).freshContent.trim();
}
export function freezeContext(current: MailRow, previous: MailRow[]): Snapshot {
  const eligible = previous.filter(m => !m.isDeleted && m.accountId === current.accountId && m.id !== current.id && m.date < current.date &&
    (!m.orderId || m.orderId === current.orderId));
  const recent = eligible.sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 11);
  const parent = eligible.find(m => m.messageId === current.inReplyTo);
  if (parent && !recent.some(m => m.id === parent.id)) recent.splice(10, 1, parent);
  const rows = [...recent.sort((a, b) => a.date.getTime() - b.date.getTime()), current];
  const messages: Snapshot['messages'] = rows.map(m => ({ id: m.id, date: m.date.toISOString(),
    role: m.senderId || m.fromEmail?.toLowerCase() === m.account.email.toLowerCase() ? 'staff' : m.fromEmail ? 'customer' : 'unknown', text: freshText(m) }));
  if (messages.some(m => m.text.length > 8000) || messages.reduce((n, m) => n + m.text.length, 0) > 24000)
    throw new TrainingError('Dieser Gesprächsausschnitt ist zu lang (max. 8.000 Zeichen je Mail / 24.000 gesamt).', 422);
  if (!messages.at(-1)?.text) throw new TrainingError('Kein aktueller Mailtext vorhanden.', 422);
  return { currentId: current.id, orderType: current.order!.type, fields: orderFields(current.order!.type), messages,
    omitted: Math.max(0, eligible.length - recent.length) };
}
export async function loadContext(id: string, client: Prisma.TransactionClient = prisma) {
  const current = await client.mail.findUnique({ where: { id }, select });
  if (!current || current.isDeleted) throw new TrainingError('Mail nicht gefunden.', 404);
  if (!current.order || current.order.deletedAt) throw new TrainingError('Bitte einen aktiven Auftrag zuordnen.');
  const branches: Prisma.MailWhereInput[] = [{ orderId: current.orderId }];
  if (current.threadId) branches.push({ threadId: current.threadId });
  if (current.inReplyTo) branches.push({ messageId: current.inReplyTo });
  const previous = await client.mail.findMany({ where: { accountId: current.accountId, isDeleted: false,
    date: { lt: current.date }, AND: [{ OR: branches }, { OR: [{ orderId: current.orderId }, { orderId: null }] }] },
    select, orderBy: [{ date: 'desc' }, { id: 'asc' }], take: 101 });
  // Include a direct parent even if it is older than the most recent 101 messages.
  if (current.inReplyTo && !previous.some(m => m.messageId === current.inReplyTo)) {
    const parent = await client.mail.findFirst({ where: { accountId: current.accountId, messageId: current.inReplyTo, isDeleted: false,
      date: { lt: current.date }, OR: [{ orderId: current.orderId }, { orderId: null }] }, select });
    if (parent) previous.push(parent);
  }
  const snapshot = freezeContext(current, previous);
  const keys = [current.orderId && `order:${current.orderId}`, current.threadId && `thread:${current.threadId}`,
    current.customerId && `customer:${current.customerId}`,
    snapshot.messages.at(-1)?.role === 'customer' && current.fromEmail && `email:${current.fromEmail.trim().toLowerCase()}`]
    .filter((v): v is string => !!v).map(sourceHash);
  const plaintext = getPlaintext(current.text, current.html);
  return { snapshot, groupKeys: keys, accountId: current.accountId, sourceHash: sourceHash(plaintext), orderId: current.orderId,
    freshOffset: plaintext.indexOf(snapshot.messages.find(m => m.id === current.id)!.text) };
}
export const contextHash = (snapshot: Snapshot) => sourceHash(JSON.stringify(snapshot));
