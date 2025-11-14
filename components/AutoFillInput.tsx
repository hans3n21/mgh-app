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
        onDragOver={(e) => {
          e.preventDefault();
          e.currentTarget.classList.add('border-emerald-500', 'bg-emerald-500/5');
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.currentTarget.classList.remove('border-emerald-500', 'bg-emerald-500/5');
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.currentTarget.classList.remove('border-emerald-500', 'bg-emerald-500/5');
          const text = e.dataTransfer.getData('text/plain');
          if (text) {
            onChange(text.trim());
          }
        }}
        placeholder={placeholder}
        className={`w-full rounded bg-slate-950 border px-2 py-1.5 text-sm transition-colors ${
          hasError ? 'border-red-500 focus:border-red-400' : 'border-slate-800 focus:border-slate-600 hover:border-slate-700'
        }`}
        title="Text hierhin ziehen oder eingeben"
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
