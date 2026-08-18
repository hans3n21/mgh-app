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

let tlsWarningShown = false;

/**
 * TLS-Einstellungen für alle Mail-Verbindungen (IMAP wie SMTP).
 *
 * Node bringt einen EIGENEN Zertifikatsspeicher mit und liest den von Windows
 * nicht. Klinkt sich auf dem Rechner etwas in die Verbindung ein — ein
 * Virenscanner mit HTTPS-Prüfung, eine Firewall, ein Firmen-Proxy — dann sieht
 * der Browser ein gültiges Zertifikat, Node aber ein selbst ausgestelltes und
 * bricht ab: SELF_SIGNED_CERT_IN_CHAIN.
 *
 * Der saubere Weg ist, Node das Wurzelzertifikat des Mitlesers bekannt zu
 * machen (Umgebungsvariable NODE_EXTRA_CA_CERTS mit dem Pfad zur .pem-Datei) —
 * dann bleibt die Prüfung aktiv. Wo das nicht geht, lässt sich die Prüfung mit
 * IMAP_TLS_REJECT_UNAUTHORIZED=false abschalten.
 *
 * ACHTUNG: Über diese Verbindungen laufen die Postfach-Passwörter. Ohne
 * Prüfung merkt niemand, wenn sich jemand dazwischenschaltet. Nur im eigenen
 * Netz und nur, wenn der Mitleser bekannt ist.
 *
 * Die Variable gab es schon (scripts/imap-check.ts wertet sie aus,
 * /api/mail/health verlangt sie), nur hat der Client sie nie gelesen.
 */
export function getMailTlsOptions(): { rejectUnauthorized: boolean } {
    const raw = (process.env.IMAP_TLS_REJECT_UNAUTHORIZED || '').trim().toLowerCase();
    const rejectUnauthorized = !(raw === 'false' || raw === '0' || raw === 'no');
    if (!rejectUnauthorized && !tlsWarningShown) {
        tlsWarningShown = true;
        console.warn(
            '[mail] TLS-Zertifikate werden NICHT geprueft (IMAP_TLS_REJECT_UNAUTHORIZED=false). ' +
            'Nur als Notloesung gedacht — besser NODE_EXTRA_CA_CERTS auf das Wurzelzertifikat setzen.'
        );
    }
    return { rejectUnauthorized };
}

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
        tls: getMailTlsOptions(),
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
    try {
        await client.connect();
    } catch (error) {
        throw enrichTlsError(error);
    }

    // Store for reuse
    imapClients.set(account.id, client);

    return client;
}

/**
 * Wirft die IMAP-Verbindung eines Kontos weg — Steckdose ziehen, nicht abmelden.
 *
 * Gedacht fuer den Fall, dass eine Operation in ein Zeitlimit gelaufen ist. Sie
 * laeuft dann naemlich unsichtbar weiter und haelt die Postfachsperre aus
 * getMailboxLock. Der naechste Lauf holt sich ueber getImapClient dieselbe
 * zwischengespeicherte Verbindung, stellt sich hinter die haengende Sperre und
 * wartet — bis sein eigenes Zeitlimit ablaeuft und einen weiteren Haenger
 * hinterlaesst. Das Postfach kommt aus dieser Schleife nie wieder heraus.
 *
 * close() statt logout(): logout() ist selbst ein IMAP-Befehl und wuerde sich
 * hinter derselben Sperre anstellen. close() zerstoert den Socket sofort, die
 * haengenden Operationen brechen mit einem Fehler ab, und der naechste Lauf
 * baut eine frische Verbindung auf.
 */
export function dropImapClient(accountId: string): void {
    const client = imapClients.get(accountId);
    // Erst aus dem Zwischenspeicher, dann schliessen: sonst koennte ein
    // gleichzeitiger getImapClient die sterbende Verbindung noch herausgeben.
    imapClients.delete(accountId);
    if (!client) return;
    try {
        client.close();
    } catch { }
}

/** Zertifikatsfehler, die auf einen Mitleser in der Verbindung hindeuten. */
const TLS_CHAIN_ERRORS = new Set([
    'SELF_SIGNED_CERT_IN_CHAIN',
    'DEPTH_ZERO_SELF_SIGNED_CERT',
    'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
    'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
    'CERT_UNTRUSTED',
]);

/**
 * Haengt an einen Zertifikatsfehler den Hinweis an, was zu tun ist. Ohne das
 * steht im Protokoll nur "self-signed certificate in certificate chain" — was
 * nach einem Serverproblem aussieht, obwohl die Ursache auf dem eigenen Rechner
 * sitzt und der Mailserver voellig in Ordnung ist.
 */
export function enrichTlsError(error: unknown): unknown {
    const code = (error as { code?: string })?.code;
    if (!code || !TLS_CHAIN_ERRORS.has(code)) return error;
    if (!(error instanceof Error)) return error;
    error.message =
        `${error.message} — Auf diesem Rechner liest etwas die Verbindung mit ` +
        '(Virenscanner mit HTTPS-Pruefung, Firewall oder Proxy). Node kennt dessen ' +
        'Wurzelzertifikat nicht, weil es den Windows-Zertifikatsspeicher nicht liest. ' +
        'Abhilfe: NODE_EXTRA_CA_CERTS auf die .pem-Datei des Wurzelzertifikats setzen ' +
        '(Pruefung bleibt aktiv) oder notfalls IMAP_TLS_REJECT_UNAUTHORIZED=false in .env.local.';
    return error;
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
        // Gleiche Begruendung wie beim IMAP-Client: wird die Verbindung auf dem
        // Rechner mitgelesen, scheitert sonst auch der Versand.
        tls: getMailTlsOptions(),
    });

    smtpTransports.set(account.id, transporter);

    return transporter;
}

