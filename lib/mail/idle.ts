/**
 * IMAP-IDLE-Waechter — holt neue Mails in dem Moment, in dem sie eintreffen.
 *
 * Der Abfragetakt (siehe instrumentation-node.ts) fragt den Server aktiv, ob
 * sich etwas getan hat. Das ist zuverlaessig, aber eine Mail liegt im Schnitt
 * einen halben Takt lang unsichtbar herum. IDLE dreht das um: Wir halten je
 * Postfach eine Leitung offen, auf der der Server VON SICH AUS meldet, sobald
 * etwas im Posteingang landet. Genau so arbeitet ein normales Mailprogramm —
 * neue Mail ist in ein bis zwei Sekunden da statt nach bis zu einer Minute.
 *
 * Bewusst eine EIGENE Verbindung je Konto, nicht die aus lib/mail/client.ts:
 * Die geteilte Verbindung wechselt beim Sync staendig den Ordner (INBOX ->
 * Gesendet -> Papierkorb). Wer auf ihr den Posteingang beobachtet, verliert die
 * Beobachtung beim ersten Ordnerwechsel. Beobachtet wird nur INBOX — fuer
 * Gesendet und Papierkorb reicht der Takt.
 *
 * Der Abfragetakt bleibt als Sicherheitsnetz bestehen: Eine IDLE-Leitung kann
 * still sterben (NAT-Timeout, Serverneustart), ohne dass wir es sofort merken.
 *
 * Konfiguration ueber Env:
 *   MAIL_IDLE=off   schaltet die Waechter ab (dann nur noch der Abfragetakt)
 */
import { ImapFlow } from 'imapflow';
import type { MailAccount } from '@prisma/client';
import { prisma } from '@/lib/prisma';

// Nach dem Wecksignal kurz warten, bevor wir synchronisieren: Treffen mehrere
// Mails gleichzeitig ein, meldet der Server jede einzeln — wir wollen aber
// einen Durchlauf fuer alle, nicht fuenf hintereinander.
//
// Gemessen an unserem Server (lima-city, zwei Laeufe: 9695 ms und 9701 ms):
// Zwischen dem Eintreffen einer Mail und der IDLE-Meldung liegen konstant rund
// zehn Sekunden — der Server sieht selbst nur im 10-Sekunden-Takt nach. Diese
// Untergrenze gilt fuer jedes Mailprogramm gleichermassen, sie ist nicht zu
// unterbieten. Deshalb hier knapp halten: alles ueber einer Sekunde faellt
// gegenueber den zehn Sekunden ohnehin kaum ins Gewicht.
const DEBOUNCE_MS = 750;

// Wiederverbinden nach Abbruch: erst schnell, dann immer traeger, damit ein
// laengerer Serverausfall nicht in einer Dauerschleife von Anmeldeversuchen
// endet (der Mailserver sperrt sonst wegen zu vieler Logins).
const RETRY_MS = [5_000, 15_000, 60_000, 300_000];

type Watcher = {
	accountId: string;
	email: string;
	client: ImapFlow | null;
	stopped: boolean;
	failures: number;
	debounce: NodeJS.Timeout | null;
	retry: NodeJS.Timeout | null;
};

const globalForIdle = globalThis as unknown as { __mailIdleWatchers?: Map<string, Watcher> };
const watchers: Map<string, Watcher> = globalForIdle.__mailIdleWatchers
	?? (globalForIdle.__mailIdleWatchers = new Map());

function isDisabled(): boolean {
	const raw = (process.env.MAIL_IDLE || '').trim().toLowerCase();
	return raw === 'off' || raw === '0' || raw === 'false';
}

/**
 * Holt den Posteingang genau eines Kontos nach. Laeuft gerade ein anderer Sync,
 * gibt runExclusiveSync null zurueck — dann warten wir kurz und versuchen es
 * erneut, sonst ginge das Wecksignal verloren.
 */
async function syncInbox(watcher: Watcher, attempt = 0): Promise<void> {
	const { runExclusiveSync } = await import('./sync');
	const result = await runExclusiveSync({
		accountIds: [watcher.accountId],
		folders: ['INBOX'],
	});
	if (result === null) {
		if (attempt >= 5) {
			console.warn(`[mail-idle] ${watcher.email}: Sperre dauerhaft belegt, ueberlasse es dem Abfragetakt`);
			return;
		}
		setTimeout(() => { void syncInbox(watcher, attempt + 1); }, 2_000);
		return;
	}
	if (result.changed) {
		console.log(`[mail-idle] ${watcher.email}: ${result.totalProcessed} neu, ${result.totalRemoved} entfernt`);
	}
}

function scheduleSync(watcher: Watcher) {
	if (watcher.debounce) clearTimeout(watcher.debounce);
	watcher.debounce = setTimeout(() => {
		watcher.debounce = null;
		void syncInbox(watcher).catch((error) => {
			console.error(`[mail-idle] ${watcher.email}: Sync nach Wecksignal fehlgeschlagen:`, error);
		});
	}, DEBOUNCE_MS);
}

function scheduleReconnect(watcher: Watcher) {
	if (watcher.stopped || watcher.retry) return;
	const delay = RETRY_MS[Math.min(watcher.failures, RETRY_MS.length - 1)];
	watcher.failures += 1;
	watcher.retry = setTimeout(() => {
		watcher.retry = null;
		void connect(watcher);
	}, delay);
}

async function connect(watcher: Watcher): Promise<void> {
	if (watcher.stopped) return;

	const account = await prisma.mailAccount.findUnique({ where: { id: watcher.accountId } });
	if (!account || !account.isActive) {
		console.log(`[mail-idle] ${watcher.email}: Konto inaktiv, Waechter beendet`);
		watcher.stopped = true;
		return;
	}

	const client = new ImapFlow({
		host: account.imapHost,
		port: account.imapPort,
		secure: account.imapPort === 993,
		auth: { user: account.imapUser, pass: account.imapPass },
		logger: false,
		disableAutoEnable: true,
		missingIdleCommand: 'NOOP',
		// IDLE regelmaessig erneuern. Der Standard des Protokolls sind 29 Minuten;
		// so lange halten Router und Firewalls eine stille Verbindung oft nicht
		// durch. Alle fuenf Minuten neu ansetzen haelt die Leitung wach und deckt
		// einen stillen Abbruch schnell auf.
		maxIdleTime: 5 * 60_000,
	});

	client.on('error', (error: Error) => {
		console.warn(`[mail-idle] ${watcher.email}: Verbindungsfehler — ${error.message}`);
	});
	client.on('close', () => {
		if (watcher.stopped) return;
		watcher.client = null;
		scheduleReconnect(watcher);
	});

	// Das eigentliche Wecksignal: Der Server meldet eine gestiegene Anzahl im
	// Posteingang. Was genau eingetroffen ist, interessiert hier nicht — den
	// Rest macht der normale Sync (inklusive Zuordnung zu Auftrag und Kunde).
	client.on('exists', (data: { path?: string; count?: number; prevCount?: number }) => {
		console.log(`[mail-idle] ${watcher.email}: neue Mail gemeldet (${data?.prevCount} -> ${data?.count})`);
		scheduleSync(watcher);
	});

	try {
		await client.connect();
		await client.mailboxOpen('INBOX');
		watcher.client = client;
		watcher.failures = 0;
		console.log(`[mail-idle] ${watcher.email}: beobachtet Posteingang`);
	} catch (error) {
		console.warn(`[mail-idle] ${watcher.email}: Verbindung fehlgeschlagen — ${(error as Error).message}`);
		try { await client.logout(); } catch { }
		watcher.client = null;
		scheduleReconnect(watcher);
	}
}

/**
 * Startet je aktivem Postfach einen Waechter. Mehrfachaufrufe sind harmlos —
 * bereits laufende Konten werden uebersprungen.
 */
export async function startMailIdleWatchers(): Promise<void> {
	if (isDisabled()) {
		console.log('[mail-idle] deaktiviert (MAIL_IDLE=off)');
		return;
	}

	const accounts: MailAccount[] = await prisma.mailAccount.findMany({ where: { isActive: true } });
	for (const account of accounts) {
		if (watchers.has(account.id)) continue;
		const watcher: Watcher = {
			accountId: account.id,
			email: account.email,
			client: null,
			stopped: false,
			failures: 0,
			debounce: null,
			retry: null,
		};
		watchers.set(account.id, watcher);
		void connect(watcher);
	}
	console.log(`[mail-idle] gestartet fuer ${accounts.length} Postfach/Postfaecher`);
}

/** Fuer Tests und einen geordneten Abbau. */
export async function stopMailIdleWatchers(): Promise<void> {
	for (const watcher of Array.from(watchers.values())) {
		watcher.stopped = true;
		if (watcher.debounce) clearTimeout(watcher.debounce);
		if (watcher.retry) clearTimeout(watcher.retry);
		if (watcher.client) {
			try { await watcher.client.logout(); } catch { }
		}
	}
	watchers.clear();
}

export function idleWatcherStatus() {
	return Array.from(watchers.values()).map((w) => ({
		email: w.email,
		verbunden: Boolean(w.client?.usable),
		fehlversuche: w.failures,
	}));
}
