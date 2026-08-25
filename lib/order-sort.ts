// Sortierung der Auftragsuebersicht. Liegt bewusst ausserhalb der Komponente:
// die Reihenfolge ist die Logik, die man testen will, die Tabelle drumherum
// nicht.
import { WORKFLOW_STATUSES, normalizeWorkflowStatus } from './order-status';

export type SortKey = 'title' | 'customer' | 'type' | 'status' | 'payment' | 'wait' | 'assignee';
export type SortDir = 'asc' | 'desc';
export type SortState = { key: SortKey; dir: SortDir } | null;

export const SORT_KEYS: SortKey[] = ['title', 'customer', 'type', 'status', 'payment', 'wait', 'assignee'];

// Richtung, die beim ERSTEN Klick am meisten bringt: bei "Wartet seit" ist das
// der laengste Rueckstand (danach fragt man in der Werkstatt), bei Text A→Z.
export const FIRST_DIR: Record<SortKey, SortDir> = {
	title: 'asc',
	customer: 'asc',
	type: 'asc',
	status: 'asc',
	payment: 'asc',
	wait: 'desc',
	assignee: 'asc',
};

// Zahlung nach Fortschritt statt alphabetisch — "offen" zuerst ist die Liste,
// die man abarbeitet.
const PAYMENT_RANK: Record<string, number> = { open: 0, deposit: 1, paid: 2 };

/** Nur die Felder, die fuer die Reihenfolge zaehlen. */
export type SortableOrder = {
	title: string;
	type: string;
	status: string;
	paymentStatus?: string | null;
	createdAt: Date | string;
	depositPaidAt?: Date | string | null;
	paidAt?: Date | string | null;
	customer: { name: string } | null;
	assignee: { name: string } | null;
};

export type CompareOptions = {
	/** Nach der angezeigten Bezeichnung sortieren, nicht nach dem Schluessel. */
	typeLabel?: Record<string, string>;
	/** Bezugszeitpunkt fuer "Wartet seit" — im Test fest vorgebbar. */
	now?: number;
};

function sortValue(order: SortableOrder, key: SortKey, options: CompareOptions): string | number {
	switch (key) {
		case 'title':
			return order.title.toLocaleLowerCase('de');
		case 'customer':
			return (order.customer?.name ?? '').toLocaleLowerCase('de');
		case 'type':
			return (options.typeLabel?.[order.type] ?? order.type).toLocaleLowerCase('de');
		case 'status':
			return WORKFLOW_STATUSES.indexOf(normalizeWorkflowStatus(order.status));
		case 'payment':
			return PAYMENT_RANK[order.paymentStatus || 'open'] ?? 0;
		case 'wait': {
			// Gleicher Anker wie das "Wartet seit"-Badge: Zahlungseingang, sonst
			// Anlage. Als Wartedauer statt Zeitstempel, damit "absteigend" auch
			// wirklich "am laengsten wartend zuerst" heisst.
			const anchor = order.depositPaidAt ?? order.paidAt ?? order.createdAt;
			const ts = new Date(anchor).getTime();
			if (Number.isNaN(ts)) return -1;
			return (options.now ?? Date.now()) - ts;
		}
		case 'assignee':
			return (order.assignee?.name ?? '').toLocaleLowerCase('de');
	}
}

export function compareOrders(
	a: SortableOrder,
	b: SortableOrder,
	key: SortKey,
	dir: SortDir,
	options: CompareOptions = {}
): number {
	const va = sortValue(a, key, options);
	const vb = sortValue(b, key, options);

	// Leerwerte (kein Kunde, kein Zustaendiger) bleiben unten, egal in welche
	// Richtung sortiert wird — beim Umdrehen wuerden sie sonst den Kopf der
	// Liste fuellen, obwohl sie am wenigsten aussagen.
	const emptyA = va === '';
	const emptyB = vb === '';
	if (emptyA !== emptyB) return emptyA ? 1 : -1;

	const cmp =
		typeof va === 'number' && typeof vb === 'number'
			? va - vb
			: String(va).localeCompare(String(vb), 'de');
	return dir === 'asc' ? cmp : -cmp;
}

/**
 * Sortiert stabil — bei Gleichstand bleibt die Serverreihenfolge (neueste
 * zuerst) erhalten.
 */
export function sortOrders<T extends SortableOrder>(orders: T[], sort: SortState, options: CompareOptions = {}): T[] {
	if (!sort) return orders;
	return [...orders].sort((a, b) => compareOrders(a, b, sort.key, sort.dir, options));
}

/**
 * Ein Klick sortiert, der zweite dreht um, der dritte raeumt die Sortierung
 * wieder weg — so bleibt die Standardreihenfolge erreichbar, ohne dass es dafuer
 * ein eigenes Bedienelement braucht.
 */
export function nextSort(current: SortState, key: SortKey): SortState {
	if (!current || current.key !== key) return { key, dir: FIRST_DIR[key] };
	if (current.dir === FIRST_DIR[key]) return { key, dir: current.dir === 'asc' ? 'desc' : 'asc' };
	return null;
}
