"use client";
import React, { useCallback, useEffect, useState } from 'react';
import { normalizeFolderName } from '@/lib/mail/folders';
import type { MailAccountTab } from './AccountSidebar';

interface ImapFolder {
  path: string;
  name: string;
  delimiter?: string | null;
  specialUse?: string | null;
}

interface Props {
  activeAccountId: string | null;
  activeFolder: string;
  onSelectFolder: (folder: string) => void;
  accounts: MailAccountTab[];
  focusKey: string;
  onSelectFocus: (focusKey: string) => void;
  foldersOpen: boolean;
  accountsLoading?: boolean;
  accountsError?: string | null;
  onOpenSettings?: (accountId: string) => void;
  onRetryAccounts?: () => void;
  unreadPerAccount?: Record<string, number>;
}

const SPECIAL_ROLES: Array<{ role: string; icon: string; label: string; names: string[] }> = [
  { role: 'inbox',   icon: '📥', label: 'Posteingang', names: ['inbox', 'posteingang'] },
  { role: 'sent',    icon: '📤', label: 'Gesendet',    names: ['sent', 'sent items', 'sent messages', 'gesendet', 'gesendete elemente'] },
  { role: 'drafts',  icon: '📝', label: 'Entwürfe',    names: ['drafts', 'entwurfe'] },
  { role: 'junk',    icon: '🚫', label: 'Spam',        names: ['junk', 'spam'] },
  { role: 'trash',   icon: '🗑', label: 'Papierkorb',  names: ['trash', 'deleted', 'deleted items', 'deleted messages', 'papierkorb', 'geloschte elemente', 'geloscht'] },
  { role: 'archive', icon: '📦', label: 'Archiv',      names: ['archive', 'archives', 'archiv'] },
];

function splitFolderPath(f: ImapFolder): string[] {
  const delimiter = f.delimiter && f.delimiter.length === 1 ? f.delimiter : null;
  const segments = delimiter ? f.path.split(delimiter) : f.path.split(/[/\\]/);
  return segments.filter(Boolean);
}

function roleForName(name: string): typeof SPECIAL_ROLES[number] | null {
  const normalized = normalizeFolderName(name);
  return SPECIAL_ROLES.find((r) => r.names.includes(normalized)) ?? null;
}

function roleFromSpecialUse(f: ImapFolder): typeof SPECIAL_ROLES[number] | null {
  const raw = normalizeFolderName(String(f.specialUse || '')).replace(/\\/g, '');
  if (!raw) return null;
  return SPECIAL_ROLES.find((r) => r.role === raw || r.names.includes(raw)) ?? null;
}

/**
 * Systemordner werden primaer ueber das IMAP-specialUse-Flag erkannt. Nur wenn kein
 * anderer Ordner die Rolle bereits per Flag belegt, greift der Namens-Fallback — und
 * der ausschliesslich fuer Top-Level-Ordner mit exaktem Namen. Substring-Matching
 * fuehrte vorher dazu, dass verschachtelte Ordner wie "Trash.Spam.Archiv" alle als
 * identisches "Spam" erschienen.
 */
function classifySpecialFolders(folders: ImapFolder[]): Map<string, { icon: string; label: string }> {
  const special = new Map<string, { icon: string; label: string }>();
  const claimed = new Set<string>();
  for (const f of folders) {
    const role = roleFromSpecialUse(f);
    if (role) {
      special.set(f.path, { icon: role.icon, label: role.label });
      claimed.add(role.role);
    }
  }
  for (const f of folders) {
    if (special.has(f.path)) continue;
    const segments = splitFolderPath(f);
    if (segments.length !== 1) continue;
    const role = roleForName(segments[0]);
    if (role && !claimed.has(role.role)) {
      special.set(f.path, { icon: role.icon, label: role.label });
      claimed.add(role.role);
    }
  }
  return special;
}

/** Verschachtelte Ordner als Breadcrumb anzeigen, z.B. "Papierkorb / Spam / Archiv". */
function breadcrumbLabel(f: ImapFolder): string {
  return splitFolderPath(f)
    .map((seg) => roleForName(seg)?.label ?? seg)
    .join(' / ');
}

function getFolderMeta(f: ImapFolder, special: Map<string, { icon: string; label: string }>): { icon: string; label: string } {
  const meta = special.get(f.path);
  if (meta) return meta;
  return { icon: '📁', label: breadcrumbLabel(f) };
}

function railLabel(label: string): string {
  const clean = label.trim();
  if (!clean) return 'MB';
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return words.slice(0, 3).map((w) => w[0]?.toUpperCase() || '').join('');
  }
  return clean.slice(0, 3).toUpperCase();
}

function verticalRailLabel(label: string): string {
  const clean = label.trim();
  if (!clean) return 'Postfach';
  return clean.length > 14 ? `${clean.slice(0, 13)}…` : clean;
}

function railDotClass(accountId: string): string {
  const palette = [
    'bg-emerald-400',
    'bg-sky-400',
    'bg-violet-400',
    'bg-amber-400',
    'bg-rose-400',
    'bg-cyan-400',
  ];
  let hash = 0;
  for (let i = 0; i < accountId.length; i++) hash = (hash + accountId.charCodeAt(i)) % 997;
  return palette[hash % palette.length];
}

export default function FolderSidebar({
  activeAccountId,
  activeFolder,
  onSelectFolder,
  accounts,
  focusKey,
  onSelectFocus,
  foldersOpen,
  accountsLoading = false,
  accountsError = null,
  onOpenSettings,
  onRetryAccounts,
  unreadPerAccount = {},
}: Props) {
  const [folders, setFolders] = useState<ImapFolder[]>([]);
  const [pinnedFolders, setPinnedFolders] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [foldersError, setFoldersError] = useState<string | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  const loadFolders = useCallback(async (accountId: string) => {
    setLoading(true);
    setFoldersError(null);
    try {
      const res = await fetch(`/api/mail-accounts/${accountId}/folders`);
      if (res.ok) {
        const data: ImapFolder[] = await res.json();
        setFolders(data);
        setLoadedFor(accountId);
      } else {
        const data = await res.json().catch(() => null);
        setFolders([]);
        setLoadedFor(accountId);
        setFoldersError(data?.details || data?.error || 'Ordner konnten nicht geladen werden.');
      }
      const profileRes = await fetch(`/api/mail-accounts/${accountId}/profile`);
      if (profileRes.ok) {
        const profile = await profileRes.json();
        setPinnedFolders(Array.isArray(profile?.pinnedFolders) ? profile.pinnedFolders : []);
      } else {
        setPinnedFolders([]);
      }
    } catch {
      setFolders([]);
      setPinnedFolders([]);
      setLoadedFor(accountId);
      setFoldersError('Ordner konnten nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeAccountId && activeAccountId !== loadedFor) {
      loadFolders(activeAccountId);
    }
  }, [activeAccountId, loadedFor, loadFolders]);

  // Separate special (known) folders from regular ones, preserve server order
  const specialMeta = classifySpecialFolders(folders);
  const specialFolders = folders.filter(f => specialMeta.has(f.path));
  const regularFolders = folders.filter(f => !specialMeta.has(f.path));
  const pinnedSet = new Set(pinnedFolders);
  const pinnedExisting = folders.filter((f) => pinnedSet.has(f.path));
  const mainAccount = accounts.find((acc) => acc.isDefault) || accounts[0] || null;

  const settingsTargetAccountId =
    focusKey !== 'all'
      ? focusKey
      : (activeAccountId || accounts[0]?.id || null);
  const settingsTargetAccount = accounts.find((a) => a.id === settingsTargetAccountId);
  const settingsTargetLabel = settingsTargetAccount?.profile?.displayName
    || settingsTargetAccount?.name
    || settingsTargetAccount?.email
    || 'Postfach';
  const homeActive = focusKey === 'all';
  const showFolders = !homeActive && foldersOpen;

  return (
    <div
      className={`flex-shrink-0 flex bg-slate-950 border-r border-slate-800 min-h-0 overflow-hidden transition-[width] duration-300 ease-in-out ${
        showFolders ? 'w-52' : 'w-12'
      }`}
    >
      <div className="w-12 flex-shrink-0 bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900/90 flex flex-col items-center py-3 gap-2">
        {mainAccount && (
          <button
            type="button"
            onClick={() => onSelectFocus('all')}
            title={`Hauptpostfach: ${mainAccount.profile?.displayName || mainAccount.name || mainAccount.email}`}
            className={`relative w-9 h-9 rounded-xl border transition-all duration-200 ${
              homeActive
                ? 'border-sky-500/60 bg-slate-900 text-sky-100 shadow-[0_0_16px_rgba(56,189,248,0.35)]'
                : 'border-transparent bg-slate-900/50 text-slate-400 shadow-[0_0_8px_rgba(56,189,248,0.10)] hover:border-slate-800 hover:bg-slate-900/80 hover:text-slate-200'
            }`}
          >
            <span className="text-sm leading-none">⌂</span>
          </button>
        )}

        {mainAccount && (
          <div className="w-5 h-px bg-slate-800/80 my-1" />
        )}

        {accounts.length === 0 && accountsLoading && (
          <div
            className="w-9 h-9 rounded-xl border border-slate-800 bg-slate-900/50 flex items-center justify-center text-[11px] text-slate-500 animate-pulse"
            title="Postfaecher werden geladen"
            aria-label="Postfaecher werden geladen"
          >
            ...
          </div>
        )}

        {accounts.length === 0 && !accountsLoading && accountsError && (
          <button
            type="button"
            onClick={onRetryAccounts}
            className="w-9 h-9 rounded-xl border border-amber-700/40 bg-amber-950/20 text-amber-300 text-xs hover:bg-amber-900/30 transition"
            title={`${accountsError} Erneut versuchen`}
            aria-label="Postfaecher erneut laden"
          >
            !
          </button>
        )}

        {accounts.map((acc) => {
          const label = acc.profile?.displayName || acc.name || acc.email;
          const unread = unreadPerAccount[acc.id] ?? 0;
          const isActive = focusKey === acc.id;
          const isExpanded = isActive && showFolders;
          return (
            <button
              key={acc.id}
              type="button"
              onClick={() => onSelectFocus(acc.id)}
              title={`${label}${acc.email ? ` (${acc.email})` : ''}`}
              className={`group relative w-9 h-[112px] rounded-l-xl rounded-r-2xl border transition-all duration-200 ${
                isExpanded
                  ? 'translate-x-1 border-slate-700 bg-slate-900 text-sky-100 shadow-[0_0_14px_rgba(56,189,248,0.18),inset_-2px_0_0_rgba(56,189,248,0.8)]'
                  : isActive
                    ? 'border-transparent bg-transparent text-sky-100'
                  : 'border-transparent bg-slate-900/40 text-slate-500 hover:border-slate-800 hover:bg-slate-900/80 hover:text-slate-200'
              }`}
            >
              <span className={`absolute top-2 left-1/2 -translate-x-1/2 h-1.5 w-1.5 rounded-full ${railDotClass(acc.id)} ${isActive ? 'shadow-[0_0_10px_currentColor]' : ''}`} />
              <span
                className={`absolute inset-x-0 top-5 bottom-3 mx-auto flex items-center justify-center text-[10px] font-semibold tracking-[0.18em] leading-none uppercase ${isActive ? 'text-sky-100 [text-shadow:0_0_10px_rgba(56,189,248,0.35)]' : ''}`}
                style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
              >
                {verticalRailLabel(label)}
              </span>
              {isActive && (
                <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 text-[10px] leading-none text-sky-300/80">
                  {showFolders ? '◂' : '▸'}
                </span>
              )}
              {unread > 0 && (
                <span className="absolute inset-x-1 bottom-4 h-5 rounded-full bg-red-500/90 text-white text-[9px] font-semibold leading-5 text-center shadow-[0_0_10px_rgba(239,68,68,0.28)]">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </button>
          );
        })}

        {onOpenSettings && (
          <>
            <div className="w-5 h-px bg-slate-800/80 my-1" />
            <button
              type="button"
              data-inbox-settings-trigger="true"
              disabled={!settingsTargetAccountId}
              onClick={() => {
                if (!settingsTargetAccountId) return;
                onOpenSettings(settingsTargetAccountId);
              }}
              title={`Einstellungen für ${settingsTargetLabel}`}
              className="h-8 w-8 inline-flex items-center justify-center rounded-xl border border-transparent bg-transparent text-[12px] text-slate-300 shadow-[0_0_10px_rgba(125,211,252,0.25)] hover:text-sky-200 hover:shadow-[0_0_14px_rgba(56,189,248,0.45)] transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ⚙
            </button>
          </>
        )}
      </div>
      <div
        className={`min-w-0 overflow-y-auto bg-[linear-gradient(180deg,rgba(2,6,23,0.92)_0%,rgba(2,6,23,0.98)_100%)] transition-all duration-300 ease-in-out ${
          showFolders
            ? 'flex-1 opacity-100 translate-x-0 border-l border-slate-800/80'
            : 'w-0 opacity-0 -translate-x-3 pointer-events-none border-l border-transparent'
        }`}
      >
        <div className="px-2 pt-3 pb-1 flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-1">Ordner</span>
        </div>

        {loading && (
          <div className="px-3 py-2 text-[11px] text-slate-600">Wird geladen…</div>
        )}

        {!loading && !activeAccountId && (
          <div className="px-3 py-2 text-[11px] text-slate-600">Kein Postfach aktiv</div>
        )}

        {/* INBOX als fester erster Eintrag */}
        {!loading && activeAccountId && (
          <FolderButton
            icon="📥"
            label="Posteingang"
            path="INBOX"
            active={activeFolder === 'INBOX' || activeFolder === ''}
            onClick={onSelectFolder}
          />
        )}

        {pinnedExisting.length > 0 && (
          <>
            <div className="px-2 pt-2 pb-1">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-1">Favoriten</span>
            </div>
            {pinnedExisting.map((f) => {
              const meta = getFolderMeta(f, specialMeta);
              return (
                <FolderButton
                  key={`pin-${f.path}`}
                  icon={meta.icon}
                  label={meta.label}
                  path={f.path}
                  active={activeFolder === f.path}
                  onClick={onSelectFolder}
                />
              );
            })}
            <div className="mx-3 my-1.5 border-t border-slate-800" />
          </>
        )}

        {/* Bekannte System-Ordner */}
        {specialFolders.filter(f => f.path !== 'INBOX' && !pinnedSet.has(f.path)).map(f => {
          const meta = getFolderMeta(f, specialMeta);
          return (
            <FolderButton
              key={f.path}
              icon={meta.icon}
              label={meta.label}
              path={f.path}
              active={activeFolder === f.path}
              onClick={onSelectFolder}
            />
          );
        })}

        {/* Trennlinie + weitere Ordner */}
        {regularFolders.length > 0 && (
          <>
            <div className="mx-3 my-1.5 border-t border-slate-800" />
            {regularFolders.filter((f) => !pinnedSet.has(f.path)).map(f => {
              const meta = getFolderMeta(f, specialMeta);
              return (
                <FolderButton
                  key={f.path}
                  icon={meta.icon}
                  label={meta.label}
                  path={f.path}
                  active={activeFolder === f.path}
                  onClick={onSelectFolder}
                />
              );
            })}
          </>
        )}

        {!loading && foldersError && activeAccountId && (
          <div className="px-3 py-2 text-[11px] text-amber-300">
            <div>{foldersError}</div>
            <button
              type="button"
              onClick={() => loadFolders(activeAccountId)}
              className="mt-2 rounded-md border border-amber-500/30 px-2 py-1 text-[10px] text-amber-100 hover:bg-amber-500/10 transition"
            >
              Erneut laden
            </button>
          </div>
        )}

        {!loading && !foldersError && folders.length === 0 && activeAccountId && (
          <div className="px-3 py-2 text-[11px] text-slate-600">Keine Ordner gefunden</div>
        )}
      </div>
    </div>
  );
}

function FolderButton({
  icon, label, path, active, onClick, indent = 0,
}: {
  icon: string;
  label: string;
  path: string;
  active: boolean;
  onClick: (path: string) => void;
  indent?: number;
}) {
  return (
    <button
      type="button"
      onClick={() => onClick(path)}
      title={path}
      className={`w-full flex items-center gap-2 py-1.5 pr-2 text-xs text-left transition-colors rounded-md mx-1 mb-0.5 ${
        active
          ? 'bg-violet-600/20 text-violet-200 font-medium shadow-[inset_0_0_0_1px_rgba(167,139,250,0.2),0_0_12px_rgba(139,92,246,0.18)]'
          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
      }`}
      style={{ paddingLeft: `${8 + indent * 12}px` }}
    >
      <span className="shrink-0 text-sm leading-none">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  );
}
