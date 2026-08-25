/**
 * Entfernt einen Mail-Account inkl. aller zugehörigen Mails, Sync-Cursorn,
 * lokaler upload-Verzeichnisse (uploads/mail/<mailId>) und Vercel-Blob-Anhängen.
 *
 * Usage: npx tsx scripts/remove-mail-account-and-data.ts <email>
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
require('dotenv').config({ path: '.env.local' });

import fs from 'fs';
import path from 'path';
import { prisma } from '@/lib/prisma';
import { deleteAttachment } from '@/lib/mail/attachments';
import { resolveFilesPath } from '@/lib/files-root';

async function main() {
	const email = process.argv[2]?.trim().toLowerCase();
	if (!email) {
		console.error('Usage: npx tsx scripts/remove-mail-account-and-data.ts <email>');
		process.exit(1);
	}

	const account = await prisma.mailAccount.findUnique({
		where: { email },
	});

	if (!account) {
		console.error(`Kein Mail-Account mit E-Mail: ${email}`);
		process.exit(1);
	}

	console.log(`Account gefunden: ${account.name} (${account.id})`);

	const mails = await prisma.mail.findMany({
		where: { accountId: account.id },
		select: { id: true },
	});
	const mailIds = mails.map((m) => m.id);
	console.log(`Mails: ${mailIds.length}`);

	if (mailIds.length > 0) {
		const attachments = await prisma.attachment.findMany({
			where: { mailId: { in: mailIds } },
			select: { path: true },
		});

		let localFiles = 0;
		let blobs = 0;
		for (const { path: attPath } of attachments) {
			if (attPath.startsWith('local:')) {
				const rel = attPath.slice(6);
				const fullPath = resolveFilesPath(rel);
				try {
					if (fullPath && fs.existsSync(fullPath)) {
						fs.unlinkSync(fullPath);
						localFiles++;
					}
				} catch (e) {
					console.warn('Lokale Datei übersprungen:', fullPath, e);
				}
			} else if (attPath.startsWith('http://') || attPath.startsWith('https://')) {
				await deleteAttachment(attPath);
				blobs++;
			}
		}
		console.log(`Anhänge: ${attachments.length} (${localFiles} lokale Dateien, ${blobs} Blob-URLs)`);

		for (const mailId of mailIds) {
			const dir = resolveFilesPath(path.join('uploads', 'mail', mailId));
			try {
				if (dir && fs.existsSync(dir)) {
					fs.rmSync(dir, { recursive: true, force: true });
				}
			} catch (e) {
				console.warn('Upload-Ordner:', dir, e);
			}
		}

		const cursorDeleted = await prisma.systemSetting.deleteMany({
			where: { key: { startsWith: `sync:${account.id}:` } },
		});
		console.log(`Sync-Cursor gelöscht: ${cursorDeleted.count}`);

		const sug = await prisma.orderFieldSuggestion.updateMany({
			where: { mailId: { in: mailIds } },
			data: { mailId: null },
		});
		if (sug.count > 0) console.log(`OrderFieldSuggestion mailId geleert: ${sug.count}`);

		const deletedMails = await prisma.mail.deleteMany({
			where: { accountId: account.id },
		});
		console.log(`Mails aus DB gelöscht: ${deletedMails.count}`);
	} else {
		const cursorDeleted = await prisma.systemSetting.deleteMany({
			where: { key: { startsWith: `sync:${account.id}:` } },
		});
		if (cursorDeleted.count > 0) {
			console.log(`Sync-Cursor gelöscht: ${cursorDeleted.count}`);
		}
	}

	if (account.isDefault) {
		const other = await prisma.mailAccount.findFirst({
			where: { id: { not: account.id } },
		});
		if (other) {
			await prisma.mailAccount.update({
				where: { id: other.id },
				data: { isDefault: true },
			});
			console.log(`Neuer Default-Mail-Account: ${other.email}`);
		}
	}

	await prisma.mailAccount.delete({
		where: { id: account.id },
	});

	console.log(`Mail-Account entfernt: ${email}`);
}

main()
	.catch((e) => {
		console.error(e);
		process.exit(1);
	})
	.finally(() => prisma.$disconnect());
