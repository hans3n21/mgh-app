import { NextRequest, NextResponse } from 'next/server';
import { guardedSyncMails } from '@/lib/mail/sync';

// Ensure .env.local is loaded in API routes
if (typeof window === 'undefined' && process.env.NODE_ENV === 'development') {
	try {
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		require('dotenv').config({ path: '.env.local' });
	} catch (e) {
		// Ignore if dotenv is not available
	}
}

export async function POST(_req: NextRequest) {
	try {
		console.log('🔄 API /mail/sync: Starting sync...');
		
		// Check IMAP configuration
		const required = ['IMAP_HOST','IMAP_PORT','IMAP_USER','IMAP_PASSWORD','IMAP_SECURE','IMAP_TLS_REJECT_UNAUTHORIZED'] as const;
		const missing = required.filter((k) => !process.env[k] || String(process.env[k]).length === 0);
		
		if (missing.length > 0) {
			console.error('❌ API /mail/sync: Missing IMAP config:', missing);
			return NextResponse.json({ 
				error: 'IMAP not configured', 
				missing,
				advice: 'Bitte .env.local um die fehlenden IMAP_* Variablen ergänzen.' 
			}, { status: 400 });
		}
		
		// Debug: Log the actual values (without password)
		console.log('✅ API /mail/sync: IMAP config OK');
		console.log('   Host:', process.env.IMAP_HOST);
		console.log('   Port:', process.env.IMAP_PORT);
		console.log('   User:', process.env.IMAP_USER);
		console.log('   Secure:', process.env.IMAP_SECURE);
		console.log('   TLS Reject Unauthorized:', process.env.IMAP_TLS_REJECT_UNAUTHORIZED);
		console.log('   Password length:', process.env.IMAP_PASSWORD?.length || 0);
		const result = await guardedSyncMails();
		console.log('✅ API /mail/sync: Sync completed:', result);
		return NextResponse.json(result, { status: 200 });
	} catch (err: any) {
		console.error('❌ API /mail/sync: Error:', err);
		const status = err?.status || 500;
		return NextResponse.json({ error: err?.message || 'Sync failed', details: err }, { status });
	}
}


