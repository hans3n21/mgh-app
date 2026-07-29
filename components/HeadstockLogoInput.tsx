'use client';

import React, { useEffect, useState } from 'react';
import {
  HEADSTOCK_LOGOS,
  HEADSTOCK_LOGOS_WITH_IMAGE,
  findHeadstockLogo,
} from '@/lib/headstock-logos';

type Props = {
  logoValue: string;
  notesValue: string;
  onLogoChange: (value: string) => void;
  onNotesChange: (value: string) => void;
  hasError?: boolean;
  disabled?: boolean;
};

export default function HeadstockLogoInput({
  logoValue,
  notesValue,
  onLogoChange,
  onNotesChange,
  hasError,
  disabled,
}: Props) {
  const [localLogo, setLocalLogo] = useState(logoValue || '');
  const [localNotes, setLocalNotes] = useState(notesValue || '');

  useEffect(() => {
    setLocalLogo(logoValue || '');
  }, [logoValue]);

  useEffect(() => {
    setLocalNotes(notesValue || '');
  }, [notesValue]);

  const selected = findHeadstockLogo(localLogo);

  return (
    <div className="space-y-2">
      <select
        value={localLogo}
        onChange={(e) => {
          const next = e.target.value;
          setLocalLogo(next);
          onLogoChange(next);
        }}
        disabled={disabled}
        className={`w-full rounded border px-2 py-1.5 transition-colors ${
          hasError
            ? 'border-red-500 bg-red-950/20'
            : 'border-slate-700 bg-slate-950'
        } ${
          disabled
            ? 'opacity-60 cursor-not-allowed'
            : 'focus:border-sky-500 focus:outline-none'
        }`}
      >
        <option value="">Bitte wählen...</option>
        {HEADSTOCK_LOGOS.map((logo) => (
          <option key={logo.value} value={logo.value}>
            {logo.value}
          </option>
        ))}
      </select>

      {/* Referenzbilder: die ausgewählte Variante wird hervorgehoben. */}
      <div className="grid grid-cols-3 gap-2">
        {HEADSTOCK_LOGOS_WITH_IMAGE.map((logo) => {
          const isActive = selected?.value === logo.value;
          return (
            <button
              key={logo.value}
              type="button"
              onClick={() => {
                if (disabled) return;
                setLocalLogo(logo.value);
                onLogoChange(logo.value);
              }}
              disabled={disabled}
              title={logo.description ? `${logo.value} – ${logo.description}` : logo.value}
              className={`group overflow-hidden rounded border text-left transition-colors ${
                isActive
                  ? 'border-sky-500 ring-1 ring-sky-500/50'
                  : 'border-slate-700 hover:border-slate-500'
              } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logo.thumb}
                alt={`Headstock mit ${logo.value}`}
                className="h-16 w-full bg-slate-900 object-cover"
                loading="lazy"
              />
              <span className="block truncate px-1.5 py-1 text-[11px] text-slate-300">
                {logo.value}
              </span>
            </button>
          );
        })}
      </div>

      <input
        type="text"
        value={localNotes}
        onChange={(e) => {
          const next = e.target.value;
          setLocalNotes(next);
          onNotesChange(next);
        }}
        disabled={disabled}
        placeholder="Notizen zur Logo-Farbe oder Platzierung..."
        className={`w-full rounded border px-2 py-1.5 transition-colors ${
          hasError
            ? 'border-red-500 bg-red-950/20'
            : 'border-slate-700 bg-slate-950'
        } ${
          disabled
            ? 'opacity-60 cursor-not-allowed'
            : 'focus:border-sky-500 focus:outline-none'
        }`}
      />
    </div>
  );
}
