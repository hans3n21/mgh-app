import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { replyToMail } from '@/lib/mail/actions';
import { loadAttachmentForEmail } from '@/lib/mail/attachments';
import { z } from 'zod';

function parseAttachmentRefsFromBody(body: string): string[] {
  const ids: string[] = [];
  const anhangBlock = body.match(/📎 Anhänge:\n([\s\S]*?)(?=\n\n|$)/);
  if (anhangBlock) {
    const lines = anhangBlock[1].split('\n').filter(Boolean);
    for (const line of lines) {
      const imgMatch = line.match(/🖼️\s+(\/api\/attachments\/([a-zA-Z0-9]+))/);
      if (imgMatch) {
        ids.push(imgMatch[2]);
      }
    }
  }
  return Array.from(new Set(ids));
}

const attachmentSchema = z.object({
  filename: z.string().min(1),
  content: z.string().min(1), // base64
  contentType: z.string().optional(),
});

const createMessageSchema = z.object({
  body: z.string().min(1).max(10000),
  senderType: z.enum(['staff', 'customer']),
  senderId: z.string().nullable(),
  sendEmail: z.boolean().optional(),
  attachments: z.array(attachmentSchema).optional(),
});

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const messages = await prisma.message.findMany({
      where: { orderId: id },
      include: { sender: true },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json(messages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    return NextResponse.json(
      { error: 'Failed to fetch messages' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const validatedData = createMessageSchema.parse(body);

    const { sendEmail, attachments: rawAttachments, ...messageData } = validatedData;

    if (sendEmail && messageData.senderType === 'staff') {
      const order = await prisma.order.findUnique({
        where: { id },
        include: { customer: true },
      });
      const customerEmail = order?.customer?.email;
      if (!customerEmail) {
        return NextResponse.json({ error: 'Keine Kunden-E-Mail hinterlegt' }, { status: 400 });
      }
      const account = await prisma.mailAccount.findFirst({
        where: { isDefault: true },
      }) ?? await prisma.mailAccount.findFirst({
        where: { isActive: true },
      });
      if (!account) {
        return NextResponse.json({ error: 'Kein aktiver Mail-Account' }, { status: 400 });
      }

      const subject = `Auftrag ${order?.title ?? id} – Nachricht von MGH`;
      const html = messageData.body.replace(/\n/g, '<br>');

      const attachmentIds = parseAttachmentRefsFromBody(messageData.body);
      const emailAttachments: { filename: string; content: Buffer; contentType: string }[] = [];
      for (const attId of attachmentIds) {
        const loaded = await loadAttachmentForEmail(attId);
        if (loaded) {
          emailAttachments.push({ filename: loaded.filename, content: loaded.content, contentType: loaded.contentType });
        }
      }
      if (rawAttachments?.length) {
        for (const a of rawAttachments) {
          try {
            emailAttachments.push({ filename: a.filename, content: Buffer.from(a.content, 'base64'), contentType: a.contentType || 'application/octet-stream' });
          } catch { /* base64 ungültig */ }
        }
      }

      const sentMail = await replyToMail({
        accountId: account.id,
        senderId: session.user.id,
        orderId: id,
        customerId: order?.customerId ?? undefined,
        to: [customerEmail],
        subject,
        html,
        text: messageData.body,
        attachments: emailAttachments.length > 0 ? emailAttachments : undefined,
      });

      return NextResponse.json({
        id: sentMail.id,
        body: messageData.body,
        createdAt: sentMail.date,
        senderType: 'staff',
        sender: { id: session.user.id, name: session.user.name || 'Staff' },
        isEmail: true,
      });
    }

    const message = await prisma.message.create({
      data: { orderId: id, ...messageData },
      include: { sender: true },
    });

    return NextResponse.json(message);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid data', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Error creating message:', error);
    return NextResponse.json(
      { error: 'Failed to create message' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: orderId } = await params;
    const url = new URL(request.url);
    const messageId = url.searchParams.get('messageId');
    if (!messageId) {
      return NextResponse.json({ error: 'messageId erforderlich' }, { status: 400 });
    }

    const existing = await prisma.message.findFirst({
      where: { id: messageId, orderId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Nachricht nicht gefunden' }, { status: 404 });
    }

    await prisma.message.delete({ where: { id: messageId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting message:', error);
    return NextResponse.json(
      { error: 'Failed to delete message' },
      { status: 500 }
    );
  }
}
