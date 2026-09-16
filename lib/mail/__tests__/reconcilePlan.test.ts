import { describe, expect, it } from 'vitest';
import { planReconcile, type LocalMailRef } from '../reconcilePlan';

const mail = (id: string, uid: number, isDeleted = false): LocalMailRef => ({ id, uid, isDeleted });

describe('planReconcile', () => {
	it('markiert fehlende Mails und nimmt Markierungen zurueck, wenn die UID wieder da ist', () => {
		const plan = planReconcile({
			localMails: [mail('a', 1), mail('b', 2), mail('c', 3, true), mail('d', 4, true)],
			serverUids: [1, 3],
			serverExists: 2,
		});
		expect(plan).toEqual({ ok: true, restoreIds: ['c'], missingIds: ['b'] });
	});

	it('ignoriert Zeilen ohne UID', () => {
		const plan = planReconcile({
			localMails: [mail('x', 0), mail('y', 0, true)],
			serverUids: [],
			serverExists: 0,
		});
		expect(plan).toEqual({ ok: true, restoreIds: [], missingIds: [] });
	});

	it('vertraut einer unvollstaendigen UID-Liste nicht', () => {
		const plan = planReconcile({
			localMails: Array.from({ length: 3000 }, (_, i) => mail(`m${i}`, i + 1)),
			serverUids: [1, 2, 3],
			serverExists: 3362,
		});
		expect(plan.ok).toBe(false);
		if (!plan.ok) expect(plan.reason).toMatch(/3 UIDs/);
	});

	it('akzeptiert einen wirklich geleerten Ordner, wenn der Server 0 Nachrichten meldet', () => {
		const plan = planReconcile({
			localMails: Array.from({ length: 500 }, (_, i) => mail(`m${i}`, i + 1)),
			serverUids: [],
			serverExists: 0,
		});
		expect(plan.ok).toBe(true);
		if (plan.ok) expect(plan.missingIds).toHaveLength(500);
	});

	it('setzt bei unbekannter Nachrichtenzahl und Massen-Abgang aus', () => {
		const plan = planReconcile({
			localMails: Array.from({ length: 400 }, (_, i) => mail(`m${i}`, i + 1)),
			serverUids: [1, 2, 3, 4, 5],
			serverExists: undefined,
		});
		expect(plan.ok).toBe(false);
		if (!plan.ok) expect(plan.reason).toMatch(/395 von 400/);
	});

	it('laesst bei unbekannter Nachrichtenzahl kleine Abgaenge durch', () => {
		const plan = planReconcile({
			localMails: [mail('a', 1), mail('b', 2), mail('c', 3), mail('d', 4)],
			serverUids: [1, 2, 3],
			serverExists: null,
		});
		expect(plan).toEqual({ ok: true, restoreIds: [], missingIds: ['d'] });
	});
});
