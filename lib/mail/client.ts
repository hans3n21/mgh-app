import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import type { MailAccount } from '@prisma/client';

// Singleton storage for active connections, keyed by accountId.
// WICHTIG: an globalThis haengen (wie lib/prisma.ts). Sonst legt jeder
// HMR-Reload im Dev-Modus einen frischen Pool an, waehrend die alten IMAP-
// Verbindungen des vorherigen Modul-Stands verwaist offen bleiben. Ueber viele
// Reloads sammeln sich so Dutzende Verbindungen an, bis der Mailserver neue
// Logins ablehnt ("Maximum number of connections from user+IP exceeded").
const globalForMail = globalThis as unknown as {
    __imapClients?: Map<string, ImapFlow>;
    __smtpTransports?: Map<string, nodemailer.Transporter>;
};
const imapClients: Map<string, ImapFlow> = globalForMail.__imapClients ?? (globalForMail.__imapClients = new Map());
const smtpTransports: Map<string, nodemailer.Transporter> = globalForMail.__smtpTransports ?? (globalForMail.__smtpTransports = new Map());

/**
 * Returns an authenticated ImapFlow instance for the given account.
 * reuses existing connections if available and active.
 */
export async function getImapClient(account: MailAccount): Promise<ImapFlow> {
    const existing = imapClients.get(account.id);

    if (existing) {
        // Check if usable
        if (existing.usable) {
            return existing;
        }
        // If not usable, close and remove
        try {
            await existing.logout();
        } catch { }
        imapClients.delete(account.id);
    }

    const client = new ImapFlow({
        host: account.imapHost,
        port: account.imapPort,
        secure: account.imapPort === 993, // Convention: 993 is secure
        auth: {
            user: account.imapUser,
            pass: account.imapPass,
        },
        logger: false, // Disable verbose logging in production
        // Lima-City specific settings (from original script)
        disableAutoEnable: true,
        missingIdleCommand: 'NOOP',
    });

    // Ohne Handler landet ein asynchroner Socket-Fehler (z.B. ETIMEOUT waehrend
    // eines langen Fetches) als uncaughtException und kann den Prozess beenden.
    client.on('error', (err: Error) => {
        console.error(`IMAP connection error for ${account.email}:`, err.message);
        imapClients.delete(account.id);
    });
    client.on('close', () => {
        imapClients.delete(account.id);
    });

    // Wait for connection
    await client.connect();

    // Store for reuse
    imapClients.set(account.id, client);

    return client;
}

/**
 * Returns an authenticated Nodemailer transporter for the given account.
 * Reuses existing transporters.
 */
export function getSmtpTransport(account: MailAccount): nodemailer.Transporter {
    const existing = smtpTransports.get(account.id);

    if (existing) {
        return existing;
    }

    const transporter = nodemailer.createTransport({
        host: account.smtpHost,
        port: account.smtpPort,
        secure: account.smtpPort === 465, // Convention: 465 is secure, 587 is STARTTLS
        auth: {
            user: account.smtpUser,
            pass: account.smtpPass,
        },
    });

    smtpTransports.set(account.id, transporter);

    return transporter;
}

