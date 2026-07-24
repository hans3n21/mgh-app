'use client';

import React, { useEffect, useState } from 'react';

type Props = {
  logoValue: string;
  notesValue: string;
  onLogoChange: (value: string) => void;
  onNotesChange: (value: string) => void;
  hasError?: boolean;
  disabled?: boolean;
};

const LOGO_OPTIONS = ['Kein Logo', 'Altes Logo', 'Neues Logo', 'Eigenes Logo'];

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
        {LOGO_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>

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
