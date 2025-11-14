'use client';
import React, { useState, useEffect } from 'react';

type Props = {
  value: string;
  onChange: (value: string) => void;
  hasError?: boolean;
};

export default function PickguardInput({ value, onChange, hasError }: Props) {
  const [hasPickguard, setHasPickguard] = useState(false);
  const [pickguardMaterial, setPickguardMaterial] = useState('');

  // Initialize from prop value ONCE
  useEffect(() => {
    if (value) {
      const isNo = value.toLowerCase() === 'nein' || value.toLowerCase() === 'no';
      setHasPickguard(!isNo);
      setPickguardMaterial(isNo ? '' : (value === 'Ja' || value === 'Yes' ? '' : value));
    }
  }, []); // Empty dependency array - run only once

  // Handle checkbox change
  const handlePickguardChange = (checked: boolean) => {
    setHasPickguard(checked);
    const newValue = checked ? (pickguardMaterial || 'Ja') : 'Nein';
    onChange(newValue);
  };

  // Handle material change
  const handleMaterialChange = (material: string) => {
    setPickguardMaterial(material);
    onChange(material || 'Ja');
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="pickguard-checkbox"
          checked={hasPickguard}
          onChange={(e) => handlePickguardChange(e.target.checked)}
          className="rounded border-slate-600 bg-slate-950 text-sky-600 focus:ring-sky-500 focus:ring-offset-0"
        />
        <label htmlFor="pickguard-checkbox" className="text-sm cursor-pointer">
          Pickguard vorhanden
        </label>
      </div>
      
      {hasPickguard && (
        <input
          type="text"
          value={pickguardMaterial}
          onChange={(e) => handleMaterialChange(e.target.value)}
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
              handleMaterialChange(text.trim());
            }
          }}
          placeholder="Pickguard Material (z.B. Kunststoff, Metall)..."
          className={`w-full rounded bg-slate-950 border px-2 py-1.5 text-sm transition-colors ${
            hasError ? 'border-red-500 focus:border-red-400' : 'border-slate-800 focus:border-slate-600 hover:border-slate-700'
          }`}
          title="Text hierhin ziehen oder eingeben"
        />
      )}
    </div>
  );
}










