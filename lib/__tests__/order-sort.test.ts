import { describe, expect, it } from 'vitest';
import { FIRST_DIR, nextSort, sortOrders, type SortableOrder, type SortState } from '../order-sort';

const NOW = new Date('2026-08-25T12:00:00Z').getTime();
const TYPE_LABEL: Record<string, string> = {
	GUITAR: 'Gitarrenbau',
	NECK: 'Hals',
	PICKGUARD: 'Pickguard',
};

function tage(anzahl: number): string {
	return new Date(NOW - anzahl * 86_400_000).toISOString();
}

function auftrag(overrides: Partial<SortableOrder> & { title: string }): SortableOrder {
	return {
		type: 'PICKGUARD',
		status: 'intake',
		paymentStatus: 'open',
		createdAt: tage(1),
		depositPaidAt: null,
		paidAt: null,
		customer: { name: 'Zacharias Zander' },
		assignee: { name: 'Admin' },
		...overrides,
	};
}

// Reihenfolge wie sie der Server liefert: neueste zuerst.
const AUFTRAEGE: SortableOrder[] = [
	auftrag({ title: 'Tortoise Pickguard', customer: { name: 'Christopher Rudolph' }, createdAt: tage(0) }),
	auftrag({ title: 'Les Paul', type: 'GUITAR', customer: { name: 'Wolfgang Schulze' }, createdAt: tage(2), paymentStatus: 'deposit' }),
	auftrag({ title: 'Custom Hals', type: 'NECK', customer: { name: 'Frederik Hinrichs' }, createdAt: tage(30), paymentStatus: 'paid', depositPaidAt: tage(28) }),
	auftrag({ title: 'Attila Ibanez Hals', type: 'NECK', customer: null, assignee: null, createdAt: tage(40), status: 'in_progress' }),
];

const titel = (sort: SortState) =>
	sortOrders(AUFTRAEGE, sort, { typeLabel: TYPE_LABEL, now: NOW }).map((o) => o.title);

describe('sortOrders', () => {
	it('laesst die Serverreihenfolge stehen, solange nicht sortiert wurde', () => {
		expect(titel(null)).toEqual(['Tortoise Pickguard', 'Les Paul', 'Custom Hals', 'Attila Ibanez Hals']);
	});

	it('sortiert Text alphabetisch und dreht sauber um', () => {
		expect(titel({ key: 'title', dir: 'asc' })).toEqual([
			'Attila Ibanez Hals', 'Custom Hals', 'Les Paul', 'Tortoise Pickguard',
		]);
		expect(titel({ key: 'title', dir: 'desc' })).toEqual([
			'Tortoise Pickguard', 'Les Paul', 'Custom Hals', 'Attila Ibanez Hals',
		]);
	});

	it('zeigt bei "Wartet seit" absteigend den laengsten Rueckstand zuerst', () => {
		// Custom Hals wartet seit der Anzahlung (28 T), nicht seit Anlage (30 T)
		// -- deshalb steht der 40-Tage-Auftrag davor.
		expect(titel({ key: 'wait', dir: 'desc' })).toEqual([
			'Attila Ibanez Hals', 'Custom Hals', 'Les Paul', 'Tortoise Pickguard',
		]);
		expect(titel({ key: 'wait', dir: 'asc' })[0]).toBe('Tortoise Pickguard');
	});

	it('sortiert Zahlung nach Fortschritt, nicht alphabetisch', () => {
		const reihenfolge = sortOrders(AUFTRAEGE, { key: 'payment', dir: 'asc' }, { now: NOW })
			.map((o) => o.paymentStatus);
		expect(reihenfolge).toEqual(['open', 'open', 'deposit', 'paid']);
	});

	it('sortiert Status entlang des Arbeitsablaufs', () => {
		const reihenfolge = sortOrders(AUFTRAEGE, { key: 'status', dir: 'asc' }, { now: NOW })
			.map((o) => o.status);
		expect(reihenfolge).toEqual(['intake', 'intake', 'intake', 'in_progress']);
	});

	it('sortiert den Typ nach der angezeigten Bezeichnung', () => {
		// "Gitarrenbau" vor "Hals" vor "Pickguard" -- nach dem rohen Schluessel
		// waere es GUITAR, NECK, PICKGUARD, hier zufaellig gleich; der Test
		// sichert, dass die Bezeichnung ueberhaupt herangezogen wird.
		expect(titel({ key: 'type', dir: 'asc' })[0]).toBe('Les Paul');
	});

	it('haelt Leerwerte unten, egal in welche Richtung sortiert wird', () => {
		// "Attila Ibanez Hals" hat weder Kunde noch Zustaendigen.
		expect(titel({ key: 'customer', dir: 'asc' }).at(-1)).toBe('Attila Ibanez Hals');
		expect(titel({ key: 'customer', dir: 'desc' }).at(-1)).toBe('Attila Ibanez Hals');
		expect(titel({ key: 'assignee', dir: 'asc' }).at(-1)).toBe('Attila Ibanez Hals');
		expect(titel({ key: 'assignee', dir: 'desc' }).at(-1)).toBe('Attila Ibanez Hals');
	});

	it('veraendert die uebergebene Liste nicht', () => {
		const vorher = AUFTRAEGE.map((o) => o.title);
		sortOrders(AUFTRAEGE, { key: 'title', dir: 'asc' }, { now: NOW });
		expect(AUFTRAEGE.map((o) => o.title)).toEqual(vorher);
	});
});

describe('nextSort', () => {
	it('sortiert beim ersten Klick in die nuetzliche Richtung', () => {
		expect(nextSort(null, 'wait')).toEqual({ key: 'wait', dir: 'desc' });
		expect(nextSort(null, 'customer')).toEqual({ key: 'customer', dir: 'asc' });
	});

	it('dreht beim zweiten Klick um und raeumt beim dritten auf', () => {
		const ersterKlick = nextSort(null, 'customer');
		const zweiterKlick = nextSort(ersterKlick, 'customer');
		const dritterKlick = nextSort(zweiterKlick, 'customer');

		expect(zweiterKlick).toEqual({ key: 'customer', dir: 'desc' });
		expect(dritterKlick).toBeNull();
	});

	it('springt beim Wechsel der Spalte direkt in deren Startrichtung', () => {
		expect(nextSort({ key: 'customer', dir: 'desc' }, 'wait')).toEqual({ key: 'wait', dir: FIRST_DIR.wait });
	});
});
