import type { NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

// Schutz fuer die Posteingang-Suche.
//
// Die Volltextsuche laeuft per ILIKE ueber die Spalte "text" der Mail-Tabelle.
// Deren Inhalt liegt ausgelagert (TOAST, ~3 GB zusammen mit html) auf dem NAS,
// das Zufallszugriffe nur langsam liefert. Gemessen am 16.09.2026: ~38 ms pro
// geprueft Mail, ein seltener Begriff ueber alle ~37.000 Mails brauchte ueber
// 150 s. Zwei Dinge machten daraus "es passiert nichts":
//
//  1. Bricht der Browser den Request ab (Weitertippen), stoppt weder Next.js
//     noch Prisma die laufende Postgres-Abfrage. Sie laeuft zu Ende und
//     blockiert Platte und einen Pool-Slot. Beim Tippen stapeln sich so
//     mehrere Minuten-Scans.
//  2. Postgres hat kein statement_timeout, die App auch nicht.
//
// Darum laeuft die Suchabfrage hier in einer Transaktion mit SET LOCAL
// statement_timeout, und ein Client-Abbruch wird per pg_cancel_backend an
// genau den Postgres-Prozess weitergereicht, der unsere Abfrage ausfuehrt.
// Die eigentliche Beschleunigung kommt aus dem Wortindex auf dem Mailtext
// (Migration 20260928120000_add_mail_fulltext_search, lib/mail/search.ts) und
// den Trigram-Indizes auf Betreff/Adressen; das hier ist das Sicherheitsnetz.

export const SEARCH_STATEMENT_TIMEOUT_MS = 20_000;

export type SearchInterruptReason = 'timeout' | 'aborted';

export class SearchInterruptedError extends Error {
	readonly reason: SearchInterruptReason;
	constructor(reason: SearchInterruptReason) {
		super(reason === 'aborted' ? 'Suche vom Client abgebrochen' : 'Suche hat das Zeitlimit ueberschritten');
		this.name = 'SearchInterruptedError';
		this.reason = reason;
	}
}

// Postgres meldet sowohl statement_timeout als auch pg_cancel_backend mit
// SQLSTATE 57014 (query_canceled). Prisma reicht das je nach Aufrufpfad als
// Known/Unknown-Request-Error mit dem Originaltext durch; laeuft die
// Interactive Transaction selbst in ihr Zeitlimit, kommt P2028.
export function isStatementCancelledError(error: unknown): boolean {
	if (!error || typeof error !== 'object') return false;
	const message = 'message' in error && typeof (error as { message?: unknown }).message === 'string'
		? (error as { message: string }).message
		: '';
	const code = 'code' in error && typeof (error as { code?: unknown }).code === 'string'
		? (error as { code: string }).code
		: '';
	if (code === 'P2028') return true;
	return /57014|canceling statement|statement timeout|Transaction already closed/i.test(message);
}

/**
 * Fuehrt `run` in einer Transaktion mit statement_timeout aus und bricht die
 * Postgres-Abfrage ab, sobald der Client den Request abbricht.
 *
 * Wirft SearchInterruptedError('timeout' | 'aborted'); alle anderen Fehler
 * werden unveraendert weitergereicht.
 */
export async function withSearchGuard<T>(
	req: NextRequest,
	run: (tx: Prisma.TransactionClient) => Promise<T>,
	timeoutMs: number = SEARCH_STATEMENT_TIMEOUT_MS,
): Promise<T> {
	if (req.signal.aborted) throw new SearchInterruptedError('aborted');

	let backendPid: number | null = null;
	// Nur solange unsere eigene Abfrage laeuft darf abgebrochen werden: die
	// Verbindung geht danach zurueck in den Pool, ein spaetes Cancel traefe
	// die Abfrage eines anderen Requests.
	let inFlight = false;

	const cancelBackend = () => {
		if (!inFlight || backendPid === null) return;
		inFlight = false;
		const pid = backendPid;
		prisma.$executeRaw`SELECT pg_cancel_backend(${pid})`.catch(() => {
			// best effort: das statement_timeout faengt den Rest
		});
	};
	req.signal.addEventListener('abort', cancelBackend);

	try {
		return await prisma.$transaction(async (tx) => {
			const rows = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
			backendPid = rows[0]?.pid ?? null;
			// SET akzeptiert keine Bind-Parameter; timeoutMs ist eine Zahl aus
			// unserem eigenen Code, kein Nutzer-Input.
			await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = ${Math.max(1000, Math.floor(timeoutMs))}`);
			inFlight = true;
			try {
				if (req.signal.aborted) throw new SearchInterruptedError('aborted');
				return await run(tx);
			} finally {
				inFlight = false;
			}
		}, {
			// Transaktions-Limit klar ueber dem statement_timeout, damit Postgres
			// (57014) zuerst greift und wir den Grund sauber unterscheiden koennen.
			timeout: timeoutMs + 5_000,
			maxWait: 5_000,
		});
	} catch (error) {
		if (error instanceof SearchInterruptedError) throw error;
		if (isStatementCancelledError(error)) {
			throw new SearchInterruptedError(req.signal.aborted ? 'aborted' : 'timeout');
		}
		throw error;
	} finally {
		req.signal.removeEventListener('abort', cancelBackend);
	}
}
