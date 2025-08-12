'use client';
import React from 'react';
import { AUTOFILL_OPTIONS } from '@/lib/autofill-data';

type Props = {
  fieldKey: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hasError?: boolean;
};

export default function AutoFillInput({ fieldKey, value, onChange, placeholder, hasError }: Props) {
  const listId = `dl-${fieldKey}`;
  const options = (AUTOFILL_OPTIONS[fieldKey] || []).filter(Boolean);

  return (
    <div>
      <input
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full rounded bg-slate-950 border px-2 py-1.5 ${
          hasError ? 'border-red-500 focus:border-red-400' : 'border-slate-800 focus:border-slate-600'
        }`}
      />
      {options.length > 0 && (
        <datalist id={listId}>
          {options.map((opt) => (
            <option key={opt} value={opt} />
          ))}
        </datalist>
      )}
    </div>
  );
}
