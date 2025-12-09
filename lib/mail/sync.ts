import { simpleParser, type ParsedMail, type AddressObject } from 'mailparser';
import type { FetchMessageObject } from 'imapflow';
import { prisma } from '@/lib/prisma';
import { getImapClient } from './client';
import { saveAttachment } from './attachments';
import { computeThreadId } from './threading';
import { findCustomerForEmail } from './customer';
import { parseMail } from './parseMail';
import type { MailAccount } from '@prisma/client';

const BATCH_SIZE = 10;

/**
 * Public helper used by scripts and API routes.
 * Currently just syncs all active accounts and returns a simple status object.
 */
export async function syncMails() {
	await syncAllAccounts();

	return {
		success: true,
	};
}

/**
 * Guarded variant for API usage – logs errors and rethrows for HTTP handling.
 */
export async function guardedSyncMails() {
	try {
		return await syncMails();
	} catch (error) {
		console.error('guardedSyncMails: sync failed', error);
		throw error;
	}
}

/**
 * Main entry point: Syncs all active accounts.
 */
export async function syncAllAccounts() {
	const accounts = await prisma.mailAccount.findMany({
		where: { isActive: true },
	});

	for (const account of accounts) {
		try {
			await syncAccount(account);
		} catch (error) {
			console.error(`Error syncing account ${account.email}:`, error);
		}
	}
}

/**
 * Syncs INBOX, Sent, and Trash for a specific account.
 */
export async function syncAccount(account: MailAccount) {
	const folders = ['INBOX', 'Sent', 'Trash']; // Standard folders, might need mapping
	// Note: 'Sent' might be 'Sent Items' or similar depending on server. 
	// For now assuming standard names or handled by imapflow/server capability.

	for (const folder of folders) {
		try {
			await syncFolder(account, folder);
		} catch (error) {
			console.error(`Error syncing folder ${folder} for ${account.email}:`, error);
		}
	}
}

/**
 * Syncs a specific folder using incremental UID fetch.
 */
export async function syncFolder(account: MailAccount, folderName: string) {
	const client = await getImapClient(account);

	// Open mailbox
	const lock = await client.getMailboxLock(folderName);
	try {
		// Get last seen UID from DB (SystemSetting)
		const cursorKey = `sync:${account.id}:${folderName}`;
		const cursor = await prisma.systemSetting.findUnique({ where: { key: cursorKey } });

		let lastUid = 0;
		if (cursor?.value) {
			try {
				const parsed = JSON.parse(cursor.value);
				lastUid = parsed.lastUid || 0;
			} catch { }
		}

		// Fetch new messages
		// Fetching from lastUid + 1 to *
		// If lastUid is 0, fetch all (or maybe limit to recent if mailbox is huge? 
		// For now, let's assume we want everything initially, but maybe batched)

		// Check if there are any messages
		if (!client.mailbox || client.mailbox.exists === 0) return;

		// We use a generator to fetch
		const fetchRange = `${lastUid + 1}:*`;

		// If lastUid is very old or invalid, this might fetch nothing if UIDs reset (UIDVALIDITY).
		// Ideally we check UIDVALIDITY, but for simplicity here we assume persistence.
		// If fetchRange is invalid (e.g. lastUid > max), imapflow handles it gracefully usually.

		const messageGenerator = client.fetch(fetchRange, {
			envelope: true,
			source: true, // We need source to parse
			uid: true,
			flags: true,
			internalDate: true,
		});

		let maxUidSeen = lastUid;

		for await (const message of messageGenerator) {
			try {
				await ingestMessage(account, message, folderName);
				if (message.uid > maxUidSeen) {
					maxUidSeen = message.uid;
				}
			} catch (err) {
				console.error(`Failed to ingest message UID ${message.uid} in ${folderName}:`, err);
			}
		}

		// Update cursor
		if (maxUidSeen > lastUid) {
			await prisma.systemSetting.upsert({
				where: { key: cursorKey },
				update: { value: JSON.stringify({ lastUid: maxUidSeen }) },
				create: { key: cursorKey, value: JSON.stringify({ lastUid: maxUidSeen }) },
			});
		}

	} finally {
		lock.release();
	}
}

/**
 * Processes a single IMAP message: parses, links, and saves to DB.
 */
async function ingestMessage(
	account: MailAccount,
	message: FetchMessageObject,
	folderName: string
) {
	const source = message.source;
	if (!source) return; // Should not happen if requested
	if (!message.envelope) return;

	// Parse MIME
	const parsed = await simpleParser(source);

	// Extract key fields
	const messageId = parsed.messageId || message.envelope.messageId || `no-id-${message.uid}-${Date.now()}`;
	const subject = parsed.subject || '(No Subject)';

	// Helper to extract address
	const getAddress = (addr: AddressObject | AddressObject[] | undefined): string[] => {
		if (!addr) return [];
		if (Array.isArray(addr)) {
			return addr.flatMap(a => a.value.map(v => v.address || '')).filter(Boolean);
		}
		return addr.value.map(v => v.address || '').filter(Boolean);
	};

	const fromArr = getAddress(parsed.from);
	const fromEmail = fromArr[0] || '';
	const fromName = (parsed.from && !Array.isArray(parsed.from) && parsed.from.value[0]?.name) || '';

	const to = getAddress(parsed.to);
	const cc = getAddress(parsed.cc);
	const bcc = getAddress(parsed.bcc);

	const date = parsed.date || new Date();
	const text = parsed.text;
	const html = parsed.html || text; // Fallback
	const snippet = text?.substring(0, 200);
	const inReplyTo = parsed.inReplyTo;
	const references = typeof parsed.references === 'string'
		? [parsed.references]
		: (Array.isArray(parsed.references) ? parsed.references : []);

	// Parse structured data from mail content (not stored in DB, computed on-demand)
	const parsedData = parseMail(text || '', html || '');

	// 1. Customer Linking
	const customer = await findCustomerForEmail(fromEmail);

	// 2. Order Linking (Regex)
	// Look for [ORD-XXXX] in subject
	let orderId: string | null = null;
	const orderMatch = subject.match(/\[ORD-([A-Za-z0-9-]+)\]/);
	if (orderMatch) {
		// Verify order exists? 
		// For speed, we might just trust it or do a quick check. 
		// Let's do a quick check to ensure referential integrity.
		const exists = await prisma.order.findUnique({ where: { id: orderMatch[1] } });
		if (exists) orderId = exists.id;
	}

	// 3. Threading
	// If we found an order via regex, that takes precedence for the orderId.
	// But we still need threadId.
	const threadResult = await computeThreadId(inReplyTo, references, messageId);

	// If we didn't find an order via regex, maybe the thread has one?
	if (!orderId && threadResult.orderId) {
		orderId = threadResult.orderId;
	}

	// 4. Upsert Mail
	// We use upsert to handle "moves" (e.g. Inbox -> Trash).
	// If messageId exists, we update the folder and UID.
	const mail = await prisma.mail.upsert({
		where: { messageId },
		update: {
			folder: folderName,
			uid: message.uid,
			// If we found new links (e.g. orderId), update them. 
			// But be careful not to overwrite existing valid links if this is just a folder move.
			// Actually, if we found an orderId now, it's good to set it.
			...(orderId ? { orderId } : {}),
			...(customer ? { customerId: customer.id } : {}),
		},
		create: {
			messageId,
			accountId: account.id,
			uid: message.uid,
			folder: folderName,
			subject,
			fromEmail,
			fromName,
			to: JSON.stringify(to),
			cc: JSON.stringify(cc),
			bcc: JSON.stringify(bcc),
			text,
			html,
			snippet,
			date,
			inReplyTo,
			references: JSON.stringify(references),
			threadId: threadResult.threadId,
			orderId,
			customerId: customer?.id,
			isRead: message.flags ? message.flags.has('\\Seen') : false,
		},
	});

	// 5. Handle Attachments
	if (parsed.attachments && parsed.attachments.length > 0) {
		for (const att of parsed.attachments) {
			// Check if already saved? 
			// We can check DB for this mailId + filename + size
			const existing = await prisma.attachment.findFirst({
				where: {
					mailId: mail.id,
					filename: att.filename || 'unnamed',
					size: att.size,
				}
			});

			if (!existing) {
				const saved = await saveAttachment(
					att.content,
					att.filename || 'unnamed',
					mail.id,
					att.contentType
				);

				await prisma.attachment.create({
					data: {
						mailId: mail.id,
						filename: saved.filename,
						path: saved.path,
						size: saved.size,
						mimeType: saved.mimeType,
						cid: att.cid,
					}
				});
			}
		}
	}
}
