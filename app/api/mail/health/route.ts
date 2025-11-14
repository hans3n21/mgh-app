import { NextResponse } from 'next/server';

export async function GET() {
	const required = ['IMAP_HOST','IMAP_PORT','IMAP_USER','IMAP_PASSWORD','IMAP_SECURE','IMAP_TLS_REJECT_UNAUTHORIZED'] as const;
	const missing = required.filter((k) => !process.env[k] || String(process.env[k]).length === 0);

	const imapConfigured = missing.length === 0;
	return NextResponse.json({
		imapConfigured,
		missing,
		advice: imapConfigured ? undefined : 'Bitte .env.local um die fehlenden IMAP_* Variablen ergänzen.'
	});
}


