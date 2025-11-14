// Lädt .env.local für lokale Ausführung
// eslint-disable-next-line @typescript-eslint/no-var-requires
require('dotenv').config({ path: '.env.local' });

import { syncMails } from '@/lib/mail/sync';

async function main() {
	const res = await syncMails();
	console.log('Mail Sync Ergebnis:', res);
}

main().catch((err) => {
	console.error('Mail Sync Fehler:', err);
	process.exit(1);
});


