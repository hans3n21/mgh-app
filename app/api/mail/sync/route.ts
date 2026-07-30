import { NextRequest, NextResponse } from 'next/server';
import { runExclusiveSync } from '@/lib/mail/sync';
import { auth } from '@/lib/auth';

let syncInFlight: Promise<Awaited<ReturnType<typeof runExclusiveSync>>> | null = null;
let syncMeta: {
	running: boolean;
	fullSync: boolean;
	startedAt: string | null;
	lastFinishedAt: string | null;
	totalAccounts: number;
	completedAccounts: number;
	currentAccountEmail: string | null;
	currentFolder: string | null;
	totalProcessed: number;
	errorCount: number;
} = {
	running: false,
	fullSync: false,
	startedAt: null,
	lastFinishedAt: null,
	totalAccounts: 0,
	completedAccounts: 0,
	currentAccountEmail: null,
	currentFolder: null,
	totalProcessed: 0,
	errorCount: 0,
};

// Ensure .env.local is loaded in API routes
if (typeof window === 'undefined' && process.env.NODE_ENV === 'development') {
	try {
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		require('dotenv').config({ path: '.env.local' });
	} catch (e) {
		// Ignore if dotenv is not available
	}
}

export async function POST(req: NextRequest) {
	try {
		const session = await auth();
		if (!session) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		if (syncInFlight) {
			return NextResponse.json(
				{
					error: 'Synchronisation läuft bereits',
					advice: 'Bitte warten, bis der aktuelle Lauf abgeschlossen ist.',
					running: true,
					fullSync: syncMeta.fullSync,
					startedAt: syncMeta.startedAt,
					totalAccounts: syncMeta.totalAccounts,
					completedAccounts: syncMeta.completedAccounts,
					currentAccountEmail: syncMeta.currentAccountEmail,
					currentFolder: syncMeta.currentFolder,
					totalProcessed: syncMeta.totalProcessed,
					errorCount: syncMeta.errorCount,
				},
				{ status: 409 }
			);
		}

		// Optional: fullSync=true im Body setzen, um den Sync-Cursor zurückzusetzen (lädt alle Mails neu)
		const body = await req.json().catch(() => ({}));
		const fullSync = body?.fullSync === true;
		const accountIds = Array.isArray(body?.accountIds)
			? body.accountIds.filter((value: unknown): value is string => typeof value === 'string' && value.trim().length > 0)
			: [];
		const folders = Array.isArray(body?.folders)
			? body.folders.filter((value: unknown): value is string => typeof value === 'string' && value.trim().length > 0)
			: [];

		console.log('🔄 API /mail/sync: Starting sync...', fullSync ? '(Full Sync – Cursor wird zurückgesetzt)' : '');
		
		// Prüfe ob aktive Mail-Accounts vorhanden sind
		const { prisma } = await import('@/lib/prisma');
		const activeAccounts = await prisma.mailAccount.findMany({
			where: {
				isActive: true,
				...(accountIds.length > 0 ? { id: { in: accountIds } } : {}),
			},
			select: { id: true, email: true, name: true },
		});
		
		if (activeAccounts.length === 0) {
			console.error('❌ API /mail/sync: No active mail accounts found');
			return NextResponse.json({ 
				error: 'Keine aktiven Mail-Accounts gefunden', 
				advice: 'Bitte erstellen Sie einen Mail-Account in den Einstellungen.' 
			}, { status: 400 });
		}
		
		console.log(`✅ API /mail/sync: Found ${activeAccounts.length} active account(s):`, 
			activeAccounts.map(a => `${a.name} (${a.email})`).join(', '));

		// Bei Full Sync: Sync-Cursor löschen, damit alle Mails neu abgerufen werden
		if (fullSync) {
			const deleted = await prisma.systemSetting.deleteMany({
				where: { key: { startsWith: 'sync:' } },
			});
			console.log(`🔄 API /mail/sync: Cursor zurückgesetzt (${deleted.count} Einträge gelöscht)`);
		}

		syncMeta = {
			...syncMeta,
			running: true,
			fullSync,
			startedAt: new Date().toISOString(),
			totalAccounts: 0,
			completedAccounts: 0,
			currentAccountEmail: null,
			currentFolder: null,
			totalProcessed: 0,
			errorCount: 0,
		};

		const exclusiveRun = runExclusiveSync({
			accountIds: accountIds.length > 0 ? accountIds : undefined,
			folders: folders.length > 0 ? folders : undefined,
			onProgress: (progress) => {
				syncMeta = {
					...syncMeta,
					totalAccounts: progress.totalAccounts,
					completedAccounts: progress.completedAccounts,
					currentAccountEmail: progress.currentAccountEmail,
					currentFolder: progress.currentFolder,
					totalProcessed: progress.totalProcessed,
					errorCount: progress.errorCount,
				};
			},
		});
		syncInFlight = exclusiveRun;
		const result = await exclusiveRun;
		if (result === null) {
			// Der Hintergrund-Worker synchronisiert gerade (prozessweiter Mutex).
			return NextResponse.json(
				{ error: 'Synchronisation läuft bereits (Hintergrund-Worker)', running: true },
				{ status: 409 }
			);
		}
		const skipped = result.accounts.reduce(
			(sum, a) => sum + a.folders.filter((f) => f.skipped).length,
			0
		);
		console.log(
			`✅ API /mail/sync: fertig — ${result.totalProcessed} neu, ${result.totalRemoved} entfernt, ${skipped} Ordner unveraendert (uebersprungen), ${result.errorCount} Fehler`
		);
		return NextResponse.json(
			{
				...result,
				running: false,
				fullSync,
				startedAt: syncMeta.startedAt,
				finishedAt: new Date().toISOString(),
				totalAccounts: syncMeta.totalAccounts,
				completedAccounts: syncMeta.totalAccounts,
				currentAccountEmail: null,
				currentFolder: null,
				totalProcessed: result.totalProcessed,
				totalRemoved: result.totalRemoved,
				// Der Client darf sich das Neuladen der Liste sparen, wenn nichts
				// passiert ist — bei einem kurzen Abfragetakt ist das der Regelfall.
				changed: result.changed,
				skippedFolders: skipped,
				errorCount: result.errorCount,
			},
			{ status: result.success ? 200 : 207 }
		);
	} catch (err: any) {
		console.error('❌ API /mail/sync: Error:', err);
		const status = err?.status || 500;
		return NextResponse.json({ error: err?.message || 'Sync failed', details: err }, { status });
	} finally {
		syncInFlight = null;
		syncMeta = {
			...syncMeta,
			running: false,
			lastFinishedAt: new Date().toISOString(),
			currentAccountEmail: null,
			currentFolder: null,
		};
	}
}

export async function GET() {
	const session = await auth();
	if (!session) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	}

	return NextResponse.json({
		running: syncMeta.running,
		fullSync: syncMeta.fullSync,
		startedAt: syncMeta.startedAt,
		lastFinishedAt: syncMeta.lastFinishedAt,
		totalAccounts: syncMeta.totalAccounts,
		completedAccounts: syncMeta.completedAccounts,
		currentAccountEmail: syncMeta.currentAccountEmail,
		currentFolder: syncMeta.currentFolder,
		totalProcessed: syncMeta.totalProcessed,
		errorCount: syncMeta.errorCount,
	});
}
