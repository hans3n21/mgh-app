import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { sendMail } from '@/lib/mail/sendMail';

const AttachmentSchema = z.object({ id: z.string().optional(), name: z.string().optional(), content: z.string().optional(), contentType: z.string().optional() });
const Body = z.object({
  to: z.string().email().optional(),
  cc: z.string().email().array().optional(),
  subject: z.string().min(1),
  text: z.string().min(1),
  html: z.string().optional(), // HTML-Version
  attachments: AttachmentSchema.array().optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const mail = await prisma.mail.findUnique({ where: { id } });
    if (!mail) return NextResponse.json({ error: 'Mail not found' }, { status: 404 });

    const bodyRaw = await req.json().catch(() => ({}));
    const body = Body.parse(bodyRaw);

    const to = body.to || mail.fromEmail || undefined;
    // prepare attachments: if id provided, resolve to path; if content provided, decode
    const atts: Array<{ filename: string; content?: Buffer; contentType?: string | null; path?: string }> = [];
    for (const a of body.attachments || []) {
      if (a.id) {
        const att = await prisma.attachment.findUnique({ where: { id: a.id } });
        if (att) atts.push({ filename: att.filename, path: att.path, contentType: att.mimeType || undefined });
      } else if (a.name && a.content) {
        const buf = Buffer.from(a.content, 'base64');
        atts.push({ filename: a.name, content: buf, contentType: a.contentType || undefined });
      }
    }

    // try send; if no SMTP configured, sendMail will noop
    await sendMail({ to: to!, cc: body.cc, subject: body.subject, text: body.text, html: body.html, inReplyTo: mail.messageId, attachments: atts });

    // if linked to order, store as staff message for traceability
    if (mail.orderId) {
      await prisma.message.create({ data: { orderId: mail.orderId, body: body.text, senderType: 'staff' } });
    }
    return NextResponse.json({ ok: true, mode: process.env.SMTP_HOST ? 'sent' : 'dry-run' });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: 'Invalid body', details: e.issues }, { status: 400 });
    console.error('mail reply error', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}


