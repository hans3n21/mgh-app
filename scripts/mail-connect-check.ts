/**
 * Verbindungsdiagnose fuer alle Postfaecher — IMAP und SMTP getrennt.
 *
 * Warum es das gibt: scripts/imap-check.ts testet nur EIN Postfach, naemlich
 * das aus .env.local, und nur IMAP. Wenn die App "keine Verbindung" meldet,
 * sagt uns das nichts darueber, welches der drei Konten klemmt und ob es am
 * Empfang oder am Versand liegt. Dieses Skript geht alle Konten aus der
 * Datenbank durch und nennt pro Konto und Richtung den echten Fehlercode.
 *
 * NUR LESEND. Es verschickt keine Mail: transporter.verify() baut die
 * Verbindung auf, meldet sich an und legt wieder auf. Passwoerter werden nicht
 * ausgegeben, nur ihre Laenge — damit ein leeres oder abgeschnittenes Passwort
 * auffaellt, ohne es ins Protokoll zu schreiben.
 */

import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import { prisma } from '@/lib/prisma';

const TLS_REJECT = !['false', '0', 'no'].includes(
    (process.env.IMAP_TLS_REJECT_UNAUTHORIZED || '').trim().toLowerCase()
);

function fehlerText(error: unknown): string {
    const err = error as any;
    const code = err?.code || err?.cause?.code || err?.responseCode || '—';
    const msg = String(err?.message || err).split('\n')[0];
    return `${code}  ${msg}`;
}

async function pruefeImap(a: {
    imapHost: string; imapPort: number; imapUser: string; imapPass: string;
}): Promise<string> {
    const client = new ImapFlow({
        host: a.imapHost,
        port: a.imapPort,
        secure: a.imapPort === 993,
        auth: { user: a.imapUser, pass: a.imapPass },
        logger: false,
        disableAutoEnable: true,
        missingIdleCommand: 'NOOP',
    });
    try {
        await client.connect();
        const box = await client.mailboxOpen('INBOX', { readOnly: true });
        return `OK  (${box.exists ?? 0} Mails im Posteingang)`;
    } catch (error) {
        return `FEHLER  ${fehlerText(error)}`;
    } finally {
        try { await client.logout(); } catch { }
        try { client.close(); } catch { }
    }
}

async function pruefeSmtp(a: {
    smtpHost: string; smtpPort: number; smtpUser: string; smtpPass: string;
}): Promise<string> {
    const transporter = nodemailer.createTransport({
        host: a.smtpHost,
        port: a.smtpPort,
        secure: a.smtpPort === 465,
        auth: { user: a.smtpUser, pass: a.smtpPass },
        tls: { rejectUnauthorized: TLS_REJECT },
        connectionTimeout: 20000,
        greetingTimeout: 20000,
    });
    try {
        await transporter.verify();
        return 'OK  (Anmeldung akzeptiert)';
    } catch (error) {
        return `FEHLER  ${fehlerText(error)}`;
    } finally {
        try { transporter.close(); } catch { }
    }
}

async function main() {
    console.log(`TLS-Pruefung: ${TLS_REJECT ? 'aktiv (Standard)' : 'ABGESCHALTET'}`);
    console.log('');

    const konten = await prisma.mailAccount.findMany({ orderBy: { email: 'asc' } });
    if (konten.length === 0) {
        console.log('Keine Postfaecher in der Datenbank.');
        return;
    }

    for (const a of konten) {
        console.log(`── ${a.email}${a.isActive ? '' : '   [INAKTIV]'}`);
        console.log(`   IMAP ${a.imapHost}:${a.imapPort} als ${a.imapUser} (Passwort ${a.imapPass?.length ?? 0} Zeichen)`);
        console.log(`        ${await pruefeImap(a)}`);
        console.log(`   SMTP ${a.smtpHost}:${a.smtpPort} als ${a.smtpUser} (Passwort ${a.smtpPass?.length ?? 0} Zeichen)`);
        console.log(`        ${await pruefeSmtp(a)}`);
        console.log('');
    }
}

main()
    .catch((e) => { console.error('Abbruch:', e); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
