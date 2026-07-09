"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { detectLang } from '@/lib/lang/detectLang';
import InboxToolbar from './InboxToolbar';
import InboxList from './InboxList';
import InboxPreview from './InboxPreview';
import EmptyState from './EmptyState';
import RowSkeleton from './RowSkeleton';
import FolderSidebar from './FolderSidebar';
import type { InboxFilter, Message } from './types';
import DatasheetSidebar from './DatasheetSidebar';
import InboxAccountSettingsPanel from './InboxAccountSettingsPanel';
import type { MailAccountTab } from './AccountSidebar';
import { isTrashFolderName } from '@/lib/mail/folders';

const AUTO_SYNC_INTERVAL = 3 * 60 * 1000; // 3 Minuten
// Klickt man ein Postfach/einen Ordner an, wird dieses Fach gezielt im
// Hintergrund synchronisiert. Dieselbe Auswahl loesen wir aber nicht oefter als
// alle 15s aus, damit schnelles Hin-und-her-Klicken den Server nicht flutet.
const FOLDER_SYNC_DEBOUNCE_MS = 15 * 1000;
const PAGE_SIZE = 100;
const DEFAULT_LIST_WIDTH = 352;
const MIN_LIST_WIDTH = 288;
const MAX_LIST_WIDTH = 416;
const DEFAULT_SETTINGS_WIDTH = 352;
const MIN_SETTINGS_WIDTH = 288;
const MAX_SETTINGS_WIDTH = 520;
const INBOX_CACHE_TTL = 2 * 60 * 1000;
const INBOX_SNAPSHOT_TTL = 10 * 60 * 1000;
const INBOX_SNAPSHOT_VERSION = 1;
const INBOX_SNAPSHOT_INDEX_KEY = 'mgh:inbox:snapshots:v1:index';
const INBOX_SNAPSHOT_PREFIX = 'mgh:inbox:snapshot:v1:';
const INBOX_BOOT_SNAPSHOT_KEY = 'mgh:inbox:boot-snapshot:v1';

type MailCacheEntry = { messages: Message[]; hasMore: boolean; page: number; savedAt: number };

function snapshotStorageKey(cacheKey: string): string {
	let hash = 0;
	for (let i = 0; i < cacheKey.length; i++) {
		hash = (hash * 31 + cacheKey.charCodeAt(i)) >>> 0;
	}
	return `${INBOX_SNAPSHOT_PREFIX}${hash.toString(36)}`;
}

function sanitizeMessagesForSnapshot(messages: Message[]): Message[] {
	return messages.map((mail) => ({
		...mail,
		attachments: [],
		html: undefined,
		text: null,
		detailLoaded: false,
		snippet: (mail.snippet || '').slice(0, 200),
	}));
}

function readInboxSnapshot(cacheKey: string): MailCacheEntry | null {
	if (typeof window === 'undefined') return null;
	try {
		const raw = window.sessionStorage.getItem(snapshotStorageKey(cacheKey));
		if (!raw) return null;
		const parsed = JSON.parse(raw);
		if (parsed?.version !== INBOX_SNAPSHOT_VERSION) return null;
		if (!Array.isArray(parsed.messages)) return null;
		if (typeof parsed.savedAt !== 'number' || Date.now() - parsed.savedAt > INBOX_SNAPSHOT_TTL) return null;
		return {
			messages: sanitizeMessagesForSnapshot(parsed.messages),
			hasMore: Boolean(parsed.hasMore),
			page: Number(parsed.page || 1),
			savedAt: parsed.savedAt,
		};
	} catch {
		return null;
	}
}

function writeInboxSnapshot(cacheKey: string, entry: MailCacheEntry) {
	if (typeof window === 'undefined') return;
	try {
		const key = snapshotStorageKey(cacheKey);
		const payload = {
			version: INBOX_SNAPSHOT_VERSION,
			messages: sanitizeMessagesForSnapshot(entry.messages),
			hasMore: entry.hasMore,
			page: entry.page,
			savedAt: entry.savedAt,
		};
		window.sessionStorage.setItem(key, JSON.stringify(payload));

		const rawIndex = window.sessionStorage.getItem(INBOX_SNAPSHOT_INDEX_KEY);
		const existingIndex = rawIndex ? JSON.parse(rawIndex) : [];
		const index = Array.isArray(existingIndex) ? existingIndex.filter((item) => item !== key) : [];
		index.unshift(key);
		for (const staleKey of index.slice(12)) {
			window.sessionStorage.removeItem(staleKey);
		}
		window.sessionStorage.setItem(INBOX_SNAPSHOT_INDEX_KEY, JSON.stringify(index.slice(0, 12)));
	} catch {
		// Browser storage is a speed-up only. If it fails, the inbox still loads from the API.
	}
}

function readInboxBootSnapshot(): MailCacheEntry | null {
	if (typeof window === 'undefined') return null;
	try {
		const raw = window.sessionStorage.getItem(INBOX_BOOT_SNAPSHOT_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw);
		if (parsed?.version !== INBOX_SNAPSHOT_VERSION) return null;
		if (!Array.isArray(parsed.messages)) return null;
		if (typeof parsed.savedAt !== 'number' || Date.now() - parsed.savedAt > INBOX_SNAPSHOT_TTL) return null;
		return {
			messages: sanitizeMessagesForSnapshot(parsed.messages),
			hasMore: Boolean(parsed.hasMore),
			page: Number(parsed.page || 1),
			savedAt: parsed.savedAt,
		};
	} catch {
		return null;
	}
}

function writeInboxBootSnapshot(entry: MailCacheEntry) {
	if (typeof window === 'undefined') return;
	try {
		window.sessionStorage.setItem(INBOX_BOOT_SNAPSHOT_KEY, JSON.stringify({
			version: INBOX_SNAPSHOT_VERSION,
			messages: sanitizeMessagesForSnapshot(entry.messages),
			hasMore: entry.hasMore,
			page: entry.page,
			savedAt: entry.savedAt,
		}));
	} catch {
		// Optional start-up speed-up only.
	}
}

function clearInboxSnapshots() {
	if (typeof window === 'undefined') return;
	try {
		const rawIndex = window.sessionStorage.getItem(INBOX_SNAPSHOT_INDEX_KEY);
		const index = rawIndex ? JSON.parse(rawIndex) : [];
		if (Array.isArray(index)) {
			for (const key of index) {
				if (typeof key === 'string' && key.startsWith(INBOX_SNAPSHOT_PREFIX)) {
					window.sessionStorage.removeItem(key);
				}
			}
		}
		window.sessionStorage.removeItem(INBOX_SNAPSHOT_INDEX_KEY);
		window.sessionStorage.removeItem(INBOX_BOOT_SNAPSHOT_KEY);
	} catch {
		// Ignore snapshot cleanup errors; stale snapshots expire quickly.
	}
}

function mapMailToMessage(m: any, accountLabels: Record<string, string>, detailLoaded = true): Message {
	const attachments = (m.attachments || []).map((a: any) => ({
		id: a.id,
		filename: a.filename,
		mimeType: a.mimeType || null,
		url: `/api/attachments/${a.id}`,
		cid: a.cid || null,
		size: a.size,
	}));
	const attachmentsCount =
		typeof m.attachmentsCount === 'number'
			? m.attachmentsCount
			: attachments.length;

	return {
		id: m.id,
		subject: m.subject || 'Ohne Betreff',
		fromName: m.fromName || m.fromEmail || '–',
		fromEmail: m.fromEmail || '',
		accountId: m.accountId || null,
		accountLabel: m.accountId ? (accountLabels[m.accountId] || null) : null,
		toName: m.toName || null,
		toEmail: m.toEmail || null,
		folder: m.folder || null,
		createdAt: m.date || new Date().toISOString(),
		hasAttachments: m.hasAttachments !== undefined ? !!m.hasAttachments : attachmentsCount > 0,
		attachmentsCount,
		attachments,
		lang: detectLang((m.text || m.html || '')),
		assignedTo: m.orderId || null,
		isRead: m.isRead !== undefined ? m.isRead : false,
		starred: m.starred ?? false,
		tags: Array.isArray(m.tags) ? m.tags : [],
		snippet: (m.text || '').slice(0, 200),
		text: m.text || null,
		html: m.html || undefined,
		threadId: m.threadId || undefined,
		leadId: m.leadId || null,
		threadCount: m.threadCount || undefined,
		threadHasUnread: m.threadHasUnread || undefined,
		detailLoaded,
	};
}

export default function InboxPage() {
	const searchParams = useSearchParams();
	const [loading, setLoading] = useState(true);
	const [messages, setMessages] = useState<Message[]>([]);
	const [hasMore, setHasMore] = useState(false);
	const [loadingMore, setLoadingMore] = useState(false);
	const [page, setPage] = useState(1);
	const [q, setQ] = useState('');
	const [debouncedQ, setDebouncedQ] = useState('');
	const [filter, setFilter] = useState<InboxFilter>('all');
	const [folder, setFolder] = useState<string>('INBOX');
	const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
	const [focusKey, setFocusKey] = useState<string>('all');
	const [accounts, setAccounts] = useState<MailAccountTab[]>([]);
	const [accountsLoading, setAccountsLoading] = useState(true);
	const [accountsError, setAccountsError] = useState<string | null>(null);
	const [settingsAccountId, setSettingsAccountId] = useState<string | null>(null);
	const [unreadPerAccount, setUnreadPerAccount] = useState<Record<string, number>>({});
	const [searchIncludeTrash, setSearchIncludeTrash] = useState(true);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
	const [isClosingSettings, setIsClosingSettings] = useState(false);
	const settingsCloseTimerRef = useRef<number | null>(null);
	const settingsMounted = !!settingsAccountId;
	const settingsOpen = settingsMounted && !isClosingSettings;
	const lastClickedRef = useRef<string | null>(null);
	const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
	const [listOpen, setListOpen] = useState<boolean>(true);
	const [foldersOpen, setFoldersOpen] = useState<boolean>(false);
	const [replyOpen, setReplyOpen] = useState<boolean>(false);
	const [syncing, setSyncing] = useState(false);
	const [bgSyncing, setBgSyncing] = useState(false);
	const [listActionError, setListActionError] = useState<string | null>(null);
	const [remoteSyncRunning, setRemoteSyncRunning] = useState(false);
	const [remoteFullSyncRunning, setRemoteFullSyncRunning] = useState(false);
	const [remoteSyncTotalAccounts, setRemoteSyncTotalAccounts] = useState(0);
	const [remoteSyncCompletedAccounts, setRemoteSyncCompletedAccounts] = useState(0);
	const [remoteSyncCurrentFolder, setRemoteSyncCurrentFolder] = useState<string | null>(null);
	const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
	const [listWidth, setListWidth] = useState<number>(DEFAULT_LIST_WIDTH);
	const [isResizingList, setIsResizingList] = useState(false);
	const [settingsWidth, setSettingsWidth] = useState<number>(DEFAULT_SETTINGS_WIDTH);
	const [isResizingSettings, setIsResizingSettings] = useState(false);
	const [composeHandled, setComposeHandled] = useState(false);
	const mailCacheRef = useRef(new Map<string, MailCacheEntry>());
	// Merkt sich pro (Konten+Ordner)-Auswahl, wann zuletzt ein gezielter
	// Klick-Sync lief — fuer die Entprellung in syncFolderInBackground.
	const bgSyncKeyRef = useRef(new Map<string, number>());
	const listAbortRef = useRef<AbortController | null>(null);
	const listRequestSeqRef = useRef(0);
	// Merkt sich, zu welcher Auswahl (cacheKey) die aktuell angezeigten Mails
	// gehoeren — damit beim Wechsel auf ein anderes Postfach/Ordner nicht kurz
	// die Mails der vorherigen Auswahl stehen bleiben.
	const lastAppliedKeyRef = useRef<string | null>(null);
	const bootSnapshotAppliedRef = useRef(false);
	const detailRequestIdsRef = useRef(new Set<string>());
	const accountLabelMapRef = useRef<Record<string, string>>({});
	const composeTo = useMemo(() => (searchParams.get('to') || '').trim().toLowerCase(), [searchParams]);

	const accountLabelMap = useMemo(() => {
		return accounts.reduce<Record<string, string>>((acc, account) => {
			acc[account.id] = account.profile?.displayName || account.name || account.email;
			return acc;
		}, {});
	}, [accounts]);

	const focusedAccountIds = useMemo(() => {
		if (focusKey === 'all') return accounts.map((a) => a.id);
		return accounts.some((a) => a.id === focusKey) ? [focusKey] : [];
	}, [focusKey, accounts]);
	const focusedAccountIdsKey = focusedAccountIds.join(',');

	const focusLabel = useMemo(() => {
		if (focusKey === 'all') return 'Alle Eingänge';
		return accountLabelMap[focusKey] || 'Postfach';
	}, [focusKey, accountLabelMap]);

	useEffect(() => {
		accountLabelMapRef.current = accountLabelMap;
		setMessages((prev) => prev.map((mail) => ({
			...mail,
			accountLabel: mail.accountId ? (accountLabelMap[mail.accountId] || null) : null,
		})));
		mailCacheRef.current.forEach((entry, key) => {
			mailCacheRef.current.set(key, {
				...entry,
				messages: entry.messages.map((mail) => ({
					...mail,
					accountLabel: mail.accountId ? (accountLabelMap[mail.accountId] || null) : null,
				})),
			});
		});
	}, [accountLabelMap]);

	// Debounce: API-Aufruf erst 350ms nach dem letzten Tastendruck
	useEffect(() => {
		const t = setTimeout(() => setDebouncedQ(q), 350);
		return () => clearTimeout(t);
	}, [q]);

	useEffect(() => {
		const snapshot = readInboxBootSnapshot();
		if (!snapshot || snapshot.messages.length === 0) return;
		bootSnapshotAppliedRef.current = true;
		setMessages(snapshot.messages);
		setHasMore(snapshot.hasMore);
		setPage(snapshot.page);
		setLoading(false);
	}, []);

	const fetchMails = useCallback(async (showLoading = false, pageNumber = 1, append = false) => {
		const cacheKey = [
			folder,
			debouncedQ.trim(),
			searchIncludeTrash ? 'trash' : 'no-trash',
			filter,
			focusedAccountIdsKey,
		].join('|');
		const requestId = ++listRequestSeqRef.current;
		listAbortRef.current?.abort();
		const controller = new AbortController();
		listAbortRef.current = controller;
		const canApply = () => requestId === listRequestSeqRef.current && !controller.signal.aborted;
		const withCurrentAccountLabels = (items: Message[]) => items.map((mail) => ({
			...mail,
			accountLabel: mail.accountId ? (accountLabelMapRef.current[mail.accountId] || null) : null,
		}));

		const cachedEntry = !append && pageNumber === 1 ? mailCacheRef.current.get(cacheKey) : null;
		const cached = cachedEntry && Date.now() - cachedEntry.savedAt <= INBOX_CACHE_TTL ? cachedEntry : null;
		if (cachedEntry && !cached) mailCacheRef.current.delete(cacheKey);
		const snapshot = !cached && !append && pageNumber === 1 ? readInboxSnapshot(cacheKey) : null;
		const warmEntry = cached || snapshot;
		if (warmEntry) {
			setMessages(withCurrentAccountLabels(warmEntry.messages));
			setHasMore(warmEntry.hasMore);
			setPage(warmEntry.page);
			setLoading(false);
		} else if (!append && pageNumber === 1) {
			// Kein warmer Cache fuer diese Auswahl. Gehoeren die aktuell
			// angezeigten Mails zu einer ANDEREN Auswahl (anderes Postfach/
			// Ordner/Filter), sofort leeren und Skeleton zeigen — sonst bleiben
			// kurz die Mails des vorherigen Postfachs stehen, bis der Netzwerk-
			// Request zurueck ist. (Beim allerersten Laden ist lastAppliedKeyRef
			// null → Boot-Snapshot bleibt erhalten.)
			if (lastAppliedKeyRef.current !== null && lastAppliedKeyRef.current !== cacheKey) {
				setMessages([]);
				setHasMore(false);
				setLoading(true);
			} else if (showLoading) {
				setLoading(true);
			}
		}
		if (!append && pageNumber === 1) {
			lastAppliedKeyRef.current = cacheKey;
		}
		if (!append) setLoadingMore(false);
		if (append) setLoadingMore(true);
		try {
			const trimmedQ = debouncedQ.trim();
			const isSearching = trimmedQ.length > 0;
			const params = new URLSearchParams({ group: 'thread' });
			params.set('summary', '1');
			params.set('paginate', '1');
			params.set('page', String(pageNumber));
			params.set('limit', String(PAGE_SIZE));
			params.set('filter', filter);
			if (focusedAccountIdsKey.length > 0) {
				params.set('accountIds', focusedAccountIdsKey);
			}
			if (isSearching) {
				params.set('q', trimmedQ);
				params.set('folder', 'all');
				if (searchIncludeTrash) params.set('includeTrash', '1');
			} else {
				params.set('folder', folder);
			}
			const res = await fetch(`/api/mails?${params}`, { signal: controller.signal });
			if (!canApply()) return;
			if (res.ok) {
				const data = await res.json();
				if (!canApply()) return;
				const mails = Array.isArray(data) ? data : (data.items || []);
				const next: Message[] = mails.map((mail: any) => mapMailToMessage(mail, accountLabelMapRef.current, false));
				setMessages((prev) => {
					if (!append) {
						// A background/full list refresh only returns summary data (no
						// attachments/html). Keep already-loaded detail data for messages
						// that were previously fetched in full, so an in-flight refresh
						// doesn't blank out the mail the user currently has open.
						if (prev.length === 0) return next;
						const detailedById = new Map(
							prev.filter((m) => m.detailLoaded).map((m) => [m.id, m])
						);
						if (detailedById.size === 0) return next;
						return next.map((mail) => {
							const detailed = detailedById.get(mail.id);
							return detailed ? { ...mail, ...detailed } : mail;
						});
					}
					const seen = new Set(prev.map((m) => m.id));
					const appended = next.filter((m) => !seen.has(m.id));
					return [...prev, ...appended];
				});
				const nextHasMore = Array.isArray(data) ? false : !!data.hasMore;
				setHasMore(nextHasMore);
				setPage(pageNumber);
				if (!append && pageNumber === 1) {
					const cacheEntry: MailCacheEntry = {
						messages: next,
						hasMore: nextHasMore,
						page: pageNumber,
						savedAt: Date.now(),
					};
					mailCacheRef.current.set(cacheKey, cacheEntry);
					writeInboxSnapshot(cacheKey, cacheEntry);
					if (focusKey === 'all' && folder === 'INBOX' && debouncedQ.trim() === '' && filter === 'all') {
						writeInboxBootSnapshot(cacheEntry);
					}
					if (mailCacheRef.current.size > 20) {
						const oldestKey = Array.from(mailCacheRef.current.entries())
							.sort((a, b) => a[1].savedAt - b[1].savedAt)[0]?.[0];
						if (oldestKey) mailCacheRef.current.delete(oldestKey);
					}
				}
			}
		} catch (error: any) {
			if (error?.name !== 'AbortError') {
				// Keep the warm snapshot visible if the background refresh fails.
			}
		} finally {
			if (canApply()) {
				if (!append) setLoading(false);
				if (append) setLoadingMore(false);
				if (listAbortRef.current === controller) listAbortRef.current = null;
			}
		}
	}, [folder, debouncedQ, searchIncludeTrash, filter, focusedAccountIdsKey, focusKey]);

	const fetchUnreadCounts = useCallback(async () => {
		try {
			const res = await fetch('/api/mails/unread-count');
			if (res.ok) {
				const data = await res.json();
				if (data.perAccount) setUnreadPerAccount(data.perAccount);
			}
		} catch { /* ignore */ }
	}, []);

	const fetchSyncStatus = useCallback(async () => {
		try {
			const res = await fetch('/api/mail/sync');
			if (!res.ok) return;
			const data = await res.json();
			setRemoteSyncRunning(Boolean(data?.running));
			setRemoteFullSyncRunning(Boolean(data?.running && data?.fullSync));
			setRemoteSyncTotalAccounts(Number(data?.totalAccounts || 0));
			setRemoteSyncCompletedAccounts(Number(data?.completedAccounts || 0));
			setRemoteSyncCurrentFolder(data?.currentFolder || null);
		} catch {
			// ignore network glitches
		}
	}, []);

	const loadAccounts = useCallback(async () => {
		setAccountsLoading(true);
		setAccountsError(null);
		try {
			const res = await fetch('/api/mail-accounts');
			if (!res.ok) throw new Error(`mail-accounts ${res.status}`);
			const data = await res.json();
			const active = Array.isArray(data) ? data.filter((a: MailAccountTab) => a.isActive) : [];
			setAccounts(active);
			if (active.length === 0) {
				setAccountsError('Keine aktiven Postfaecher gefunden.');
				return;
			}

			const def = active.find((a: MailAccountTab) => a.isDefault) ?? active[0];
			setActiveAccountId((prev) => prev ?? def.id);
			setFocusKey((prev) => prev || 'all');

			Promise.all(active.map((a: MailAccountTab) =>
				fetch(`/api/mail-accounts/${a.id}/profile`)
					.then((resp) => (resp.ok ? resp.json() : null))
					.then((profile) => ({ id: a.id, profile }))
			)).then((profiles) => {
				setAccounts((prev) => prev.map((account) => {
					const profileEntry = profiles.find((item) => item.id === account.id);
					return profileEntry ? { ...account, profile: profileEntry.profile } : account;
				}));
			}).catch(() => {});
		} catch {
			setAccounts([]);
			setAccountsError('Postfaecher konnten nicht geladen werden.');
		} finally {
			setAccountsLoading(false);
		}
	}, []);

	// Load accounts and profiles
	useEffect(() => {
		void loadAccounts();
		fetchUnreadCounts();
	}, [loadAccounts, fetchUnreadCounts]);

	const doSync = useCallback(async () => {
		if (syncing) return;
		setSyncing(true);
		try {
			const syncScope = {
				accountIds: focusedAccountIdsKey ? focusedAccountIdsKey.split(',').filter(Boolean) : [],
				// Aktuellen Ordner zuerst (schnellste sichtbare Aktualisierung), aber die
				// Standardordner immer mitsyncen — sonst veralten Gesendet/Papierkorb,
				// solange man sie nicht aktiv ansieht.
				folders: Array.from(new Set([folder || 'INBOX', 'INBOX', 'Sent', 'Trash'])),
			};
			const res = await fetch('/api/mail/sync', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(syncScope),
			});
			if (res.status === 409) {
				const data = await res.json().catch(() => null);
				setRemoteSyncRunning(Boolean(data?.running));
				setRemoteFullSyncRunning(Boolean(data?.running && data?.fullSync));
				setRemoteSyncTotalAccounts(Number(data?.totalAccounts || 0));
				setRemoteSyncCompletedAccounts(Number(data?.completedAccounts || 0));
				setRemoteSyncCurrentFolder(data?.currentFolder || null);
				return;
			}
			mailCacheRef.current.clear();
			clearInboxSnapshots();
			await fetchMails();
			await fetchUnreadCounts();
			await fetchSyncStatus();
			setLastSyncTime(new Date());
		} catch { /* Sync-Fehler still ignorieren */ }
		finally { setSyncing(false); }
	}, [syncing, focusedAccountIdsKey, folder, fetchMails, fetchUnreadCounts, fetchSyncStatus]);

	// Gezielter, nicht blockierender Hintergrund-Sync fuer genau das gerade
	// angeklickte Postfach/Fach. Die Liste kommt weiterhin sofort aus der DB;
	// dieser Aufruf holt parallel den Server-Stand nach und aktualisiert die
	// Ansicht, sobald er durch ist. Entprellt pro Auswahl (FOLDER_SYNC_DEBOUNCE_MS),
	// still bei 409 (ein anderer/Vollsync haelt gerade die Sperre — der Poller
	// zeigt den an).
	const syncFolderInBackground = useCallback(async (accountIds: string[], folderName: string) => {
		const ids = accountIds.filter(Boolean);
		if (ids.length === 0 || !folderName) return;
		const key = `${[...ids].sort().join(',')}:${folderName}`;
		const now = Date.now();
		const last = bgSyncKeyRef.current.get(key) || 0;
		if (now - last < FOLDER_SYNC_DEBOUNCE_MS) return;
		bgSyncKeyRef.current.set(key, now);
		setBgSyncing(true);
		try {
			const res = await fetch('/api/mail/sync', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ accountIds: ids, folders: [folderName] }),
			});
			if (res.status === 409) {
				// Sperre belegt — Entprellung zuruecksetzen, damit ein spaeterer Klick
				// es erneut versuchen darf, sobald der laufende Sync fertig ist.
				bgSyncKeyRef.current.set(key, 0);
				return;
			}
			if (res.ok) {
				await fetchMails(false, 1, false);
				await fetchUnreadCounts();
				setLastSyncTime(new Date());
			}
		} catch {
			// Transienter Fehler: Entprellung zuruecksetzen, nicht stoerend melden.
			bgSyncKeyRef.current.set(key, 0);
		} finally {
			setBgSyncing(false);
		}
	}, [fetchMails, fetchUnreadCounts]);

	const closeSettingsPanel = useCallback(() => {
		if (!settingsMounted || isClosingSettings) return;
		setIsClosingSettings(true);
		if (settingsCloseTimerRef.current) {
			window.clearTimeout(settingsCloseTimerRef.current);
		}
		settingsCloseTimerRef.current = window.setTimeout(() => {
			setSettingsAccountId(null);
			setIsClosingSettings(false);
		}, 180);
	}, [settingsMounted, isClosingSettings]);

	// SSE: neue Mails live nachladen
	useEffect(() => {
		const ev = new EventSource('/api/inbox/events');
		ev.addEventListener('message.created', async (e: MessageEvent) => {
			try {
				JSON.parse(e.data);
				// Re-fetch current inbox view to respect active folder/account/filter,
				// instead of blindly appending event mails from other scopes.
				mailCacheRef.current.clear();
				clearInboxSnapshots();
				await fetchMails(false, 1, false);
				await fetchUnreadCounts();
			} catch { /* SSE-Fehler ignorieren */ }
		});
		return () => ev.close();
	}, [fetchMails, fetchUnreadCounts]);

	// Ungelesen-Status live nachziehen, wenn eine Mail in der Vorschau als
	// gelesen/ungelesen markiert wird (Auto-Markierung nach 2s oder Toggle).
	// Sonst haengen Rail-Badges, Filter-Zaehler und die Zeilen-Darstellung bis
	// zum naechsten Sync hinterher.
	useEffect(() => {
		const onReadChange = (e: Event) => {
			const mailId = (e as CustomEvent).detail?.mailId as string | undefined;
			const isRead = e.type === 'mail-read';
			if (mailId) {
				const patch = (m: Message): Message => m.id === mailId
					? { ...m, isRead, ...(isRead ? { threadHasUnread: false } : {}) }
					: m;
				setMessages((prev) => prev.map(patch));
				mailCacheRef.current.forEach((entry, key) => {
					mailCacheRef.current.set(key, { ...entry, messages: entry.messages.map(patch) });
				});
			}
			void fetchUnreadCounts();
		};
		window.addEventListener('mail-read', onReadChange);
		window.addEventListener('mail-unread', onReadChange);
		return () => {
			window.removeEventListener('mail-read', onReadChange);
			window.removeEventListener('mail-unread', onReadChange);
		};
	}, [fetchUnreadCounts]);

	// Initial load
	useEffect(() => {
		if (accountsLoading) {
			if (!bootSnapshotAppliedRef.current) setLoading(true);
			return;
		}
		fetchMails(true, 1, false);
	}, [accountsLoading, fetchMails]);

	useEffect(() => {
		return () => {
			listAbortRef.current?.abort();
		};
	}, []);

	// Auto-Sync alle 3 Minuten
	useEffect(() => {
		const timer = setInterval(() => { doSync(); }, AUTO_SYNC_INTERVAL);
		return () => clearInterval(timer);
	}, [doSync]);

	// Polling für laufende (auch extern gestartete) Synchronisation.
	useEffect(() => {
		void fetchSyncStatus();
		const timer = setInterval(() => { void fetchSyncStatus(); }, 5000);
		return () => clearInterval(timer);
	}, [fetchSyncStatus]);

	useEffect(() => {
		setSelectedId(null);
	}, [folder, focusKey]);

	useEffect(() => {
		setComposeHandled(false);
	}, [composeTo]);

	const filtered = useMemo(() => {
		let arr = messages;
		// When debouncedQ is set, the server already filtered — no client-side re-filter needed.
		// Only apply local filter for instant feedback while still typing (q !== debouncedQ).
		if (q && q === debouncedQ) {
			// server already filtered, trust results
		} else if (q) {
			// Still debouncing: apply quick client-side filter on already-loaded messages
			const term = q.toLowerCase();
			arr = arr.filter((m) =>
				(m.subject && m.subject.toLowerCase().includes(term)) ||
				(m.fromName && m.fromName.toLowerCase().includes(term)) ||
				(m.fromEmail && m.fromEmail.toLowerCase().includes(term))
			);
		}
		switch (filter) {
			case 'assigned':
			case 'with_order':
				arr = arr.filter((m) => !!m.assignedTo);
				break;
			case 'unassigned':
				arr = arr.filter((m) => !m.assignedTo);
				break;
			case 'unread':
				arr = arr.filter((m) => !m.isRead || !!m.threadHasUnread);
				break;
			case 'with_attachments':
				arr = arr.filter((m) => m.hasAttachments);
				break;
			default:
		}
		return arr;
	}, [messages, q, debouncedQ, filter]);

	useEffect(() => {
		if (!composeTo || composeHandled || filtered.length === 0) return;
		const match = filtered.find((m) => {
			const from = (m.fromEmail || '').trim().toLowerCase();
			const to = (m.toEmail || '').trim().toLowerCase();
			return from === composeTo || to === composeTo;
		});
		if (!match) return;
		setSelectedId(match.id);
		setReplyOpen(true);
		setListOpen(true);
		setComposeHandled(true);
		if (typeof window !== 'undefined') {
			const url = new URL(window.location.href);
			url.searchParams.delete('compose');
			url.searchParams.delete('to');
			window.history.replaceState({}, '', `${url.pathname}${url.search}`);
		}
	}, [composeTo, composeHandled, filtered]);

	const filterCounts = useMemo(() => {
		return {
			all: messages.length,
			unread: messages.filter((m) => !m.isRead || !!m.threadHasUnread).length,
			with_order: messages.filter((m) => !!m.assignedTo).length,
			unassigned: messages.filter((m) => !m.assignedTo).length,
			with_attachments: messages.filter((m) => !!m.hasAttachments).length,
		};
	}, [messages]);

	useEffect(() => {
		if (filtered.length === 0) {
			if (selectedId) setSelectedId(null);
			return;
		}
		if (!selectedId || !filtered.some((mail) => mail.id === selectedId)) {
			setSelectedId(filtered[0].id);
		}
	}, [filtered, selectedId]);

	const selected = useMemo(() => filtered.find((m) => m.id === selectedId) || null, [filtered, selectedId]);

	useEffect(() => {
		if (!selectedId) return;
		const current = messages.find((m) => m.id === selectedId);
		if (!current || current.detailLoaded || detailRequestIdsRef.current.has(selectedId)) return;

		let cancelled = false;
		detailRequestIdsRef.current.add(selectedId);

		(async () => {
			try {
				const res = await fetch(`/api/mails/${encodeURIComponent(selectedId)}`);
				if (!res.ok) return;
				const data = await res.json();
				if (cancelled) return;
				const detailed = mapMailToMessage(data, accountLabelMap, true);
				setMessages((prev) => prev.map((mail) => (mail.id === selectedId ? { ...mail, ...detailed } : mail)));
				mailCacheRef.current.forEach((entry, key) => {
					if (!entry.messages.some((mail) => mail.id === selectedId)) return;
					mailCacheRef.current.set(key, {
						...entry,
						messages: entry.messages.map((mail) => (mail.id === selectedId ? { ...mail, ...detailed } : mail)),
					});
				});
			} catch {
				// Detail-Nachladen ist eine Komfortverbesserung; die Listenansicht bleibt nutzbar.
			} finally {
				detailRequestIdsRef.current.delete(selectedId);
			}
		})();

		return () => {
			cancelled = true;
			// Free the in-flight guard immediately on cleanup (e.g. React StrictMode's
			// mount/cleanup/remount in dev, or selectedId changing before the fetch
			// resolves). Otherwise a cancelled request's guard entry can linger until
			// its own fetch settles, blocking the next effect run from actually
			// re-fetching and leaving the mail stuck without attachments/html.
			detailRequestIdsRef.current.delete(selectedId);
		};
	}, [selectedId, messages, accountLabelMap]);

	function toggleSelect(id: string, withShift: boolean) {
		setSelectedIds((prev) => {
			const next = new Set(prev);
			if (withShift && lastClickedRef.current) {
				const start = filtered.findIndex((m) => m.id === lastClickedRef.current!);
				const end = filtered.findIndex((m) => m.id === id);
				if (start >= 0 && end >= 0) {
					const [a, b] = start < end ? [start, end] : [end, start];
					for (let i = a; i <= b; i++) next.add(filtered[i].id);
				}
			} else {
				if (next.has(id)) next.delete(id); else next.add(id);
				lastClickedRef.current = id;
			}
			return next;
		});
	}

	async function bulkMarkRead(read: boolean) {
		const ids = Array.from(selectedIds);
		if (ids.length === 0) return;
		setMessages((prev) => prev.map((m) => (ids.includes(m.id) ? { ...m, isRead: read } : m)));
		mailCacheRef.current.clear();
		clearInboxSnapshots();
		await fetch('/api/inbox/update-meta', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messageIds: ids, meta: { read } }) });
	}

	async function bulkStar(starred: boolean) {
		const ids = Array.from(selectedIds);
		if (ids.length === 0) return;
		setMessages((prev) => prev.map((m) => (ids.includes(m.id) ? { ...m, starred } : m)));
		mailCacheRef.current.clear();
		clearInboxSnapshots();
		await fetch('/api/inbox/update-meta', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messageIds: ids, meta: { starred } }) });
	}

	const toggleStar = useCallback(async (id: string, starred: boolean) => {
		setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, starred } : m)));
		mailCacheRef.current.clear();
		clearInboxSnapshots();
		await fetch('/api/inbox/update-meta', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messageIds: [id], meta: { starred } }) });
	}, []);

	async function bulkTag(tag: string) {
		const ids = Array.from(selectedIds);
		if (ids.length === 0) return;
		setMessages((prev) => prev.map((m) => (ids.includes(m.id) ? { ...m, tags: Array.from(new Set([...(m.tags || []), tag])) } : m)));
		mailCacheRef.current.clear();
		clearInboxSnapshots();
		await fetch('/api/inbox/update-meta', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messageIds: ids, meta: { tags: [tag] } }) });
	}

	const handleMessageMoved = useCallback((mailId: string, movedFolder: string) => {
		const keepInCurrentView = isTrashFolderName(folder) || (q.trim().length > 0 && searchIncludeTrash);
		mailCacheRef.current.clear();
		clearInboxSnapshots();
		detailRequestIdsRef.current.delete(mailId);
		setSelectedIds((prev) => {
			const next = new Set(prev);
			next.delete(mailId);
			return next;
		});
		setMessages((prev) => {
			const updated = prev.map((m) => (m.id === mailId ? { ...m, folder: movedFolder } : m));
			return keepInCurrentView ? updated : updated.filter((m) => m.id !== mailId);
		});
		if (!keepInCurrentView) {
			setSelectedId((prev) => (prev === mailId ? null : prev));
		}
		void fetchUnreadCounts();
	}, [fetchUnreadCounts, folder, q, searchIncludeTrash]);

	// Schnelles Verschieben in den Papierkorb direkt aus der Nachrichtenliste
	// (gleicher Weg wie der Papierkorb-Button in der Vorschau). Erst wenn der
	// Server-Move bestaetigt ist, wird die Zeile aus der Ansicht entfernt; bei
	// Fehlschlag wird die Liste neu geladen, damit nichts faelschlich verschwindet.
	const moveMessageToTrash = useCallback(async (mailId: string) => {
		try {
			const res = await fetch('/api/mail/move', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ mailId, targetFolder: 'trash' }),
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(data?.error || 'Mail konnte nicht verschoben werden');
			const movedFolder = data?.folder || 'Trash';
			setListActionError(null);
			handleMessageMoved(mailId, movedFolder);
			window.dispatchEvent(new CustomEvent('mail-moved', { detail: { mailId, folder: movedFolder } }));
		} catch (error) {
			// Move fehlgeschlagen — den echten Grund anzeigen (nicht still schlucken)
			// und die Liste neu laden, damit die Zeile korrekt bleibt.
			setListActionError(error instanceof Error ? error.message : 'Mail konnte nicht in den Papierkorb verschoben werden');
			void fetchMails(false, 1, false);
		}
	}, [handleMessageMoved, fetchMails]);

	// Hotkeys
	useEffect(() => {
		function onKey(e: KeyboardEvent) {
			const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
			if (tag === 'input' || tag === 'textarea' || tag === 'select' || (e.target as HTMLElement)?.isContentEditable) return;
			if (e.key === 'm') bulkMarkRead(true);
			if (e.key === 't') bulkTag('tag');
			if (e.key === 's') {
				// Toggle: sind alle ausgewaehlten schon markiert, Stern entfernen — sonst setzen.
				const ids = Array.from(selectedIds);
				const allStarred = ids.length > 0 && ids.every((id) => messages.find((m) => m.id === id)?.starred);
				bulkStar(!allStarred);
			}
		}
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [selectedIds]);

	useEffect(() => {
		function onKey(e: KeyboardEvent) {
			const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
			if (tag === 'input' || tag === 'textarea' || tag === 'select' || (e.target as HTMLElement)?.isContentEditable) return;
			if (e.key === 'Enter' && selectedId) {
				const el = document.getElementById('inbox-preview');
				(el as HTMLElement | null)?.focus();
			}
		}
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [selectedId]);

	// Nach dem Senden: Liste + Thread aktualisieren
	useEffect(() => {
		function onMailSent() {
			mailCacheRef.current.clear();
			clearInboxSnapshots();
			fetchMails();
		}
		window.addEventListener('mail-sent', onMailSent);
		return () => window.removeEventListener('mail-sent', onMailSent);
	}, [fetchMails]);

	// Einstellungen-Panel bleibt offen bis der User explizit auf ✕ klickt.

	useEffect(() => {
		if (!isResizingList) return;
		const previousUserSelect = document.body.style.userSelect;
		document.body.style.userSelect = 'none';
		const onPointerMove = (event: PointerEvent) => {
			setListWidth((prev) => {
				const next = prev + event.movementX;
				return Math.max(MIN_LIST_WIDTH, Math.min(MAX_LIST_WIDTH, next));
			});
		};
		const onPointerUp = () => setIsResizingList(false);
		window.addEventListener('pointermove', onPointerMove);
		window.addEventListener('pointerup', onPointerUp, { once: true });
		return () => {
			document.body.style.userSelect = previousUserSelect;
			window.removeEventListener('pointermove', onPointerMove);
			window.removeEventListener('pointerup', onPointerUp);
		};
	}, [isResizingList]);

	useEffect(() => {
		if (!isResizingSettings) return;
		const previousUserSelect = document.body.style.userSelect;
		document.body.style.userSelect = 'none';
		const onPointerMove = (event: PointerEvent) => {
			setSettingsWidth((prev) => {
				const next = prev + event.movementX;
				return Math.max(MIN_SETTINGS_WIDTH, Math.min(MAX_SETTINGS_WIDTH, next));
			});
		};
		const onPointerUp = () => setIsResizingSettings(false);
		window.addEventListener('pointermove', onPointerMove);
		window.addEventListener('pointerup', onPointerUp, { once: true });
		return () => {
			document.body.style.userSelect = previousUserSelect;
			window.removeEventListener('pointermove', onPointerMove);
			window.removeEventListener('pointerup', onPointerUp);
		};
	}, [isResizingSettings]);

	useEffect(() => {
		return () => {
			if (settingsCloseTimerRef.current) {
				window.clearTimeout(settingsCloseTimerRef.current);
			}
		};
	}, []);

	return (
		<div className="h-full bg-slate-900 text-slate-200 border border-slate-800 rounded-lg overflow-hidden flex flex-col" aria-busy={loading} aria-live="polite">
			<InboxToolbar
				q={q}
				onChangeQ={(val) => { setQ(val); }}
				filter={filter} onChangeFilter={setFilter}
				syncing={syncing || remoteSyncRunning || bgSyncing}
				syncLabel={
					remoteSyncRunning
						? `${remoteFullSyncRunning ? 'Vollsync' : 'Sync'} läuft${remoteSyncCurrentFolder ? ` · ${remoteSyncCurrentFolder}` : ''}…`
						: undefined
				}
				syncProgress={{
					completedAccounts: remoteSyncCompletedAccounts,
					totalAccounts: remoteSyncTotalAccounts,
				}}
				onSync={doSync}
				lastSyncTime={lastSyncTime}
				searchActive={q.trim().length > 0}
				searchIncludeTrash={searchIncludeTrash}
				onToggleIncludeTrash={() => setSearchIncludeTrash(v => !v)}
				filterCounts={filterCounts}
				focusLabel={focusLabel}
			/>
			{listActionError && (
				<div className="mx-3 mt-2 rounded border border-rose-800 bg-rose-950/40 px-3 py-1.5 text-[12px] text-rose-200 flex items-center justify-between gap-2">
					<span className="min-w-0 break-words">{listActionError}</span>
					<button
						type="button"
						onClick={() => setListActionError(null)}
						className="flex-shrink-0 text-rose-300 hover:text-rose-100"
						aria-label="Fehlermeldung schließen"
					>
						✕
					</button>
				</div>
			)}
			<div className="flex-1 flex overflow-hidden min-h-0">
				{/* Ordner-Sidebar links */}
				<FolderSidebar
					activeAccountId={focusedAccountIds[0] || activeAccountId}
					activeFolder={folder}
					onSelectFolder={(f) => {
						setFolder(f);
						setSelectedId(null);
						void syncFolderInBackground(focusedAccountIds, f);
					}}
					accounts={accounts}
					accountsLoading={accountsLoading}
					accountsError={accountsError}
					focusKey={focusKey}
					foldersOpen={foldersOpen}
					onSelectFocus={(key) => {
						if (key === focusKey) {
							// Erneuter Druck auf das AKTIVE Postfach = Ordner-Sidebar
							// explizit auf-/zuklappen. ('all' hat keine Ordner → nichts tun.)
							if (key !== 'all') setFoldersOpen((prev) => !prev);
							return;
						}
						// Postfach WECHSELN: nur die Auswahl aendern, den Auf-/Zu-Zustand
						// der Ordner-Sidebar aber unangetastet lassen (klebrig). Offen bleibt
						// offen und zeigt dann die Ordner des neuen Postfachs; geschlossen
						// bleibt geschlossen — sie faehrt nur durch expliziten Klick aus.
						setFocusKey(key);
						if (key !== 'all') setActiveAccountId(key);
						setFolder('INBOX');
						setSelectedId(null);
						// focusedAccountIds spiegelt hier noch den ALTEN focusKey — die
						// Konten fuer die neue Auswahl direkt aus `key` ableiten.
						const idsForKey = key === 'all' ? accounts.map((a) => a.id) : [key];
						void syncFolderInBackground(idsForKey, 'INBOX');
					}}
					onOpenSettings={(accountId) => {
						if (settingsAccountId === accountId && settingsMounted && !isClosingSettings) {
							closeSettingsPanel();
							return;
						}
						if (settingsCloseTimerRef.current) {
							window.clearTimeout(settingsCloseTimerRef.current);
							settingsCloseTimerRef.current = null;
						}
						setIsClosingSettings(false);
						setSettingsAccountId(accountId);
						setListOpen(true);
					}}
					onRetryAccounts={loadAccounts}
					unreadPerAccount={unreadPerAccount}
				/>

				{listOpen && (
					settingsMounted ? (
						<div
							className={`relative border-r border-slate-800 h-full flex-shrink-0 overflow-hidden ${isResizingSettings ? '' : 'transition-[width] duration-180 ease-out'}`}
							style={{ width: `${settingsWidth}px` }}
						>
							<button
								type="button"
								data-inbox-settings-resize-handle="true"
								onPointerDown={(e) => {
									e.preventDefault();
									setIsResizingSettings(true);
								}}
								className="absolute top-0 right-0 h-full w-2 translate-x-1/2 cursor-col-resize z-30 group"
								aria-label="Breite der Einstellungen anpassen"
								title="Breite anpassen"
							>
								<span className="absolute inset-y-0 left-1/2 w-[2px] -translate-x-1/2 bg-transparent group-hover:bg-sky-500/45 group-active:bg-sky-400/60 transition-colors" />
							</button>
							<InboxAccountSettingsPanel
								account={accounts.find((a) => a.id === settingsAccountId) || null}
								open={settingsOpen}
								onClose={closeSettingsPanel}
							/>
						</div>
					) : (
						<div
							className={`relative overflow-auto border-r border-slate-800 h-full flex-shrink-0 ${isResizingList ? '' : 'transition-[width] duration-150 ease-out'}`}
							style={{ width: `${listWidth}px` }}
						>
							<button
								type="button"
								onPointerDown={(e) => {
									e.preventDefault();
									setIsResizingList(true);
								}}
								className="absolute top-0 right-0 h-full w-2 translate-x-1/2 cursor-col-resize z-20 group"
								aria-label="Breite der Nachrichtenliste anpassen"
								title="Breite anpassen"
							>
								<span className="absolute inset-y-0 left-1/2 w-[2px] -translate-x-1/2 bg-transparent group-hover:bg-sky-500/50 group-active:bg-sky-400/70 transition-colors" />
							</button>
							{loading ? (
								<div role="status" aria-label="Laden" className="divide-y divide-slate-800">
									{Array.from({ length: 8 }).map((_, i) => (
										<RowSkeleton key={i} />
									))}
								</div>
							) : filtered.length === 0 ? (
								<EmptyState title="Kein Treffer" subtitle="Passen Sie Suche oder Filter an." />
							) : (
								<div className="h-full flex flex-col">
									<div className="flex-1 min-h-0">
										<InboxList
											messages={filtered}
											selectedId={selectedId}
											onSelect={setSelectedId}
											showAccountBadge={focusKey === 'all'}
											onToggleStar={toggleStar}
											onMoveToTrash={moveMessageToTrash}
										/>
									</div>
									{hasMore && (
										<div className="p-2 border-t border-slate-800 bg-slate-950">
											<button
												type="button"
												disabled={loadingMore}
												onClick={() => fetchMails(false, page + 1, true)}
												className="w-full rounded border border-slate-700 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-slate-300 text-xs py-1.5 transition-colors"
											>
												{loadingMore ? 'Lädt…' : 'Mehr laden'}
											</button>
										</div>
									)}
								</div>
							)}
						</div>
					)
				)}

				<div className="flex-1 h-full overflow-hidden">
					{filtered.length === 0 ? (
						<EmptyState
							title={loading ? 'Posteingang wird geladen' : 'Nichts ausgewählt'}
							subtitle={loading ? 'Nachrichten werden geladen.' : 'Wählen Sie links eine Mail aus.'}
						/>
					) : (
						<InboxPreview
							message={selected}
							replyOpen={replyOpen}
							onReplyToggle={() => setReplyOpen((v) => !v)}
							accountId={selected?.accountId || activeAccountId}
							onMessageMoved={handleMessageMoved}
							onLeadLinked={(leadId) => {
								if (!selected) return;
								setMessages((prev) => prev.map((m) => (m.id === selected.id ? { ...m, leadId } : m)));
							}}
							onLeadCreated={(leadId) => {
								if (!selected) return;
								setMessages((prev) => prev.map((m) => (m.id === selected.id ? { ...m, leadId } : m)));
							}}
						/>
					)}
				</div>

				<button
					type="button"
					className="w-5 flex-shrink-0 flex items-center justify-center bg-slate-900 border-l border-slate-800 hover:bg-slate-800 transition-colors text-slate-500 hover:text-slate-300 text-[10px]"
					onClick={() => setSidebarOpen((v) => !v)}
					title={sidebarOpen ? 'Sidebar einklappen' : 'Sidebar ausklappen'}
				>
					{sidebarOpen ? '▶' : '◀'}
				</button>

				<DatasheetSidebar
					message={selected}
					isOpen={sidebarOpen}
					onToggle={() => setSidebarOpen((v) => !v)}
					onOrderResolved={(orderId) => {
						if (!selected) return;
						setMessages((prev) => prev.map((m) => (m.id === selected.id ? { ...m, assignedTo: orderId } : m)));
					}}
				/>
			</div>

		</div>
	);
}
