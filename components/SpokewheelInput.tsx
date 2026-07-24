'use client';
import React, { useState, useEffect } from 'react';

type Props = {
  value: string;
  onChange: (value: string) => void;
  hasError?: boolean;
  disabled?: boolean;
};

export default function SpokewheelInput({ value, onChange, hasError, disabled }: Props) {
  const [hasSpokewheel, setHasSpokewheel] = useState(false);

  // Initialize from prop value ONCE
  useEffect(() => {
    if (value) {
      const isYes = value.toLowerCase() === 'ja' || value.toLowerCase() === 'yes' || value === 'true';
      setHasSpokewheel(isYes);
    }
  }, []); // Empty dependency array - run only once

  // Handle checkbox change
  const handleSpokewheelChange = (checked: boolean) => {
    setHasSpokewheel(checked);
    onChange(checked ? 'Ja' : 'Nein');
  };

  return (
    <div className="flex items-center gap-2">
      <input
        type="checkbox"
        id="spokewheel-checkbox"
        checked={hasSpokewheel}
        onChange={(e) => handleSpokewheelChange(e.target.checked)}
        disabled={disabled}
        className={`rounded border-slate-600 bg-slate-950 text-sky-600 focus:ring-sky-500 focus:ring-offset-0 disabled:bg-slate-800 disabled:border-slate-500 disabled:cursor-not-allowed ${
          hasError ? 'border-red-500' : ''
        }`}
      />
      <label htmlFor="spokewheel-checkbox" className="text-sm cursor-pointer">
        Spokewheel vorhanden
      </label>
    </div>
  );
}










