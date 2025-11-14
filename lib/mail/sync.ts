import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { prisma } from '@/lib/prisma';
import { parseMail } from '@/lib/mail/parseMail';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as z from 'zod';
import { autoLinkOrderForMail } from '@/lib/mail/autoLinkOrder';
import log from '@/lib/logger';

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

function sanitizeFileName(input: string): string {
	return input.replace(/[<>:"/\\|?*]+/g, '_');
}

function sanitizeMessageId(msgId: string): string {
	return sanitizeFileName(msgId.replace(/[<>]/g, ''));
}

async function ensureDir(dirPath: string): Promise<void> {
	await fs.mkdir(dirPath, { recursive: true });
}

async function writeUniqueFile(baseDir: string, filename: string, data: Buffer): Promise<string> {
	const name = sanitizeFileName(filename || 'attachment');
	let target = path.join(baseDir, name);
	const parsed = path.parse(target);
	let counter = 1;
	while (true) {
		try {
			await fs.writeFile(target, data, { flag: 'wx' });
			return target;
		} catch (err: any) {
			if (err?.code === 'EEXIST') {
				const nextName = `${parsed.name}_${counter}${parsed.ext}`;
				target = path.join(parsed.dir, nextName);
				counter++;
				continue;
			}
			throw err;
		}
	}
}

export type SyncSummary = {
	synced: number;
	skipped: number;
	processedIds: string[];
};

export async function syncMails(): Promise<SyncSummary> {
	let env;
	try {
		env = envSchema.parse(process.env);
	} catch (error) {
		console.error('❌ IMAP Environment validation failed:', error);
		throw new Error('IMAP configuration invalid or missing. Please check your .env.local file.');
	}

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

	let synced = 0;
	let skipped = 0;
	const processedIds: string[] = [];

	try {
		console.log('🔌 Connecting to IMAP server:', env.IMAP_HOST + ':' + env.IMAP_PORT);
		await client.connect();
		console.log('✅ IMAP connection established');
		await client.mailboxOpen('INBOX');
		console.log('📬 INBOX opened successfully');

		const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 30); // last 30 days
		const uids = await client.search({ since });
		if (!uids || uids.length === 0) {
			return { synced, skipped, processedIds };
		}

		for await (const msg of client.fetch(uids, { source: true, envelope: true })) {
			const envelope = msg.envelope;
			const messageId = envelope?.messageId || '';
			if (!messageId) {
				// No message-id? skip safely
				skipped++;
				continue;
			}

			const existing = await prisma.mail.findUnique({ where: { messageId } });
			if (existing) {
				skipped++;
				continue;
			}

		const parsed = await simpleParser(msg.source as any);
		const text = parsed.text || undefined;
		const html = parsed.html ? String(parsed.html) : undefined;
		const hasAttachments = Array.isArray(parsed.attachments) && parsed.attachments.length > 0;

		// Build address helper
		const to = (envelope?.to || []).map((a: any) => a.address).filter(Boolean);
		const cc = (envelope?.cc || []).map((a: any) => a.address).filter(Boolean);
		const bcc = (envelope?.bcc || []).map((a: any) => a.address).filter(Boolean);
		const fromAddr = (envelope?.from && envelope.from[0]) || undefined;
		const fromEmail: string | undefined = fromAddr?.address;
		const fromName: string | undefined = fromAddr?.name;

		// References und inReplyTo aus parsed headers, da sie nicht im envelope sind
		const references = parsed.references ? (Array.isArray(parsed.references) ? parsed.references : [parsed.references]) : undefined;
		const inReplyTo = parsed.inReplyTo || undefined;

			const parsedData = parseMail(text || '', html);

			// Write attachments to disk
			const baseUploadDir = path.join(process.cwd(), 'uploads', 'mail_attachments');
			const safeMsgId = sanitizeMessageId(messageId);
			const mailDir = path.join(baseUploadDir, safeMsgId);
			await ensureDir(mailDir);

			const attachmentRecords: Array<{ filename: string; mimeType: string | null; size: number | null; storagePath: string }> = [];
			if (hasAttachments) {
				for (const att of parsed.attachments) {
					const filename = att.filename || 'attachment';
					const buffer: Buffer = Buffer.isBuffer(att.content) ? att.content : Buffer.from(att.content as any);
					let savedPathAbs: string;
					try {
						savedPathAbs = await writeUniqueFile(mailDir, filename, buffer);
					} catch (e) {
						log.error('mail-sync.writeAttachment', e, { mailId: messageId, file: filename });
						continue;
					}
					const savedPathRel = path.relative(process.cwd(), savedPathAbs).replace(/\\/g, '/');
					attachmentRecords.push({
						filename: sanitizeFileName(filename),
						mimeType: att.contentType || null,
						size: typeof att.size === 'number' ? att.size : buffer.length,
						storagePath: savedPathRel,
					});
				}
			}

			const created = await prisma.$transaction(async (tx) => {
				const createdMail = await tx.mail.create({
					data: {
						messageId,
						fromName: fromName || null,
						fromEmail: fromEmail || null,
						to: to.length ? (to as unknown as any) : null,
						cc: cc.length ? (cc as unknown as any) : null,
						bcc: bcc.length ? (bcc as unknown as any) : null,
						subject: envelope?.subject || null,
						text: text || null,
						html: html || null,
						date: envelope?.date ? new Date(envelope.date) : null,
						inReplyTo: inReplyTo || null,
						references: references ? (references as unknown as any) : null,
						hasAttachments,
						parsedData: Object.keys(parsedData).length ? (parsedData as any) : null,
						attachments: {
							createMany: attachmentRecords.length
								? {
									data: attachmentRecords,
								}
								: undefined,
						},
					},
				});

				return createdMail;
			});

			synced++;
			processedIds.push(messageId);

			// Auto-link to order if possible
			try {
				await autoLinkOrderForMail(created.id);
			} catch {
				// ignore auto-link errors to keep sync resilient
			}
		}

		console.log('✅ Mail sync completed:', { synced, skipped });
		return { synced, skipped, processedIds };
	} catch (error) {
		console.error('❌ IMAP sync error:', error);
		log.error('mail-sync', error);
		
		// Better error classification for authentication issues
		const errorMessage = error instanceof Error ? error.message : String(error);
		if (errorMessage.includes('Authentication failed') || errorMessage.includes('Invalid credentials')) {
			throw new Error('IMAP Authentication failed. Please check IMAP_USER and IMAP_PASSWORD in your .env.local file.');
		} else if (errorMessage.includes('ENOTFOUND') || errorMessage.includes('getaddrinfo')) {
			throw new Error(`IMAP Host not found: ${env.IMAP_HOST}. Please check IMAP_HOST in your .env.local file.`);
		} else if (errorMessage.includes('ECONNREFUSED')) {
			throw new Error(`IMAP Connection refused to ${env.IMAP_HOST}:${env.IMAP_PORT}. Please check IMAP_HOST and IMAP_PORT.`);
		}
		
		throw error;
	} finally {
		try {
			await client.logout();
		} catch {}
	}
}

// Simple in-memory rate-limit and lock for API usage
const globalState = globalThis as unknown as {
	__mailSyncLock?: boolean;
	__mailSyncLastAt?: number;
};

export async function guardedSyncMails(minIntervalMs = 30_000): Promise<SyncSummary> {
	const now = Date.now();
	if (globalState.__mailSyncLock) {
		throw Object.assign(new Error('Sync läuft bereits'), { status: 429 });
	}
	if (globalState.__mailSyncLastAt && now - globalState.__mailSyncLastAt < minIntervalMs) {
		const remainingMs = minIntervalMs - (now - globalState.__mailSyncLastAt);
		throw Object.assign(new Error(`Zu häufig angefragt. Warten Sie noch ${Math.ceil(remainingMs/1000)} Sekunden.`), { status: 429 });
	}
	globalState.__mailSyncLock = true;
	try {
		// Add delay to prevent rate limiting
		console.log('⏱️ Adding 2 second delay to prevent rate limiting...');
		await new Promise(resolve => setTimeout(resolve, 2000));
		
		const res = await syncMails();
		globalState.__mailSyncLastAt = Date.now();
		return res;
	} finally {
		globalState.__mailSyncLock = false;
	}
}


