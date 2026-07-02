/**
 * Mail-Sync-Worker — läuft im Node-Serverprozess (geladen via instrumentation.ts).
 *
 * Vorher wurde nur synchronisiert, solange jemand den Posteingang im Browser
 * offen hatte (Auto-Sync im Tab). Jetzt bleiben INBOX/Gesendet/Papierkorb auch
 * dann aktuell, wenn niemand in der App ist. Der prozessweite Mutex in
 * lib/mail/sync.ts verhindert Überlappung mit manuell ausgelösten Syncs.
 *
 * Konfiguration über Env:
 *   MAIL_SYNC_WORKER_INTERVAL_MS  Intervall in ms (Default 300000 = 5 Min,
 *                                 Minimum 60000). "0" oder "off" deaktiviert
 *                                 den Worker.
 */
export function startMailSyncWorker() {
	const g = globalThis as unknown as { __mailSyncWorkerStarted?: boolean };
	if (g.__mailSyncWorkerStarted) return;
	g.__mailSyncWorkerStarted = true;

	const raw = process.env.MAIL_SYNC_WORKER_INTERVAL_MS;
	if (raw === '0' || raw === 'off') {
		console.log('[mail-sync-worker] deaktiviert (MAIL_SYNC_WORKER_INTERVAL_MS=0)');
		return;
	}
	const intervalMs = Math.max(60_000, Number(raw) || 5 * 60_000);

	const tick = async () => {
		try {
			const { runExclusiveSync } = await import('./lib/mail/sync');
			const result = await runExclusiveSync();
			if (result === null) {
				console.log('[mail-sync-worker] übersprungen — Sync läuft bereits');
			} else {
				console.log(
					`[mail-sync-worker] fertig: ${result.totalProcessed} Mails verarbeitet, ${result.errorCount} Fehler`
				);
			}
		} catch (error) {
			console.error('[mail-sync-worker] Lauf fehlgeschlagen:', error);
		}
	};

	// Erster Lauf leicht verzögert, damit der Serverstart nicht blockiert wird.
	setTimeout(() => { void tick(); }, 20_000);
	setInterval(() => { void tick(); }, intervalMs);
	console.log(`[mail-sync-worker] gestartet (Intervall ${Math.round(intervalMs / 1000)}s)`);
}
