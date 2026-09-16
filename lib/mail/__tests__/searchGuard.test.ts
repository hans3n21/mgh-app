import { describe, expect, it } from 'vitest';
import { SearchInterruptedError, isStatementCancelledError } from '../searchGuard';

describe('isStatementCancelledError', () => {
	it('erkennt statement_timeout aus Prisma-Fehlertexten', () => {
		expect(isStatementCancelledError(new Error(
			'Invalid `prisma.mail.findMany()` invocation: Raw query failed. Code: `57014`. Message: `canceling statement due to statement timeout`',
		))).toBe(true);
	});

	it('erkennt pg_cancel_backend (user request)', () => {
		expect(isStatementCancelledError(new Error('canceling statement due to user request'))).toBe(true);
	});

	it('erkennt das Zeitlimit der Interactive Transaction (P2028)', () => {
		const err = Object.assign(new Error('Transaction API error'), { code: 'P2028' });
		expect(isStatementCancelledError(err)).toBe(true);
		expect(isStatementCancelledError(new Error('Transaction already closed: A query cannot be executed on an expired transaction'))).toBe(true);
	});

	it('laesst andere Fehler durch', () => {
		expect(isStatementCancelledError(new Error('relation "Mail" does not exist'))).toBe(false);
		expect(isStatementCancelledError(null)).toBe(false);
		expect(isStatementCancelledError('string')).toBe(false);
	});
});

describe('SearchInterruptedError', () => {
	it('traegt den Grund', () => {
		expect(new SearchInterruptedError('timeout').reason).toBe('timeout');
		expect(new SearchInterruptedError('aborted').reason).toBe('aborted');
	});
});
