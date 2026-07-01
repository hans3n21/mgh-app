'use client';

import React from 'react';

type Props = {
  directValue: string;
  frameValue: string;
  onDirectChange: (value: string) => void;
  onFrameChange: (value: string) => void;
  disabled?: boolean;
};

function isChecked(value: string): boolean {
  const normalized = (value || '').trim().toLowerCase();
  return normalized === 'ja' || normalized === 'yes' || normalized === 'true' || normalized === '1';
}

export default function PickupMountInput({
  directValue,
  frameValue,
  onDirectChange,
  onFrameChange,
  disabled,
}: Props) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
        <input
          type="checkbox"
          checked={isChecked(directValue)}
          onChange={(e) => onDirectChange(e.target.checked ? 'Ja' : 'Nein')}
          disabled={disabled}
          className="rounded border-slate-600 bg-slate-950 text-sky-600 focus:ring-sky-500 focus:ring-offset-0 disabled:bg-slate-800 disabled:border-slate-500 disabled:cursor-not-allowed"
        />
        <span>Direct Mount</span>
      </label>

      <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
        <input
          type="checkbox"
          checked={isChecked(frameValue)}
          onChange={(e) => onFrameChange(e.target.checked ? 'Ja' : 'Nein')}
          disabled={disabled}
          className="rounded border-slate-600 bg-slate-950 text-sky-600 focus:ring-sky-500 focus:ring-offset-0 disabled:bg-slate-800 disabled:border-slate-500 disabled:cursor-not-allowed"
        />
        <span>Frame Mount</span>
      </label>
    </div>
  );
}
