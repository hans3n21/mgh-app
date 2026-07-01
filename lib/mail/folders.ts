type FolderListItem = {
	path?: string | null;
	name?: string | null;
	specialUse?: string | string[] | null;
};

export const TRASH_FOLDER_CANDIDATES = [
	'Trash',
	'Deleted',
	'Deleted Items',
	'Deleted Messages',
	'Papierkorb',
	'Gel\u00f6schte Elemente',
	'Gel\u00f6scht',
	'INBOX.Trash',
	'[Gmail]/Trash',
	'[Google Mail]/Papierkorb',
];

const TRASH_MATCHERS = [
	'trash',
	'deleted',
	'deleted items',
	'deleted messages',
	'papierkorb',
	'geloschte elemente',
	'geloscht',
	'bin',
];

export function normalizeFolderName(value: string | null | undefined): string {
	return (value || '')
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.trim()
		.toLowerCase();
}

export function isTrashFolderName(value: string | null | undefined): boolean {
	const normalized = normalizeFolderName(value);
	if (!normalized) return false;
	return TRASH_MATCHERS.some((matcher) => normalized === matcher || normalized.includes(matcher));
}

function getFolderPath(item: FolderListItem): string | null {
	return item.path || item.name || null;
}

function specialUseValues(item: FolderListItem): string[] {
	if (!item.specialUse) return [];
	return Array.isArray(item.specialUse) ? item.specialUse : [item.specialUse];
}

export function resolveTrashFolderFromList(
	folders: FolderListItem[],
	fallback: string = 'Trash'
): string {
	const bySpecialUse = folders.find((item) =>
		specialUseValues(item).some((value) => isTrashFolderName(value))
	);
	const specialPath = bySpecialUse ? getFolderPath(bySpecialUse) : null;
	if (specialPath) return specialPath;

	const candidateSet = new Set(TRASH_FOLDER_CANDIDATES.map(normalizeFolderName));
	const exactCandidate = folders.find((item) => {
		const path = getFolderPath(item);
		return path ? candidateSet.has(normalizeFolderName(path)) : false;
	});
	const exactPath = exactCandidate ? getFolderPath(exactCandidate) : null;
	if (exactPath) return exactPath;

	const fuzzyCandidate = folders.find((item) => {
		const path = getFolderPath(item);
		return path ? isTrashFolderName(path) : false;
	});
	const fuzzyPath = fuzzyCandidate ? getFolderPath(fuzzyCandidate) : null;
	return fuzzyPath || fallback;
}
