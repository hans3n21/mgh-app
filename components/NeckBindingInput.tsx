'use client';
import React, { useState, useEffect } from 'react';

type Props = {
  value: string;
  onChange: (value: string) => void;
  hasError?: boolean;
};

export default function NeckBindingInput({ value, onChange, hasError }: Props) {
  const [hasBinding, setHasBinding] = useState(false);
  const [bindingDetails, setBindingDetails] = useState('');

  // Initialize from prop value ONCE
  useEffect(() => {
    if (value) {
      const isNo = value.toLowerCase() === 'nein' || value.toLowerCase() === 'no';
      setHasBinding(!isNo);
      setBindingDetails(isNo ? '' : (value === 'Ja' || value === 'Yes' ? '' : value));
    }
  }, []); // Empty dependency array - run only once

  // Handle checkbox change
  const handleBindingChange = (checked: boolean) => {
    setHasBinding(checked);
    const newValue = checked ? (bindingDetails || 'Ja') : 'Nein';
    onChange(newValue);
  };

  // Handle details change
  const handleDetailsChange = (details: string) => {
    setBindingDetails(details);
    onChange(details || 'Ja');
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="neck-binding-checkbox"
          checked={hasBinding}
          onChange={(e) => handleBindingChange(e.target.checked)}
          className="rounded border-slate-600 bg-slate-950 text-sky-600 focus:ring-sky-500 focus:ring-offset-0"
        />
        <label htmlFor="neck-binding-checkbox" className="text-sm cursor-pointer">
          Binding vorhanden
        </label>
      </div>
      
      {hasBinding && (
        <input
          type="text"
          value={bindingDetails}
          onChange={(e) => handleDetailsChange(e.target.value)}
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
              handleDetailsChange(text.trim());
            }
          }}
          placeholder="Details zum Hals-Binding (z.B. Material, Farbe)..."
          className={`w-full rounded bg-slate-950 border px-2 py-1.5 text-sm transition-colors ${
            hasError ? 'border-red-500 focus:border-red-400' : 'border-slate-800 focus:border-slate-600 hover:border-slate-700'
          }`}
          title="Text hierhin ziehen oder eingeben"
        />
      )}
    </div>
  );
}










