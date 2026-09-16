// Nimmt fehlerhafte isDeleted-Markierungen zurueck: Mails, die in der DB als
// geloescht gelten, aber laut Mailserver im selben Ordner noch existieren.
//
// Hintergrund (16.09.2026): Der Sync hatte in drei Ordnern an je einem Tag
// tausende Mails als geloescht markiert, obwohl sie auf dem Server lagen, und
// sie danach nie wieder nachgeladen (siehe lib/mail/reconcilePlan.ts). Diese
// Mails fehlten im Posteingang und in der Suche.
//
// Abgeglichen wird ueber die Message-ID — robust, auch wenn der Server die
// UIDs neu vergeben hat. Zeilen ohne echte Message-ID ("no-id-…") werden
// ueber die UID verglichen. Es wird nichts heruntergeladen und nichts
// geloescht; nur isDeleted (und bei Bedarf die UID) wird korrigiert.
//
// Aufruf (aus dem Projektordner):
//   npx tsx scripts/repair-deleted-mails.ts                 nur anzeigen
//   npx tsx scripts/repair-deleted-mails.ts --apply         Markierungen zuruecknehmen
//   Optionen: --account=info@example.de  --folder=Sent  --min=50
//   (--min: Ordner mit weniger markierten Zeilen ueberspringen, Standard 1)

// require statt import: muss VOR dem Import von @/lib/prisma laufen, damit
// DATABASE_URL aus .env.local/.env gesetzt ist (ES-Imports werden vorgezogen).
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('dotenv').config({ path: '.env.local' });
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('dotenv').config();

import { prisma } from '@/lib/prisma';
import { getImapClient } from '@/lib/mail/client';

type Args = { apply: boolean; account?: string; folder?: string; min: number };

function parseArgs(argv: string[]): Args {
	const args: Args = { apply: false, min: 1 };
	for (const raw of argv) {
		if (raw === '--apply') args.apply = true;
		else if (raw.startsWith('--account=')) args.account = raw.slice('--account='.length);
		else if (raw.startsWith('--folder=')) args.folder = raw.slice('--folder='.length);
		else if (raw.startsWith('--min=')) args.min = Math.max(1, Number(raw.slice('--min='.length)) || 1);
		else throw new Error(`Unbekannte Option: ${raw}`);
	}
	return args;
}

// Message-IDs stehen mal mit, mal ohne spitze Klammern in den Daten.
function normalizeMessageId(value: string | null | undefined): string {
	return (value || '').trim().replace(/^<|>$/g, '');
}

function chunks<T>(items: T[], size: number): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
	return out;
}

async function readCursorUidValidity(accountId: string, folder: string): Promise<string | null> {
	const row = await prisma.systemSetting.findUnique({ where: { key: `sync:${accountId}:${folder}` } });
	if (!row?.value) return null;
	try {
		const parsed = JSON.parse(row.value) as { uidValidity?: string };
		return parsed.uidValidity ?? null;
	} catch {
		return null;
	}
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	console.log(args.apply
		? '>> APPLY: Markierungen werden zurueckgenommen.'
		: '>> Nur Anzeige. Mit --apply werden die Markierungen zurueckgenommen.');

	const accounts = await prisma.mailAccount.findMany({ where: { isActive: true }, orderBy: { email: 'asc' } });
	let totalRestored = 0;
	let totalWouldRestore = 0;

	for (const account of accounts) {
		if (args.account && account.email.toLowerCase() !== args.account.toLowerCase()) continue;

		const groups = await prisma.mail.groupBy({
			by: ['folder'],
			where: { accountId: account.id, isDeleted: true },
			_count: { _all: true },
		});
		const folders = groups
			.filter((g) => g._count._all >= args.min)
			.map((g) => g.folder)
			.filter((f) => !args.folder || f === args.folder)
			.sort();
		if (folders.length === 0) continue;

		console.log(`\n=== ${account.email} ===`);
		const client = await getImapClient(account);
		try {
			for (const folder of folders) {
				const flaggedRows = await prisma.mail.findMany({
					where: { accountId: account.id, folder, isDeleted: true },
					select: { id: true, uid: true, messageId: true },
				});
				const activeRows = await prisma.mail.findMany({
					where: { accountId: account.id, folder, isDeleted: false },
					select: { messageId: true, uid: true },
				});

				let lock: Awaited<ReturnType<typeof client.getMailboxLock>>;
				try {
					lock = await client.getMailboxLock(folder, { readOnly: true });
				} catch (error) {
					console.log(`\n${folder}: Ordner laesst sich nicht oeffnen (${(error as Error).message}); ${flaggedRows.length} markierte Zeilen bleiben unveraendert.`);
					continue;
				}

				try {
					const mailbox = client.mailbox;
					const exists = mailbox ? mailbox.exists : 0;
					const serverUidValidity = mailbox && mailbox.uidValidity !== undefined ? String(mailbox.uidValidity) : null;
					const cursorUidValidity = await readCursorUidValidity(account.id, folder);

					// Alle Nachrichten des Ordners: nur UID + Envelope, kein Inhalt.
					const uidByMessageId = new Map<string, number>();
					const serverUids = new Set<number>();
					if (exists > 0) {
						for await (const msg of client.fetch('1:*', { uid: true, envelope: true })) {
							serverUids.add(msg.uid);
							const mid = normalizeMessageId(msg.envelope?.messageId);
							if (mid) uidByMessageId.set(mid, msg.uid);
						}
					}

					const restoreSameUid: string[] = [];
					const restoreNewUid: { id: string; uid: number }[] = [];
					let gone = 0;
					for (const row of flaggedRows) {
						const serverUid = uidByMessageId.get(normalizeMessageId(row.messageId));
						if (serverUid !== undefined) {
							if (serverUid === row.uid) restoreSameUid.push(row.id);
							else restoreNewUid.push({ id: row.id, uid: serverUid });
							continue;
						}
						if (row.messageId.startsWith('no-id-') && serverUids.has(row.uid)) {
							restoreSameUid.push(row.id);
							continue;
						}
						gone += 1;
					}
					// Gegenprobe: sichtbare Zeilen, die der Server nicht (mehr) hat.
					// Die wuerde der naechste Abgleich regulaer ausblenden.
					const activeMissing = activeRows.filter((row) => {
						if (uidByMessageId.has(normalizeMessageId(row.messageId))) return false;
						return !(row.messageId.startsWith('no-id-') && serverUids.has(row.uid));
					}).length;

					const restorable = restoreSameUid.length + restoreNewUid.length;
					console.log(`\n${folder}`);
					console.log(`  Server: ${exists} Nachrichten, ${serverUids.size} UIDs gelesen, UIDVALIDITY ${serverUidValidity ?? '?'} (Cursor: ${cursorUidValidity ?? '?'})`);
					console.log(`  Lokal:  ${activeRows.length} sichtbar (davon ${activeMissing} nicht auf dem Server), ${flaggedRows.length} als geloescht markiert`);
					console.log(`  Davon auf dem Server vorhanden: ${restorable} (${restoreSameUid.length} gleiche UID, ${restoreNewUid.length} neue UID); wirklich weg: ${gone}`);

					if (serverUids.size < exists) {
						console.log(`  !! Nur ${serverUids.size} von ${exists} Nachrichten gelesen — Ordner wird nicht angefasst.`);
						continue;
					}
					if (restorable === 0) continue;

					if (!args.apply) {
						totalWouldRestore += restorable;
						continue;
					}
					for (const chunk of chunks(restoreSameUid, 500)) {
						await prisma.mail.updateMany({ where: { id: { in: chunk } }, data: { isDeleted: false } });
					}
					for (const row of restoreNewUid) {
						await prisma.mail.update({ where: { id: row.id }, data: { isDeleted: false, uid: row.uid } });
					}
					totalRestored += restorable;
					console.log(`  -> ${restorable} Mails wieder sichtbar.`);
				} finally {
					lock.release();
				}
			}
		} finally {
			try { await client.logout(); } catch { /* Verbindung ist ohnehin am Ende */ }
		}
	}

	console.log(args.apply
		? `\nFertig: ${totalRestored} Mails wieder sichtbar.`
		: `\nOhne --apply: ${totalWouldRestore} Mails wuerden wieder sichtbar.`);
}

main()
	.catch((error) => {
		console.error('Fehler:', error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
