/**
 * Papierkorb-Probelauf: zaehlt, wie viele Papierkorb-Mails in welche
 * Kategorie fallen (behalten / pruefen / Loeschkandidat).
 *
 * Nur Lesen - es wird NICHTS geloescht oder veraendert.
 * Liest nur Kopfdaten (Absender, Empfaenger, Zuordnung), keine Mailtexte;
 * laeuft deshalb auch auf dem NAS in Sekunden.
 *
 *   npm run mail:trash-report
 *   npm run mail:trash-report -- --top=25     (mehr Absender-Domains je Kategorie)
 *
 * Die Einordnung steht in lib/mail/trashReport.ts.
 */
import 'dotenv/config';
import { prisma } from '@/lib/prisma';
import { TRASH_FOLDER_CANDIDATES, isTrashFolderName } from '@/lib/mail/folders';
import {
	TRASH_CATEGORY_INFO,
	TRASH_CATEGORY_ORDER,
	addressDomain,
	classifyTrashMail,
	normalizeAddress,
	type TrashCategory,
} from '@/lib/mail/trashReport';

const VERDICT_LABEL = { behalten: 'behalten', pruefen: 'pruefen', loeschkandidat: 'Loeschkandidat' } as const;

function formatNumber(value: number): string {
	return value.toLocaleString('de-DE');
}

function formatDate(value: Date | null): string {
	return value ? value.toISOString().slice(0, 10) : '-';
}

function parseTop(): number {
	const arg = process.argv.find((value) => value.startsWith('--top='));
	const parsed = arg ? Number(arg.split('=')[1]) : NaN;
	return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 15;
}

async function main() {
	const top = parseTop();

	const folderCounts = await prisma.mail.groupBy({
		by: ['folder'],
		where: { isDeleted: false },
		_count: { _all: true },
	});
	const totalMails = folderCounts.reduce((sum, row) => sum + row._count._all, 0);
	const trashFolders = folderCounts
		.filter((row) => TRASH_FOLDER_CANDIDATES.includes(row.folder) || isTrashFolderName(row.folder))
		.sort((a, b) => b._count._all - a._count._all);

	console.log('Papierkorb-Probelauf (nur Lesen, es wird nichts geloescht)\n');
	if (trashFolders.length === 0) {
		console.log('Kein Papierkorb-Ordner gefunden.');
		return;
	}
	console.log('Als Papierkorb gezaehlte Ordner:');
	for (const row of trashFolders) {
		console.log(`  ${row.folder.padEnd(32)} ${formatNumber(row._count._all).padStart(8)}`);
	}

	const [customers, accounts, sentTo, linked] = await Promise.all([
		prisma.customer.findMany({ select: { email: true, additionalEmails: true } }),
		prisma.mailAccount.findMany({ select: { email: true } }),
		// Adressen, an die aus einem eigenen Postfach geschrieben wurde.
		prisma.$queryRaw<{ address: string }[]>`
			SELECT DISTINCT lower(m."toEmail") AS address
			FROM "Mail" m
			JOIN "MailAccount" a ON lower(a.email) = lower(m."fromEmail")
			WHERE m."toEmail" IS NOT NULL`,
		// Adressen aus Mails, die schon einmal einem Auftrag/Kunden zugeordnet wurden.
		prisma.$queryRaw<{ address: string }[]>`
			SELECT DISTINCT lower(address) AS address
			FROM "Mail" m, unnest(ARRAY[m."fromEmail", m."toEmail", m."replyToEmail"]) AS address
			WHERE (m."orderId" IS NOT NULL OR m."customerId" IS NOT NULL) AND address IS NOT NULL`,
	]);

	const toSet = (values: Array<string | null | undefined>) =>
		new Set(values.map(normalizeAddress).filter((value): value is string => !!value));
	const ctx = {
		customerAddresses: toSet(customers.flatMap((c) => [c.email, ...c.additionalEmails])),
		ownAddresses: toSet(accounts.map((a) => a.email)),
		contactAddresses: toSet([...sentTo, ...linked].map((row) => row.address)),
	};

	const trashMails = await prisma.mail.findMany({
		where: { isDeleted: false, folder: { in: trashFolders.map((row) => row.folder) } },
		select: {
			fromEmail: true,
			toEmail: true,
			replyToEmail: true,
			orderId: true,
			customerId: true,
			date: true,
			_count: { select: { attachments: true } },
		},
	});

	type Bucket = { count: number; withAttachments: number; oldest: Date | null; newest: Date | null; domains: Map<string, number> };
	const buckets = new Map<TrashCategory, Bucket>(
		TRASH_CATEGORY_ORDER.map((category) => [category, { count: 0, withAttachments: 0, oldest: null, newest: null, domains: new Map() }]),
	);
	for (const mail of trashMails) {
		const bucket = buckets.get(classifyTrashMail(mail, ctx))!;
		bucket.count += 1;
		if (mail._count.attachments > 0) bucket.withAttachments += 1;
		if (!bucket.oldest || mail.date < bucket.oldest) bucket.oldest = mail.date;
		if (!bucket.newest || mail.date > bucket.newest) bucket.newest = mail.date;
		const domain = addressDomain(mail.fromEmail) ?? '(ohne Absender)';
		bucket.domains.set(domain, (bucket.domains.get(domain) ?? 0) + 1);
	}

	const share = totalMails > 0 ? Math.round((trashMails.length / totalMails) * 100) : 0;
	console.log(`\nMails im Papierkorb: ${formatNumber(trashMails.length)} von ${formatNumber(totalMails)} (${share} %)\n`);

	console.log(`${'Kategorie'.padEnd(62)}${'Mails'.padStart(8)}${'m. Anhang'.padStart(11)}  ${'aeltester'.padEnd(11)}${'neuester'.padEnd(11)}Einschaetzung`);
	const totals = { behalten: 0, pruefen: 0, loeschkandidat: 0 };
	for (const category of TRASH_CATEGORY_ORDER) {
		const bucket = buckets.get(category)!;
		const info = TRASH_CATEGORY_INFO[category];
		totals[info.verdict] += bucket.count;
		console.log(
			`${info.label.padEnd(62)}${formatNumber(bucket.count).padStart(8)}${formatNumber(bucket.withAttachments).padStart(11)}  `
			+ `${formatDate(bucket.oldest).padEnd(11)}${formatDate(bucket.newest).padEnd(11)}${VERDICT_LABEL[info.verdict]}`,
		);
	}
	console.log(`\nSumme: behalten ${formatNumber(totals.behalten)} | pruefen ${formatNumber(totals.pruefen)} | Loeschkandidaten ${formatNumber(totals.loeschkandidat)}`);

	// Nur Domains, keine vollstaendigen Adressen: reicht, um Newsletter- und
	// Spam-Absender zu erkennen, und gibt keine Kundenadressen aus.
	for (const category of TRASH_CATEGORY_ORDER) {
		if (TRASH_CATEGORY_INFO[category].verdict === 'behalten') continue;
		const bucket = buckets.get(category)!;
		if (bucket.count === 0) continue;
		console.log(`\nHaeufigste Absender-Domains - ${TRASH_CATEGORY_INFO[category].label}:`);
		const ranked = [...bucket.domains.entries()].sort((a, b) => b[1] - a[1]).slice(0, top);
		for (const [domain, count] of ranked) {
			console.log(`  ${formatNumber(count).padStart(7)}  ${domain}`);
		}
	}
}

main()
	.catch((error) => {
		console.error('Papierkorb-Probelauf fehlgeschlagen:', error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	})
	.finally(() => prisma.$disconnect());
