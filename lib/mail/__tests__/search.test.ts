import { describe, expect, it } from 'vitest';
import { buildMailSearchIdsQuery, escapeLikePattern, type MailSearchScope } from '../search';

const baseScope: MailSearchScope = {
	folder: null,
	includeTrash: false,
	trashFolders: ['Trash', 'INBOX.Trash'],
	accountId: null,
	accountIds: [],
	filter: 'all',
};

const build = (q: string, scope: Partial<MailSearchScope> = {}, page = { take: 51, skip: 0 }) =>
	buildMailSearchIdsQuery(q, { ...baseScope, ...scope }, page);

describe('escapeLikePattern', () => {
	it('maskiert %, _ und Backslash', () => {
		expect(escapeLikePattern('100% a_b c\\d')).toBe('100\\% a\\_b c\\\\d');
	});

	it('laesst normale Zeichen unveraendert', () => {
		expect(escapeLikePattern("O'Neil Müller")).toBe("O'Neil Müller");
	});
});

describe('buildMailSearchIdsQuery', () => {
	it('sucht den Mailtext ueber den Wortindex ab drei Zeichen', () => {
		const sql = build('gitarre');
		expect(sql.text).toContain('mail_search_vector(m."text") @@ mail_search_query(');
		expect(sql.values).toContain('gitarre');
	});

	it('sucht bei kurzen Begriffen nur Betreff und Adressen', () => {
		const sql = build('ab');
		expect(sql.text).not.toContain('mail_search_vector');
		expect(sql.text).toContain('ILIKE');
	});

	it('gibt den Suchbegriff nur als Parameter weiter, nie im SQL-Text', () => {
		const sql = build("x'); DROP TABLE \"Mail\"; --");
		expect(sql.text).not.toContain('DROP TABLE');
		expect(sql.values).toContain("%x'); DROP TABLE \"Mail\"; --%");
	});

	it('maskiert Platzhalterzeichen im ILIKE-Muster', () => {
		expect(build('100%').values).toContain('%100\\%%');
	});

	it('schliesst den Papierkorb standardmaessig aus', () => {
		const sql = build('gitarre');
		expect(sql.text).toContain('m."folder" NOT IN');
		expect(sql.values).toEqual(expect.arrayContaining(['Trash', 'INBOX.Trash']));
	});

	it('sucht mit includeTrash auch im Papierkorb', () => {
		const sql = build('gitarre', { includeTrash: true });
		expect(sql.text).not.toContain('NOT IN');
	});

	it('begrenzt auf einen Ordner, wenn einer gesetzt ist', () => {
		const sql = build('gitarre', { folder: 'INBOX', includeTrash: false });
		expect(sql.text).toContain('m."folder" = ');
		expect(sql.text).not.toContain('NOT IN');
		expect(sql.values).toContain('INBOX');
	});

	it('filtert nach einem oder mehreren Konten', () => {
		expect(build('gitarre', { accountId: 'acc1' }).text).toContain('m."accountId" = ');
		const multi = build('gitarre', { accountIds: ['acc1', 'acc2'] });
		expect(multi.text).toContain('m."accountId" IN');
		expect(multi.values).toEqual(expect.arrayContaining(['acc1', 'acc2']));
	});

	it('uebernimmt die Listenfilter', () => {
		expect(build('gitarre', { filter: 'assigned' }).text).toContain('m."orderId" IS NOT NULL');
		expect(build('gitarre', { filter: 'with_order' }).text).toContain('m."orderId" IS NOT NULL');
		expect(build('gitarre', { filter: 'unassigned' }).text).toContain('m."orderId" IS NULL');
		expect(build('gitarre', { filter: 'unread' }).text).toContain('m."isRead" = false');
	});

	it('prueft Ordner und Konto in beiden Zweigen (Kopfdaten und Mailtext)', () => {
		const sql = build('gitarre', { accountId: 'acc1' });
		expect(sql.text.match(/m\."isDeleted" = false/g)).toHaveLength(2);
		expect(sql.text.match(/m\."accountId" = /g)).toHaveLength(2);
	});

	it('sortiert nach Datum und schneidet die Seite zuletzt', () => {
		const sql = build('gitarre', {}, { take: 51, skip: 100 });
		expect(sql.text).toMatch(/ORDER BY "date" DESC, id DESC\s+LIMIT \$\d+ OFFSET \$\d+\s*$/);
		expect(sql.values.slice(-2)).toEqual([51, 100]);
	});
});
