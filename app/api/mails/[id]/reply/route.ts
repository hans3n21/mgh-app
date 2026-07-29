import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { replyToMail } from '@/lib/mail/actions';
import { textToSafeHtml } from '@/lib/mail/linkify';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { buildDatasheetForOrder, DatasheetBuildError } from '@/lib/pdf/datasheet-for-order';

const AttachmentSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  content: z.string().optional(),
  contentType: z.string().optional(),
  // Ausfuellbares Kunden-Datenblatt, serverseitig erzeugt. Entweder vorbefuellt
  // aus einem Auftrag (orderId) oder blanko fuer einen Auftragstyp (type).
  datasheet: z
    .object({
      orderId: z.string().optional(),
      type: z.string().optional(),
    })
    .optional(),
});

const Body = z.object({
  to: z.string().email().optional(),
  cc: z.string().email().array().optional(),
  subject: z.string().min(1),
  text: z.string().min(1),
  html: z.string().optional(),
  attachments: AttachmentSchema.array().optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const mail = await prisma.mail.findUnique({ where: { id }, include: { account: true } });
    if (!mail) return NextResponse.json({ error: 'Mail not found' }, { status: 404 });
    if (!mail.account) return NextResponse.json({ error: 'Kein Mail-Account zugeordnet' }, { status: 400 });

    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const senderId = (session?.user as any)?.id || null;

    const bodyRaw = await req.json().catch(() => ({}));
    const body = Body.parse(bodyRaw);

    const to = body.to || mail.replyToEmail || mail.fromEmail || undefined;
    if (!to) return NextResponse.json({ error: 'Kein Empfänger' }, { status: 400 });

    const atts: Array<{ filename: string; content: Buffer; contentType: string }> = [];
    for (const a of body.attachments || []) {
      if (a.datasheet) {
        // Datenblatt hier erzeugen statt im Browser: gleiches PDF wie beim
        // Download im Auftrag, inklusive Herkunftsstempel fuer den Reimport.
        // Ein ausdruecklich angeforderter Typ bedeutet "blanko" — dann darf der
        // Auftrag der Mail nicht heimlich doch die Vorbelegung liefern.
        const explicitBlank = !a.datasheet.orderId && Boolean(a.datasheet.type);
        const sheet = await buildDatasheetForOrder({
          orderId: explicitBlank ? undefined : a.datasheet.orderId || mail.orderId || undefined,
          type: a.datasheet.type,
        });
        atts.push({
          filename: sheet.filename,
          content: Buffer.from(sheet.bytes),
          contentType: 'application/pdf',
        });
      } else if (a.id) {
        const att = await prisma.attachment.findUnique({ where: { id: a.id } });
        if (att?.path) {
          const fs = await import('fs/promises');
          try {
            const buf = await fs.readFile(att.path);
            atts.push({ filename: att.filename, content: buf, contentType: att.mimeType || 'application/octet-stream' });
          } catch {
            /* Datei nicht gefunden -- überspringen */
          }
        }
      } else if (a.name && a.content) {
        atts.push({
          filename: a.name,
          content: Buffer.from(a.content, 'base64'),
          contentType: a.contentType || 'application/octet-stream',
        });
      }
    }

    const sentMail = await replyToMail({
      accountId: mail.account.id,
      senderId: senderId || 'system',
      orderId: mail.orderId || undefined,
      customerId: mail.customerId || undefined,
      to: [to],
      cc: body.cc,
      subject: body.subject,
      html: body.html || textToSafeHtml(body.text),
      text: body.text,
      inReplyToMessageId: mail.messageId,
      attachments: atts.length > 0 ? atts : undefined,
    });

    return NextResponse.json({ ok: true, mode: 'sent', mailId: sentMail.id });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: 'Invalid body', details: e.issues }, { status: 400 });
    if (e instanceof DatasheetBuildError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('mail reply error', e);
    const msg = e instanceof Error ? e.message : 'Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
