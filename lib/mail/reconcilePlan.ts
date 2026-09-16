// Reiner Abgleich "lokale Mails eines Ordners" gegen "UIDs auf dem Server".
// Keine DB, kein IMAP — damit die Regeln testbar sind.
//
// Hintergrund (16.09.2026): In drei Ordnern wurden an je einem Tag tausende
// Mails auf einen Schlag als geloescht markiert (3.288 in Sent, 2.395 in
// Trash, 1.281 in Sent), obwohl sie laut Server weiterhin existierten. Der
// alte Abgleich hat jeder UID-Liste blind vertraut und kannte nur die
// Richtung "fehlt auf dem Server -> isDeleted". Einmal markiert, kam eine
// Mail nie zurueck, weil der Nachlade-Abgleich markierte Zeilen als
// "vorhanden" zaehlte.

export type LocalMailRef = {
	id: string;
	uid: number;
	isDeleted: boolean;
};

export type ReconcilePlan =
	| { ok: false; reason: string }
	| { ok: true; restoreIds: string[]; missingIds: string[] };

// Ohne bestaetigte Nachrichtenzahl vom Server (STATUS/SELECT) vertrauen wir
// einer UID-Liste nicht, die mehr als die Haelfte eines Ordners und mehr als
// diese Zahl Mails auf einmal verschwinden liesse.
export const MASS_DELETE_MIN_COUNT = 100;
export const MASS_DELETE_MIN_SHARE = 0.5;

export function planReconcile(params: {
	localMails: LocalMailRef[];
	serverUids: number[];
	/** client.mailbox.exists nach SELECT — Anzahl Nachrichten laut Server. */
	serverExists: number | null | undefined;
}): ReconcilePlan {
	const { localMails, serverUids } = params;
	const serverExists = typeof params.serverExists === 'number' && Number.isFinite(params.serverExists)
		? params.serverExists
		: null;

	// SEARCH ALL muss mindestens so viele UIDs liefern, wie der Ordner laut
	// Server Nachrichten hat. Weniger heisst: die Liste ist unvollstaendig
	// (abgebrochene Antwort, Server-Limit) — damit darf nichts markiert werden.
	if (serverExists !== null && serverUids.length < serverExists) {
		return {
			ok: false,
			reason: `SEARCH lieferte ${serverUids.length} UIDs, der Ordner hat aber ${serverExists} Nachrichten`,
		};
	}

	const serverUidSet = new Set(serverUids);
	const active = localMails.filter((m) => m.uid > 0 && !m.isDeleted);
	const flagged = localMails.filter((m) => m.uid > 0 && m.isDeleted);

	const missingIds = active.filter((m) => !serverUidSet.has(m.uid)).map((m) => m.id);
	const restoreIds = flagged.filter((m) => serverUidSet.has(m.uid)).map((m) => m.id);

	// Ist die Nachrichtenzahl bekannt und passt zur UID-Liste, ist auch ein
	// Massen-Abgang plausibel (Papierkorb geleert). Ohne diese Bestaetigung
	// lieber einen Lauf aussetzen als tausende Mails ausblenden.
	if (serverExists === null && active.length > 0) {
		const share = missingIds.length / active.length;
		if (missingIds.length >= MASS_DELETE_MIN_COUNT && share >= MASS_DELETE_MIN_SHARE) {
			return {
				ok: false,
				reason: `${missingIds.length} von ${active.length} Mails wuerden auf einmal verschwinden, Nachrichtenzahl des Servers unbekannt`,
			};
		}
	}

	return { ok: true, restoreIds, missingIds };
}
