import { Prisma } from '@prisma/client';

// Posteingang-Suche als eigene SQL-Abfrage.
//
// Betreff, Absender und Empfaenger werden weiter als Teilstring gesucht
// (ILIKE, Trigram-Indizes aus 20260828150000). Der Mailtext laeuft ueber den
// Wortindex aus 20260928120000: mail_search_vector("text") @@
// mail_search_query(q). Prisma kann diesen Ausdruck nicht formulieren, darum
// Raw-SQL fuer die Trefferliste; die Felder holt die Route danach per Prisma.
//
// Aufbau: die Treffer komplett ueber die Indizes bestimmen (je ein Zweig fuer
// Kopfdaten und Mailtext, Ordner/Konto/Filter direkt mitgeprueft - das sind
// kleine Spalten, die ohnehin in der gelesenen Zeile stehen), erst dann nach
// Datum sortieren und die Seite schneiden. MATERIALIZED haelt den Planer davon
// ab, stattdessen "nach Datum durchgehen und jede Mail pruefen" zu waehlen -
// das liest den Mailtext jeder geprueften Mail vom NAS. Ein spaeteres
// Nachschlagen jeder Treffer-ID einzeln waere bei haeufigen Woertern
// (zehntausende Treffer) ebenfalls teuer, darum kein Join.

/** Mailtext erst ab drei Zeichen, kuerzere Begriffe treffen fast jede Mail. */
export const MAIL_TEXT_SEARCH_MIN_LENGTH = 3;

export type MailSearchScope = {
	/** Exakter Ordner oder null fuer alle Ordner. */
	folder: string | null;
	/** Nur relevant bei folder === null: Papierkorb mitsuchen. */
	includeTrash: boolean;
	trashFolders: readonly string[];
	accountId: string | null;
	accountIds: readonly string[];
	/** Listenfilter aus /api/mails (all, assigned, unassigned, unread, with_order, ...). */
	filter: string;
};

/** Maskiert %, _ und \ fuer ILIKE, damit sie als normale Zeichen gesucht werden. */
export function escapeLikePattern(value: string): string {
	return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function scopeConditions(scope: MailSearchScope): Prisma.Sql[] {
	const conditions: Prisma.Sql[] = [Prisma.sql`m."isDeleted" = false`];
	if (scope.folder) {
		conditions.push(Prisma.sql`m."folder" = ${scope.folder}`);
	} else if (!scope.includeTrash && scope.trashFolders.length > 0) {
		conditions.push(Prisma.sql`m."folder" NOT IN (${Prisma.join([...scope.trashFolders])})`);
	}
	if (scope.accountId) {
		conditions.push(Prisma.sql`m."accountId" = ${scope.accountId}`);
	} else if (scope.accountIds.length > 0) {
		conditions.push(Prisma.sql`m."accountId" IN (${Prisma.join([...scope.accountIds])})`);
	}
	if (scope.filter === 'assigned' || scope.filter === 'with_order') {
		conditions.push(Prisma.sql`m."orderId" IS NOT NULL`);
	} else if (scope.filter === 'unassigned') {
		conditions.push(Prisma.sql`m."orderId" IS NULL`);
	} else if (scope.filter === 'unread') {
		conditions.push(Prisma.sql`m."isRead" = false`);
	}
	return conditions;
}

/**
 * Liefert die IDs der Treffer fuer eine Seite, neueste zuerst.
 * Ergebniszeilen: { id: string }.
 */
export function buildMailSearchIdsQuery(
	q: string,
	scope: MailSearchScope,
	page: { take: number; skip: number },
): Prisma.Sql {
	const pattern = `%${escapeLikePattern(q)}%`;
	const inScope = Prisma.join(scopeConditions(scope), ' AND ');
	const textHits = q.length >= MAIL_TEXT_SEARCH_MIN_LENGTH
		? Prisma.sql`
			UNION
			SELECT m.id, m."date" FROM "Mail" m
			WHERE mail_search_vector(m."text") @@ mail_search_query(${q})
				AND ${inScope}`
		: Prisma.empty;

	return Prisma.sql`
		WITH hits AS MATERIALIZED (
			SELECT m.id, m."date" FROM "Mail" m
			WHERE (m."subject" ILIKE ${pattern}
				OR m."fromEmail" ILIKE ${pattern}
				OR m."fromName" ILIKE ${pattern}
				OR m."toEmail" ILIKE ${pattern})
				AND ${inScope}
			${textHits}
		)
		SELECT id FROM hits
		ORDER BY "date" DESC, id DESC
		LIMIT ${page.take} OFFSET ${page.skip}`;
}
