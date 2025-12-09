import { prisma } from '@/lib/prisma';
import type { MailAccount } from '@prisma/client';

/**
 * Gets the default mail account.
 */
export async function getDefaultAccount(): Promise<MailAccount | null> {
    const account = await prisma.mailAccount.findFirst({
        where: { isDefault: true, isActive: true },
    });

    if (account) return account;

    // Fallback: any active account
    return prisma.mailAccount.findFirst({
        where: { isActive: true },
    });
}

/**
 * Seeds the initial mail account from environment variables if none exist.
 */
export async function seedDefaultAccount() {
    const count = await prisma.mailAccount.count();
    if (count > 0) return;

    if (
        process.env.IMAP_HOST &&
        process.env.IMAP_USER &&
        process.env.IMAP_PASSWORD &&
        process.env.SMTP_HOST &&
        process.env.SMTP_USER &&
        process.env.SMTP_PASSWORD
    ) {
        console.log('Seeding default mail account from env...');
        await prisma.mailAccount.create({
            data: {
                name: 'Default Account',
                email: process.env.IMAP_USER, // Assuming user is email
                imapHost: process.env.IMAP_HOST,
                imapPort: parseInt(process.env.IMAP_PORT || '993'),
                imapUser: process.env.IMAP_USER,
                imapPass: process.env.IMAP_PASSWORD,
                smtpHost: process.env.SMTP_HOST,
                smtpPort: parseInt(process.env.SMTP_PORT || '587'),
                smtpUser: process.env.SMTP_USER,
                smtpPass: process.env.SMTP_PASSWORD,
                isDefault: true,
                isActive: true,
            },
        });
    }
}
