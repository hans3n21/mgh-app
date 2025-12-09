import { prisma } from '@/lib/prisma';
import { getImapClient, getSmtpTransport } from './client';
import { saveAttachment } from './attachments';
import { computeThreadId } from './threading';
import type { Mail } from '@prisma/client';
import { simpleParser } from 'mailparser';

interface ReplyOptions {
    accountId: string;
    senderId: string; // Staff User ID
    orderId?: string;
    customerId?: string;
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    html: string;
    text?: string;
    inReplyToMessageId?: string; // The Message-ID we are replying to
    attachments?: {
        filename: string;
        content: Buffer;
        contentType: string;
    }[];
}

/**
 * Sends a reply, saves it, and moves the original message to Trash (Inbox Zero).
 */
export async function replyToMail(options: ReplyOptions): Promise<Mail> {
    // 1. Get Account
    const account = await prisma.mailAccount.findUniqueOrThrow({
        where: { id: options.accountId },
    });

    // 2. Prepare Transport
    const transport = getSmtpTransport(account);

    // 3. Send Mail
    const messageId = `<${Date.now()}.${Math.random().toString(36).substring(2)}@${account.imapHost}>`;

    const mailOptions = {
        from: { name: account.name, address: account.email },
        to: options.to,
        cc: options.cc,
        bcc: options.bcc,
        subject: options.subject,
        html: options.html,
        text: options.text,
        messageId,
        inReplyTo: options.inReplyToMessageId,
        references: options.inReplyToMessageId ? [options.inReplyToMessageId] : undefined,
        attachments: options.attachments,
    };

    await transport.sendMail(mailOptions);

    // 4. Save to DB (Sent)
    const threadResult = await computeThreadId(
        options.inReplyToMessageId,
        options.inReplyToMessageId ? [options.inReplyToMessageId] : [],
        messageId
    );

    const sentMail = await prisma.mail.create({
        data: {
            messageId,
            accountId: account.id,
            folder: 'Sent',
            uid: 0, // Placeholder
            subject: options.subject,
            fromEmail: account.email,
            fromName: account.name,
            to: JSON.stringify(options.to),
            cc: JSON.stringify(options.cc),
            bcc: JSON.stringify(options.bcc),
            html: options.html,
            text: options.text || '',
            date: new Date(),
            inReplyTo: options.inReplyToMessageId,
            references: options.inReplyToMessageId ? JSON.stringify([options.inReplyToMessageId]) : undefined,
            threadId: threadResult.threadId,
            orderId: options.orderId || threadResult.orderId,
            customerId: options.customerId,
            senderId: options.senderId,
            isRead: true,
        },
    });

    // 5. Save Attachments to DB & Disk
    if (options.attachments) {
        for (const att of options.attachments) {
            const saved = await saveAttachment(att.content, att.filename, sentMail.id, att.contentType);
            await prisma.attachment.create({
                data: {
                    mailId: sentMail.id,
                    filename: saved.filename,
                    path: saved.path,
                    size: saved.size,
                    mimeType: saved.mimeType,
                },
            });
        }
    }

    // 6. Append to IMAP Sent
    try {
        const client = await getImapClient(account);

        // Create a raw message using the same options
        // We can use the transport to generate it, or a MailComposer.
        // Since we already sent it, we ideally want the exact same content.
        // For simplicity and reliability, we'll reconstruct it.
        const composer = new (require('nodemailer/lib/mail-composer'))(mailOptions);
        const message = await composer.compile().build();

        await client.append('Sent', message, ['\\Seen']);
    } catch (e) {
        console.error('Failed to append to Sent folder:', e);
    }

    // 7. Inbox Zero: Move Original to Trash
    if (options.inReplyToMessageId) {
        const original = await prisma.mail.findUnique({
            where: { messageId: options.inReplyToMessageId },
        });

        if (original && original.folder === 'INBOX' && original.accountId === account.id) {
            try {
                await moveMail(original.id, 'Trash');
            } catch (e) {
                console.error('Failed to move original mail to Trash:', e);
            }
        }
    }

    return sentMail;
}

/**
 * Moves a mail to a different folder (IMAP + DB).
 */
export async function moveMail(mailId: string, targetFolder: string): Promise<void> {
    const mail = await prisma.mail.findUniqueOrThrow({
        where: { id: mailId },
        include: { account: true },
    });

    const client = await getImapClient(mail.account);

    const lock = await client.getMailboxLock(mail.folder);
    try {
        await client.messageMove(mail.uid.toString(), targetFolder);
    } finally {
        lock.release();
    }

    await prisma.mail.update({
        where: { id: mailId },
        data: { folder: targetFolder },
    });
}

/**
 * Assigns a mail to an order/customer.
 */
export async function assignMailToOrder(
    mailId: string,
    orderId: string | null,
    customerId: string | null
): Promise<Mail> {
    const updated = await prisma.mail.update({
        where: { id: mailId },
        data: {
            orderId,
            customerId,
        },
    });

    if (updated.threadId && orderId) {
        await prisma.mail.updateMany({
            where: { threadId: updated.threadId },
            data: { orderId },
        });
    }

    return updated;
}
