/**
 * Mail-Sync-Worker — läuft im Node-Serverprozess (geladen via instrumentation.ts).
 *
 * Vorher wurde nur synchronisiert, solange jemand den Posteingang im Browser
 * offen hatte (Auto-Sync im Tab). Jetzt bleiben INBOX/Gesendet/Papierkorb auch
 * dann aktuell, wenn niemand in der App ist. Der prozessweite Mutex in
 * lib/mail/sync.ts verhindert Überlappung mit manuell ausgelösten Syncs.
 *
 * Konfiguration über Env:
 *   MAIL_SYNC_WORKER_INTERVAL_MS  Intervall in ms (Default 60000 = 1 Min,
 *                                 Minimum 30000). "0" oder "off" deaktiviert
 *                                 den Worker.
 *
 * Der Takt lag früher bei 5 Minuten, weil ein Leerlauf-Durchgang jedes Postfach
 * geöffnet und zweimal durchsucht hat (~1,6 s). Seit syncFolder unveränderte
 * Ordner per IMAP-STATUS erkennt, kostet derselbe Durchgang ~70 ms — damit ist
 * ein Minutentakt billiger als der alte Fünfminutentakt und neue Mails stehen
 * auch dann zeitnah in der App, wenn niemand sie offen hat.
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
	const intervalMs = Math.max(30_000, Number(raw) || 60_000);

	const tick = async () => {
		try {
			const { runExclusiveSync } = await import('./lib/mail/sync');
			const result = await runExclusiveSync();
			if (result === null) {
				console.log('[mail-sync-worker] übersprungen — Sync läuft bereits');
			} else if (result.changed || result.errorCount > 0) {
				console.log(
					`[mail-sync-worker] fertig: ${result.totalProcessed} neu, ${result.totalRemoved} entfernt, ${result.errorCount} Fehler`
				);
			}
			// Bei "nichts Neues" schweigen: im Minutentakt wäre das reines
			// Log-Rauschen, in dem echte Meldungen untergehen.
		} catch (error) {
			console.error('[mail-sync-worker] Lauf fehlgeschlagen:', error);
		}
	};

	// Erster Lauf leicht verzögert, damit der Serverstart nicht blockiert wird.
	setTimeout(() => { void tick(); }, 20_000);
	setInterval(() => { void tick(); }, intervalMs);
	console.log(`[mail-sync-worker] gestartet (Intervall ${Math.round(intervalMs / 1000)}s)`);

	// Zusätzlich die IDLE-Wächter: Der Takt oben ist das Sicherheitsnetz, die
	// Wächter sind der schnelle Weg — sie melden eine neue Mail in dem Moment,
	// in dem sie eintrifft, statt bis zum nächsten Takt zu warten.
	setTimeout(() => {
		void (async () => {
			try {
				const { startMailIdleWatchers } = await import('./lib/mail/idle');
				await startMailIdleWatchers();
			} catch (error) {
				// Ohne Wächter läuft die App normal weiter, nur eben im Takt.
				console.error('[mail-idle] Start fehlgeschlagen:', error);
			}
		})();
	}, 5_000);
}
