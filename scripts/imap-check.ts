import { ImapFlow } from 'imapflow';
import * as z from 'zod';
import log from '@/lib/logger';

// Allow loading from .env.local during local runs without hardcoding
// eslint-disable-next-line @typescript-eslint/no-var-requires
require('dotenv').config({ path: '.env.local' });

const envSchema = z.object({
	IMAP_HOST: z.string().min(1),
	IMAP_PORT: z.coerce.number().int().positive().default(993),
	IMAP_USER: z.string().min(1),
	IMAP_PASSWORD: z.string().min(1),
	IMAP_SECURE: z
		.union([z.literal('true'), z.literal('false')])
		.transform((v) => v === 'true')
		.default('true' as any),
	IMAP_TLS_REJECT_UNAUTHORIZED: z
		.union([z.literal('true'), z.literal('false')])
		.transform((v) => v === 'true')
		.default('true' as any),
});

const env = envSchema.parse(process.env);

function classifyError(error: unknown): { kind: string; message: string } {
	const err = error as any;
	const code: string | undefined = err?.code || err?.cause?.code;
	const msg: string = String(err?.message || err);
	const responseCode: string | undefined = err?.response?.code;

	// Auth errors
	if (
		/Authentication failed|Invalid credentials|AUTHENTICATIONFAILED/i.test(msg) ||
		responseCode === 'AUTHENTICATIONFAILED'
	) {
		return {
			kind: 'AUTH',
			message: 'Authentifizierung fehlgeschlagen. Bitte Benutzer/Passwort prüfen.',
		};
	}

	// DNS / Host unreachable
	if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
		return {
			kind: 'DNS',
			message: 'Host nicht auflösbar oder DNS-Problem. IMAP_HOST prüfen und Netzwerk/DNS testen.',
		};
	}

	// Port / Connection refused
	if (code === 'ECONNREFUSED') {
		return {
			kind: 'CONNECTION_REFUSED',
			message: 'Verbindung abgelehnt. Port/Firewall oder IMAP_PORT prüfen.',
		};
	}

	// Timeout / Firewall
	if (code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT' || code === 'ECONNRESET') {
		return {
			kind: 'TIMEOUT',
			message: 'Zeitüberschreitung oder Firewall-Problem. Netzwerk/Firewall und Port prüfen.',
		};
	}

	// TLS / Zertifikat
	if (
		code === 'SELF_SIGNED_CERT_IN_CHAIN' ||
		code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
		code === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
		code === 'ERR_TLS_CERT_ALTNAME_INVALID' ||
		/certificate|cert|TLS/i.test(msg)
	) {
		return {
			kind: 'TLS',
			message:
				'TLS/Zertifikatsfehler. CA-Zertifikate prüfen. Testweise IMAP_TLS_REJECT_UNAUTHORIZED=false setzen (nicht produktiv).',
		};
	}

	return { kind: 'UNKNOWN', message: `Unbekannter Fehler: ${msg}` };
}

async function main() {
	console.log('🔧 IMAP Check - Testing connection with:');
	console.log('   Host:', env.IMAP_HOST);
	console.log('   Port:', env.IMAP_PORT);
	console.log('   User:', env.IMAP_USER);
	console.log('   Secure:', env.IMAP_SECURE);
	console.log('   TLS Reject Unauthorized:', env.IMAP_TLS_REJECT_UNAUTHORIZED);
	
	const client = new ImapFlow({
		host: env.IMAP_HOST,
		port: env.IMAP_PORT,
		secure: env.IMAP_SECURE,
		logger: false,
		auth: {
			user: env.IMAP_USER,
			pass: env.IMAP_PASSWORD,
		},
		tls: {
			rejectUnauthorized: env.IMAP_TLS_REJECT_UNAUTHORIZED,
		},
	// Lima-City specific settings
	disableAutoEnable: true,
	missingIdleCommand: 'NOOP' as const,
});

	try {
		await client.connect();
		const mailbox = await client.mailboxOpen('INBOX');

		const exists = mailbox.exists || 0;
		if (exists === 0) {
			console.log('IMAP Verbindung OK (INBOX leer)');
			return;
		}

		const startSeq = Math.max(1, exists - 4);
		const range = `${startSeq}:${exists}`;
		const lines: string[] = [];

		for await (const message of client.fetch(range, { envelope: true })) {
			const subject = message.envelope?.subject || '(kein Betreff)';
			const date = message.envelope?.date ? new Date(message.envelope.date).toISOString() : '';
			lines.push(`${date} - ${subject}`.trim());
		}

		// Ausgabe der letzten bis zu 5 Mails (neueste zuletzt, gemäß Sequenz)
		for (const line of lines) {
			console.log(line);
		}
	} catch (error) {
		const classified = classifyError(error);
		log.error('imap-check', error, { friendly: classified.message });
		// Für Debug optional Details ausgeben
		// console.error(error);
		process.exitCode = 1;
	} finally {
		try {
			await client.logout();
		} catch {}
	}
}

main();


