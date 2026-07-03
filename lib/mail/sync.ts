import { simpleParser, type ParsedMail, type AddressObject } from 'mailparser';
import type { FetchMessageObject } from 'imapflow';
import { prisma } from '@/lib/prisma';
import { getImapClient } from './client';
import { computeThreadId } from './threading';
import { findCustomerForEmail } from './customer';
import { parseMail } from './parseMail';
import linkMailArtifactsToOrder from './linkArtifacts';
import { extractAndStore } from './extraction';
import { stripQuotedContent } from './stripQuotedContent';
import type { MailAccount } from '@prisma/client';

const BATCH_SIZE = 10;

export type FolderSyncResult = {
	folder: string;
	success: boolean;
	processed: number;
	error?: string;
};

export type AccountSyncResult = {
	accountId: string;
	accountEmail: string;
	success: boolean;
	folders: FolderSyncResult[];
};

export type MailSyncResult = {
	success: boolean;
	accounts: AccountSyncResult[];
	totalProcessed: number;
	errorCount: number;
};

export type MailSyncProgress = {
	totalAccounts: number;
	completedAccounts: number;
	currentAccountId: string | null;
	currentAccountEmail: string | null;
	currentFolder: string | null;
	totalProcessed: number;
	errorCount: number;
};

type SyncOptions = {
	onProgress?: (progress: MailSyncProgress) => void;
	accountIds?: string[];
	folders?: string[];
};

function extractOrderIdFromSubject(subject: string): string | null {
	// Supports both "[ORD-2026-001]" and "ORD-2026-001" in subject lines.
	const match = subject.match(/(?:\[)?\b(ORD-\d{4}-\d{3,})\b(?:\])?/i);
	return match?.[1]?.toUpperCase() ?? null;
}

/**
 * Public helper used by scripts and API routes.
 * Currently just syncs all active accounts and returns a simple status object.
 */
export async function syncMails(options?: SyncOptions) {
	const accounts = await syncAllAccounts(options);
	const totalProcessed = accounts.reduce(
		(sum, account) => sum + account.folders.reduce((fSum, folder) => fSum + folder.processed, 0),
		0
	);
	const errorCount = accounts.reduce(
		(sum, account) => sum + account.folders.filter((f) => !f.success).length,
		0
	);
	return {
		success: errorCount === 0,
		accounts,
		totalProcessed,
		errorCount,
	};
}

/**
 * Guarded variant for API usage – logs errors and rethrows for HTTP handling.
 */
export async function guardedSyncMails(options?: SyncOptions) {
	try {
		return await syncMails(options);
	} catch (error) {
		console.error('guardedSyncMails: sync failed', error);
		throw error;
	}
}

// Prozessweiter Mutex, den sich API-Route und Hintergrund-Worker teilen —
// sonst koennten beide gleichzeitig auf denselben IMAP-Verbindungen arbeiten.
let activeSync: Promise<MailSyncResult> | null = null;

export function isSyncActive() {
	return activeSync !== null;
}

/**
 * Fuehrt einen Sync aus, wenn gerade keiner laeuft. Gibt null zurueck, wenn
 * bereits ein anderer Lauf aktiv ist (Aufrufer entscheidet: skip oder 409).
 */
export async function runExclusiveSync(options?: SyncOptions): Promise<MailSyncResult | null> {
	if (activeSync) return null;
	activeSync = syncMails(options);
	try {
		return await activeSync;
	} finally {
		activeSync = null;
	}
}

/**
 * Main entry point: Syncs all active accounts.
 */
export async function syncAllAccounts(options?: SyncOptions) {
	const accountIds = options?.accountIds?.filter(Boolean) ?? [];
	const accounts = await prisma.mailAccount.findMany({
		where: {
			isActive: true,
			...(accountIds.length > 0 ? { id: { in: accountIds } } : {}),
		},
	});
	const results: AccountSyncResult[] = [];
	let totalProcessed = 0;
	let errorCount = 0;

	const reportProgress = (
		completedAccounts: number,
		currentAccount: MailAccount | null,
		currentFolder: string | null
	) => {
		options?.onProgress?.({
			totalAccounts: accounts.length,
			completedAccounts,
			currentAccountId: currentAccount?.id ?? null,
			currentAccountEmail: currentAccount?.email ?? null,
			currentFolder,
			totalProcessed,
			errorCount,
		});
	};

	reportProgress(0, null, null);

	for (let i = 0; i < accounts.length; i++) {
		const account = accounts[i];
		try {
			const accountResult = await syncAccount(account, (folderResult) => {
				totalProcessed += folderResult.processed;
				if (!folderResult.success) errorCount += 1;
				reportProgress(i, account, folderResult.folder);
			}, options?.folders);
			results.push(accountResult);
			reportProgress(i + 1, account, null);
		} catch (error) {
			console.error(`Error syncing account ${account.email}:`, error);
			errorCount += 1;
			results.push({
				accountId: account.id,
				accountEmail: account.email,
				success: false,
				folders: [{
					folder: 'ACCOUNT',
					success: false,
					processed: 0,
					error: error instanceof Error ? error.message : String(error),
				}],
			});
			reportProgress(i + 1, account, null);
		}
	}
	return results;
}

/**
 * Syncs INBOX, Sent, and Trash for a specific account.
 */
export async function syncAccount(
	account: MailAccount,
	onFolderDone?: (result: FolderSyncResult) => void,
	requestedFolders?: string[]
) {
	const folders = (requestedFolders && requestedFolders.length > 0)
		? Array.from(new Set(requestedFolders.filter(Boolean)))
		: ['INBOX', 'Sent', 'Trash']; // Standard folders, might need mapping
	// Note: 'Sent' might be 'Sent Items' or similar depending on server. 
	// For now assuming standard names or handled by imapflow/server capability.
	const folderResults: FolderSyncResult[] = [];

	for (const folder of folders) {
		try {
			const result = await syncFolder(account, folder);
			folderResults.push(result);
			onFolderDone?.(result);
		} catch (error) {
			console.error(`Error syncing folder ${folder} for ${account.email}:`, error);
			const failedResult: FolderSyncResult = {
				folder,
				success: false,
				processed: 0,
				error: error instanceof Error ? error.message : String(error),
			};
			folderResults.push(failedResult);
			onFolderDone?.(failedResult);
		}
	}

	return {
		accountId: account.id,
		accountEmail: account.email,
		success: folderResults.every((f) => f.success),
		folders: folderResults,
	} satisfies AccountSyncResult;
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
		const currentUidValidity = client.mailbox ? (client.mailbox as any).uidValidity : undefined;
		if (cursor?.value) {
			try {
				const parsed = JSON.parse(cursor.value);
				// Wenn UIDVALIDITY sich geändert hat, sind alte UIDs ungültig → Cursor ignorieren
				if (currentUidValidity && parsed.uidValidity && String(parsed.uidValidity) !== String(currentUidValidity)) {
					lastUid = 0; // Erzwinge kompletten Neuabruf
				} else {
					lastUid = parsed.lastUid || 0;
				}
			} catch { }
		}

		// Fetch new messages
		// Fetching from lastUid + 1 to *
		// If lastUid is 0, fetch all (or maybe limit to recent if mailbox is huge? 
		// For now, let's assume we want everything initially, but maybe batched)

		if (!client.mailbox || client.mailbox.exists === 0) {
			// Auch bei leerem Ordner Reconcile ausführen (markiert alle lokalen Mails als gelöscht)
			await reconcileFolder(client, account.id, folderName);
			return { folder: folderName, success: true, processed: 0 } satisfies FolderSyncResult;
		}

		// Prüfe ob es überhaupt UIDs über dem Cursor gibt, bevor wir FETCH aufrufen.
		// Manche Server (z.B. lima-city) werfen einen Fehler bei ungültigen UID-Ranges.
		const nextUid = lastUid + 1;
		const mailboxUidNext = (client.mailbox as any)?.uidNext;
		if (mailboxUidNext && nextUid >= mailboxUidNext) {
			// Keine neuen Nachrichten – Reconcile trotzdem ausführen!
			// Sonst würden verschobene Mails (z.B. INBOX → Papierkorb in Outlook) nie aus der App verschwinden.
			await reconcileFolder(client, account.id, folderName);
			return { folder: folderName, success: true, processed: 0 } satisfies FolderSyncResult;
		}

		// Nur tatsaechlich fehlende Mails laden: Wir holen die UID-Liste vom Server
		// (billig, nur Zahlen) und gleichen sie mit den bereits gespeicherten UIDs
		// in der DB ab. Heruntergeladen wird nur die Differenz — in Chunks mit
		// Zwischenspeicherung des Cursors, damit ein Socket-Timeout bei grossen
		// Ordnern den Fortschritt nicht verwirft (sonst Endlosschleife, in der ein
		// grosser Ordner nie aufholt). Netter Nebeneffekt: Aendert sich die
		// UIDVALIDITY (Server-Neunummerierung), passen die DB-UIDs nicht mehr zu
		// den Server-UIDs und es wird automatisch alles neu geladen — korrekt.
		// Klein halten: bei langsamen/instabilen Verbindungen muss ein Chunk
		// zuverlaessig vor dem Socket-Timeout durchlaufen.
		const CHUNK_SIZE = 100;
		let processed = 0;

		const persistCursor = async (uid: number) => {
			const cursorValue: Record<string, unknown> = { lastUid: uid };
			if (currentUidValidity) cursorValue.uidValidity = String(currentUidValidity);
			await prisma.systemSetting.upsert({
				where: { key: cursorKey },
				update: { value: JSON.stringify(cursorValue) },
				create: { key: cursorKey, value: JSON.stringify(cursorValue) },
			});
		};

		const serverUidsRaw = await client.search({ uid: `${nextUid}:*` }, { uid: true });
		// Manche Server beantworten "x:*" mit der letzten Mail, wenn x > hoechste UID — rausfiltern.
		const serverUids = (Array.isArray(serverUidsRaw) ? serverUidsRaw : [])
			.filter((uid) => uid > lastUid)
			.sort((a, b) => a - b);

		if (serverUids.length > 0) {
			const known = await prisma.mail.findMany({
				where: { accountId: account.id, folder: folderName, uid: { gt: lastUid } },
				select: { uid: true },
			});
			const knownUids = new Set(known.map((m) => m.uid));
			// Absteigend: die neuesten Mails zuerst laden. Bricht die Verbindung ab,
			// sind die relevantesten Mails schon da; bereits geladene UIDs werden
			// beim naechsten Lauf ueber knownUids uebersprungen.
			const missingUids = serverUids.filter((uid) => !knownUids.has(uid)).reverse();

			for (let i = 0; i < missingUids.length; i += CHUNK_SIZE) {
				const chunk = missingUids.slice(i, i + CHUNK_SIZE);
				const messageGenerator = client.fetch(
					chunk.join(','),
					{
						envelope: true,
						source: true, // We need source to parse
						uid: true,
						flags: true,
						internalDate: true,
					},
					{ uid: true } // Forces UID FETCH instead of sequence-number FETCH
				);

				for await (const message of messageGenerator) {
					try {
						await ingestMessage(account, message, folderName);
						processed += 1;
					} catch (err) {
						console.error(`Failed to ingest message UID ${message.uid} in ${folderName}:`, err);
					}
				}
			}

			// Cursor erst nach vollstaendigem Durchlauf setzen: Bei absteigender
			// Verarbeitung waere ein frueherer Cursor falsch (unter ihm laegen noch
			// Luecken, die die Suche dann nie wieder erfassen wuerde). Bricht der
			// Lauf vorher ab, bleibt der Cursor stehen — bereits geladene Mails
			// werden beim naechsten Lauf ueber knownUids uebersprungen.
			await persistCursor(serverUids[serverUids.length - 1]);
		}

		// Reconcile: mark locally stored mails as deleted if they no longer exist on the server.
		// We fetch all UIDs currently in this folder from the server and compare against DB.
		await reconcileFolder(client, account.id, folderName);

		return { folder: folderName, success: true, processed } satisfies FolderSyncResult;

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
	// IMPORTANT: Fallback must be stable across sync runs, otherwise mails without
	// Message-ID create duplicates on every full/incremental resync.
	const stableFallbackMessageId = `no-id-${account.id}-${folderName}-${message.uid}`;
	const messageId = parsed.messageId || message.envelope.messageId || stableFallbackMessageId;
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

	// Primary recipient (for display in sent folder)
	const toAddr = parsed.to && !Array.isArray(parsed.to) ? parsed.to.value[0] : null;
	const toEmail = toAddr?.address || null;
	const toName = toAddr?.name || null;

	const to = getAddress(parsed.to);
	const cc = getAddress(parsed.cc);
	const bcc = getAddress(parsed.bcc);

	const parsedDate = parsed.date instanceof Date && !Number.isNaN(parsed.date.getTime()) ? parsed.date : null;
	const internalDate = message.internalDate instanceof Date && !Number.isNaN(message.internalDate.getTime())
		? message.internalDate
		: null;
	const envelopeDateCandidate = (message.envelope as any)?.date;
	const envelopeDate = envelopeDateCandidate instanceof Date && !Number.isNaN(envelopeDateCandidate.getTime())
		? envelopeDateCandidate
		: null;
	const date = parsedDate ?? internalDate ?? envelopeDate ?? new Date();
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

	// 2. Order Linking (Subject)
	// Supports order id in subject with and without brackets.
	let orderId: string | null = null;
	const subjectOrderId = extractOrderIdFromSubject(subject);
	if (subjectOrderId) {
		const exists = await prisma.order.findUnique({ where: { id: subjectOrderId } });
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

	// 3b. Fallback: Mail von gleicher Adresse wie order.customer.email → Auftrag verlinken (nur INBOX)
	if (!orderId && fromEmail && folderName === 'INBOX') {
		const orderByCustomerEmail = await prisma.order.findFirst({
			where: {
				customer: {
					email: { equals: fromEmail, mode: 'insensitive' },
				},
			},
			orderBy: { createdAt: 'desc' },
			select: { id: true },
		});
		if (orderByCustomerEmail) {
			orderId = orderByCustomerEmail.id;
		}
	}

	// 4. Upsert Mail
	// We use upsert to handle "moves" (e.g. Inbox -> Trash).
	// Composite unique key (accountId, messageId) ensures per-account identity.
	const mail = await prisma.mail.upsert({
		where: { accountId_messageId: { accountId: account.id, messageId } },
		update: {
			subject,
			fromEmail,
			fromName,
			toEmail,
			toName,
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
			isRead: message.flags ? message.flags.has('\\Seen') : false,
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
			toEmail,
			toName,
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

	// 4a-Benachrichtigung: Neue INBOX-Mail zu einem zugewiesenen Auftrag →
	// Bearbeiter informieren. Nur bei frisch angelegten Mails (createdAt ==
	// updatedAt), damit Ordner-Moves/Re-Syncs nicht erneut benachrichtigen,
	// und nur bei aktuellen Mails (Backfill alter Bestände soll still bleiben).
	if (
		orderId &&
		folderName === 'INBOX' &&
		mail.createdAt.getTime() === mail.updatedAt.getTime() &&
		date && Date.now() - new Date(date).getTime() < 7 * 86_400_000
	) {
		try {
			const orderInfo = await prisma.order.findUnique({
				where: { id: orderId },
				select: { title: true, assigneeId: true },
			});
			if (orderInfo?.assigneeId) {
				const { notify } = await import('@/lib/notify');
				await notify({
					userId: orderInfo.assigneeId,
					type: 'order_mail',
					title: `Neue Mail zu ${orderInfo.title}`,
					body: subject || fromEmail,
					href: `/app/orders/${orderId}`,
				});
			}
		} catch {
			// Benachrichtigung darf den Sync nie stören
		}
	}

	// 4b. If this mail resolves an order for a thread, propagate to all thread mails.
	// This ensures INBOX/Sent/Trash entries of the same conversation show up on the order.
	if (orderId && threadResult.threadId) {
		await prisma.mail.updateMany({
			where: {
				threadId: threadResult.threadId,
				orderId: null,
			},
			data: { orderId },
		});
	}

	// 5. Handle Attachments — only metadata, no file storage.
	// Files are fetched on-demand from IMAP when the attachment is accessed.
	// They get persisted permanently only when the mail is linked to an order
	// (see linkArtifacts.ts → persistAttachmentsForMail).
	if (parsed.attachments && parsed.attachments.length > 0) {
		for (const att of parsed.attachments) {
			const filename = att.filename || 'unnamed';
			const size = att.size;
			const mimeType = att.contentType;
			const cid = att.cid ?? null;

			const existing = await prisma.attachment.findFirst({
				where: cid
					? {
						mailId: mail.id,
						cid,
					}
					: {
						mailId: mail.id,
						filename,
						size,
						mimeType,
					}
			});

			if (!existing) {
				await prisma.attachment.create({
					data: {
						mailId: mail.id,
						filename,
						size,
						mimeType,
						cid,
						// No path — file not stored yet.
						isPersisted: false,
						imapFolder: folderName,
						imapUid: message.uid,
					}
				});
			} else if (existing.imapFolder !== folderName || existing.imapUid !== message.uid) {
				// Message moves between folders can change UID on many IMAP servers.
				// Keep attachment fetch pointers in sync so on-demand loading keeps working.
				await prisma.attachment.update({
					where: { id: existing.id },
					data: {
						imapFolder: folderName,
						imapUid: message.uid,
					},
				});
			}
		}
	}

	// 6. Entity-Extraktion — only on the FRESH content (no quoted history).
	// Quoted sections carry PII from previous messages / senders; running
	// extraction on them would silently attach that foreign PII to this mail
	// record, which is a data-protection issue.
	try {
		const { freshContent } = stripQuotedContent(mail.text ?? '');
		await extractAndStore(mail.id, freshContent, mail.html);
	} catch (extractErr) {
		console.error(`Entity extraction failed for mail ${mail.id}:`, extractErr);
	}

	// 7. Bei verlinktem Auftrag: Nachricht + Anhänge in Kommunikationsverlauf eintragen
	if (mail.orderId) {
		try {
			await linkMailArtifactsToOrder(mail.id, mail.orderId);
		} catch (linkErr) {
			console.error(`Failed to link mail ${mail.id} to order ${mail.orderId}:`, linkErr);
		}
	}
}

/**
 * Reconcile: compare the server's current UIDs in the folder with our local DB.
 * Mails that exist locally (as this folder, not deleted) but are absent from the
 * server get marked as isDeleted so they disappear from the inbox view.
 * Existing order/customer links on those mails are intentionally preserved.
 */
async function reconcileFolder(
	client: Awaited<ReturnType<typeof getImapClient>>,
	accountId: string,
	folderName: string
) {
	try {
		// Fetch all UIDs present on the server for this folder.
		const raw = await client.search({ all: true }, { uid: true });
		const serverUids: number[] = Array.isArray(raw) ? raw.map((u) => Number(u)) : [];
		const serverUidSet = new Set(serverUids);

		// Find all non-deleted local mails for this account + folder.
		const localMails = await prisma.mail.findMany({
			where: {
				accountId,
				folder: folderName,
				isDeleted: false,
			},
			select: { id: true, uid: true },
		});

		const missingIds = localMails
			.filter((m) => m.uid > 0 && !serverUidSet.has(m.uid))
			.map((m) => m.id);

		if (missingIds.length > 0) {
			await prisma.mail.updateMany({
				where: { id: { in: missingIds } },
				data: { isDeleted: true },
			});
			console.log(`[reconcile] ${folderName}@${accountId}: marked ${missingIds.length} mails as deleted`);
		}
	} catch (err) {
		// Reconcile is best-effort; never abort a successful sync because of a reconcile error.
		console.warn(`[reconcile] Failed for ${folderName}@${accountId}:`, err);
	}
}
