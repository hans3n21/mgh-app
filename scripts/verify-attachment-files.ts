/**
 * Prueft, ob alle persistierten Anhaenge mit local:-Pfad unter der aktuellen
 * Dateiwurzel (FILES_ROOT bzw. Projektverzeichnis) tatsaechlich vorhanden sind.
 *
 * Nach dem NAS-Umzug ist das der schnelle Gesundheitscheck: taucht hier etwas
 * als FEHLT auf, zeigt ein Auftragsbild oder Mail-Anhang ins Leere.
 *
 * Usage: npm run files:verify
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
require('dotenv').config({ path: '.env.local' });

import fs from 'fs';
import { prisma } from '@/lib/prisma';
import { filesRoot, resolveFilesPath } from '@/lib/files-root';

async function main() {
	console.log(`Dateiwurzel: ${filesRoot()}\n`);

	const atts = await prisma.attachment.findMany({
		where: { isPersisted: true, path: { startsWith: 'local:' } },
		select: { id: true, path: true, filename: true, mailId: true },
	});

	const missing: typeof atts = [];
	for (const att of atts) {
		const abs = resolveFilesPath(att.path!.slice(6));
		if (!abs || !fs.existsSync(abs)) missing.push(att);
	}

	console.log(`Anhaenge mit local:-Pfad: ${atts.length}`);
	console.log(`vorhanden:                ${atts.length - missing.length}`);
	console.log(`FEHLT:                    ${missing.length}`);

	if (missing.length) {
		// Welche Auftraege betrifft das? Auftragsbilder verweisen per API-Pfad.
		const apiPaths = missing.map((m) => `/api/attachments/${m.id}`);
		const images = await prisma.orderImage.findMany({
			where: { path: { in: apiPaths } },
			select: { orderId: true, path: true },
		});
		const byAttachment = new Map(images.map((i) => [i.path, i.orderId]));

		console.log('');
		for (const m of missing) {
			const orderId = byAttachment.get(`/api/attachments/${m.id}`);
			console.log(`  ${m.id}  ${m.path}${orderId ? `  -> Auftrag ${orderId}` : ''}`);
		}
		process.exitCode = 1;
	}
}

main().finally(() => prisma.$disconnect());
