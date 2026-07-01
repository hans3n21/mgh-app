"use client";
import React from 'react';

export interface MailAccountTab {
  id: string;
  name: string;
  email: string;
  isDefault: boolean;
  isActive: boolean;
  profile?: {
    displayName?: string | null;
  } | null;
}

interface Props {
  accounts: MailAccountTab[];
  focusKey: string;
  onSelectFocus: (focusKey: string) => void;
  onOpenSettings?: (accountId: string) => void;
  unreadPerAccount?: Record<string, number>;
}

function shortLabel(label: string): string {
  return label.length > 16 ? `${label.slice(0, 14)}…` : label;
}

function accountTone(label: string): string {
  const value = label.toLowerCase();
  if (value.includes('pickguard')) return 'bg-amber-600 text-white';
  return 'bg-emerald-600 text-white';
}

export default function AccountSidebar({
  accounts,
  focusKey,
  onSelectFocus,
  onOpenSettings,
  unreadPerAccount = {},
}: Props) {
  if (accounts.length === 0) return null;

  const hasMultipleAccounts = accounts.length > 1;

  return (
    <div className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 border-t border-slate-800 bg-slate-950">
      <span className="text-[10px] text-slate-500 mr-1 shrink-0">Fokus:</span>
      {hasMultipleAccounts && (
        <button
          onClick={() => onSelectFocus('all')}
          title="Alle aktiven Postfächer"
          className={`relative flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors shrink-0 ${
            focusKey === 'all'
              ? 'bg-sky-600 text-white'
              : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-slate-100'
          }`}
        >
          Alle
          <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-0.5 rounded-full text-[9px] font-bold leading-none bg-white/20 text-white">
            {Object.values(unreadPerAccount).reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0)}
          </span>
        </button>
      )}
      {accounts.map(acc => {
        const isActive = focusKey === acc.id;
        const label = acc.profile?.displayName || acc.name || acc.email;
        const tone = accountTone(label);
        const unread = unreadPerAccount[acc.id] ?? 0;

        return (
          <div
            key={acc.id}
            className="group relative"
          >
            <button
              onClick={() => onSelectFocus(acc.id)}
              title={`${label}${acc.email ? ` (${acc.email})` : ''}`}
              className={`relative flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors shrink-0 ${
                isActive
                  ? `${tone}`
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-slate-100'
              }`}>
              {shortLabel(label)}
              {unread > 0 && (
                <span className={`inline-flex items-center justify-center min-w-[16px] h-4 px-0.5 rounded-full text-[9px] font-bold leading-none ${
                  isActive ? 'bg-white/25 text-white' : 'bg-red-500 text-white'
                }`}>
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </button>
            {onOpenSettings && (
              <button
                type="button"
                onClick={() => onOpenSettings(acc.id)}
                title={`Einstellungen für ${label}`}
                className="absolute -top-1 -right-1 h-5 w-5 rounded-full border border-slate-700 bg-slate-900 text-[10px] text-slate-400 opacity-0 group-hover:opacity-100 hover:text-slate-200 hover:border-slate-500 transition"
              >
                ⚙
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
