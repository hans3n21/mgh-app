'use client';
import React, { useState, useEffect } from 'react';

type Props = {
  value: string;
  onChange: (value: string) => void;
  hasError?: boolean;
  disabled?: boolean;
};

export default function BatteryCompartmentInput({ value, onChange, hasError, disabled }: Props) {
  const [hasBatteryCompartment, setHasBatteryCompartment] = useState(false);
  const [batteryDetails, setBatteryDetails] = useState('');

  // Initialize from prop value ONCE
  useEffect(() => {
    if (value) {
      const isNo = value.toLowerCase() === 'nein' || value.toLowerCase() === 'no';
      setHasBatteryCompartment(!isNo);
      setBatteryDetails(isNo ? '' : (value === 'Ja' || value === 'Yes' ? '' : value));
    }
  }, []); // Empty dependency array - run only once

  // Handle checkbox change
  const handleBatteryCompartmentChange = (checked: boolean) => {
    setHasBatteryCompartment(checked);
    const newValue = checked ? (batteryDetails || 'Ja') : 'Nein';
    onChange(newValue);
  };

  // Handle details change
  const handleDetailsChange = (details: string) => {
    setBatteryDetails(details);
    onChange(details || 'Ja');
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="battery-compartment-checkbox"
          checked={hasBatteryCompartment}
          onChange={(e) => handleBatteryCompartmentChange(e.target.checked)}
          disabled={disabled}
          className="rounded border-slate-600 bg-slate-950 text-sky-600 focus:ring-sky-500 focus:ring-offset-0 disabled:bg-slate-800 disabled:border-slate-500 disabled:cursor-not-allowed"
        />
        <label htmlFor="battery-compartment-checkbox" className="text-sm cursor-pointer">
          Batteriefach vorhanden
        </label>
      </div>
      
      {hasBatteryCompartment && (
        <input
          type="text"
          value={batteryDetails}
          onChange={(e) => handleDetailsChange(e.target.value)}
          disabled={disabled}
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
          placeholder="Batteriefach Details (z.B. Größe, Position)..."
          className={`w-full rounded bg-slate-950 border px-2 py-1.5 text-sm transition-colors ${
            hasError ? 'border-red-500 focus:border-red-400' : 'border-slate-800 focus:border-slate-600 hover:border-slate-700'
          } disabled:bg-slate-900/80 disabled:border-slate-700 disabled:text-slate-400 disabled:cursor-not-allowed`}
          title="Text hierhin ziehen oder eingeben"
        />
      )}
    </div>
  );
}










