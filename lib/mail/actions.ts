import { prisma } from '@/lib/prisma';
import { getImapClient, getSmtpTransport } from './client';
import { saveAttachment } from './attachments';
import { computeThreadId } from './threading';
import linkMailArtifactsToOrder, { unlinkMailArtifactsFromOrder } from './linkArtifacts';
import { isTrashFolderName, resolveTrashFolderFromList } from './folders';
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
        /**
         * true = dieses Bild ist frisch aufgenommen/hochgeladen und gehoert in
         * die Bildergalerie des Auftrags. Bewusst NICHT fuer Bilder setzen, die
         * der Nutzer aus eben dieser Galerie ausgewaehlt hat — die kaemen sonst
         * bei jedem Update erneut hinein, und weil sie beim Senden neu
         * komprimiert werden, waeren die Dubletten hinterher nicht mehr
         * zuverlaessig zu erkennen.
         */
        addToGallery?: boolean;
    }[];
}

function normalizeThreadSubject(subject: string | null | undefined): string {
    if (!subject) return '';
    let value = subject.trim();
    // Strip common reply/forward prefixes repeatedly: RE:, AW:, WG:, FW:, FWD:
    const prefixPattern = /^((re|aw|wg|fw|fwd)\s*:\s*)+/i;
    while (prefixPattern.test(value)) {
        value = value.replace(prefixPattern, '').trim();
    }
    return value.toLowerCase();
}

function safeParseRecipientList(raw: unknown): string[] {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.filter((v): v is string => typeof v === 'string').map(v => v.toLowerCase());
    if (typeof raw !== 'string') return [];
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            return parsed.filter((v): v is string => typeof v === 'string').map(v => v.toLowerCase());
        }
    } catch {
        // ignore JSON parse errors
    }
    return [];
}

function hasParticipantOverlap(
    baseFrom: string | null | undefined,
    baseTo: unknown,
    candidateFrom: string | null | undefined,
    candidateTo: unknown
): boolean {
    const a = new Set<string>([
        ...(baseFrom ? [baseFrom.toLowerCase()] : []),
        ...safeParseRecipientList(baseTo),
    ]);
    const b = new Set<string>([
        ...(candidateFrom ? [candidateFrom.toLowerCase()] : []),
        ...safeParseRecipientList(candidateTo),
    ]);
    for (const item of Array.from(a)) {
        if (b.has(item)) return true;
    }
    return false;
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
            const created = await prisma.attachment.create({
                data: {
                    mailId: sentMail.id,
                    filename: saved.filename,
                    path: saved.path,
                    size: saved.size,
                    mimeType: saved.mimeType,
                    isPersisted: true,
                },
            });

            // 5a. Frisch aufgenommene Fotos zusaetzlich in die Bildergalerie des
            // Auftrags. Bisher landete dort nur, was der Kunde UNS schickt —
            // unsere eigenen Update-Fotos waren ausschliesslich im
            // Kommunikationsverlauf zu finden.
            //
            // attach:false ist Absicht: eingehende Anhaenge werden mit true
            // angelegt und wandern damit ins Kunden-PDF. Fuer Fotos, die wir
            // gerade erst an den Kunden geschickt haben, waere das ueberraschend
            // — sie sollen sichtbar sein, aber nicht ungefragt im Dokument
            // landen. Wer sie dort haben will, hakt sie in der Galerie an.
            const isImage = (saved.mimeType || '').startsWith('image/');
            if (att.addToGallery && isImage && sentMail.orderId) {
                const publicPath = `/api/attachments/${created.id}`;
                const already = await prisma.orderImage.findFirst({
                    where: { orderId: sentMail.orderId, path: publicPath },
                });
                if (!already) {
                    await prisma.orderImage.create({
                        data: {
                            orderId: sentMail.orderId,
                            path: publicPath,
                            comment: `An Kunden gesendet: ${saved.filename}`,
                            attach: false,
                            position: 0,
                        },
                    });
                }
            }
        }
    }

    // 5b. Wenn Auftrag verknüpft: Anhänge als OrderImages im Kommunikationsbereich verlinken
    if (sentMail.orderId && options.attachments?.length) {
        await linkMailArtifactsToOrder(sentMail.id, sentMail.orderId);
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
        // Scope to this account so we don't accidentally move a mail from another account.
        const original = await prisma.mail.findFirst({
            where: { accountId: account.id, messageId: options.inReplyToMessageId },
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
export async function moveMail(mailId: string, targetFolder: string): Promise<{ folder: string }> {
    const mail = await prisma.mail.findUniqueOrThrow({
        where: { id: mailId },
        include: { account: true },
    });

    if (mail.orderId) {
        try {
            await linkMailArtifactsToOrder(mail.id, mail.orderId);
        } catch (error) {
            console.warn(`[mail] Could not persist artifacts before moving mail ${mail.id}:`, error);
        }
    }

    const client = await getImapClient(mail.account);
    let resolvedTargetFolder = targetFolder;
    if (isTrashFolderName(targetFolder)) {
        try {
            const folders = await (client as any).list({ pattern: '*' });
            resolvedTargetFolder = resolveTrashFolderFromList(Array.isArray(folders) ? folders : [], 'Trash');
        } catch (error) {
            console.warn(`[mail] Could not resolve trash folder for account ${mail.accountId}:`, error);
            resolvedTargetFolder = 'Trash';
        }
    }

    if (mail.folder === resolvedTargetFolder) {
        await prisma.mail.update({
            where: { id: mailId },
            data: { folder: resolvedTargetFolder },
        });
        return { folder: resolvedTargetFolder };
    }

    const lock = await client.getMailboxLock(mail.folder);
    try {
        await client.messageMove(mail.uid.toString(), resolvedTargetFolder, { uid: true });
    } finally {
        lock.release();
    }

    await prisma.mail.update({
        where: { id: mailId },
        data: { folder: resolvedTargetFolder },
    });

    return { folder: resolvedTargetFolder };
}

/**
 * Assigns a mail to an order/customer.
 */
export async function assignMailToOrder(
    mailId: string,
    orderId: string | null,
    customerId: string | null
): Promise<Mail> {
    const previous = await prisma.mail.findUnique({
        where: { id: mailId },
        select: { orderId: true, threadId: true },
    });

    if (previous?.orderId && previous.orderId !== orderId) {
        await unlinkMailArtifactsFromOrder(mailId, previous.orderId);
    }

    const updated = await prisma.mail.update({
        where: { id: mailId },
        data: {
            orderId,
            customerId,
        },
        include: { attachments: true },
    });

    const mailIdsToLink = new Set<string>([mailId]);

    if (updated.threadId && orderId) {
        const threadMails = await prisma.mail.findMany({
            where: { threadId: updated.threadId },
            select: { id: true, orderId: true },
        });
        for (const threadMail of threadMails) {
            mailIdsToLink.add(threadMail.id);
            if (threadMail.orderId && threadMail.orderId !== orderId) {
                await unlinkMailArtifactsFromOrder(threadMail.id, threadMail.orderId);
            }
        }

        await prisma.mail.updateMany({
            where: { threadId: updated.threadId },
            data: { orderId },
        });
    }

    // Fallback conversation linking by normalized subject + participants.
    // This catches cases where mail headers (Message-ID/In-Reply-To/References)
    // are incomplete and threads are split, e.g. subjects with AW/RE prefixes.
    if (orderId) {
        const baseMail = await prisma.mail.findUnique({
            where: { id: mailId },
            select: {
                id: true,
                accountId: true,
                subject: true,
                fromEmail: true,
                to: true,
                date: true,
            },
        });
        if (baseMail) {
            const normalizedBaseSubject = normalizeThreadSubject(baseMail.subject);
            if (normalizedBaseSubject) {
                const windowStart = new Date(baseMail.date);
                windowStart.setMonth(windowStart.getMonth() - 12);
                const windowEnd = new Date(baseMail.date);
                windowEnd.setMonth(windowEnd.getMonth() + 12);

                const candidates = await prisma.mail.findMany({
                    where: {
                        accountId: baseMail.accountId,
                        orderId: null,
                        date: { gte: windowStart, lte: windowEnd },
                    },
                    select: {
                        id: true,
                        subject: true,
                        fromEmail: true,
                        to: true,
                    },
                });

                const relatedIds = candidates
                    .filter((candidate) => {
                        if (candidate.id === baseMail.id) return false;
                        if (normalizeThreadSubject(candidate.subject) !== normalizedBaseSubject) return false;
                        return hasParticipantOverlap(baseMail.fromEmail, baseMail.to, candidate.fromEmail, candidate.to);
                    })
                    .map((candidate) => candidate.id);

                if (relatedIds.length > 0) {
                    await prisma.mail.updateMany({
                        where: { id: { in: relatedIds }, orderId: null },
                        data: { orderId },
                    });
                    relatedIds.forEach((id) => mailIdsToLink.add(id));
                }
            }
        }
    }

    if (orderId) {
        for (const linkedMailId of Array.from(mailIdsToLink)) {
            await linkMailArtifactsToOrder(linkedMailId, orderId);
        }
    }

    return updated;
}
