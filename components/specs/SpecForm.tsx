"use client";
import React from 'react';
import type { DraftType, ParsedDraft } from '@/lib/inbox/parse';

type Props = {
	type: DraftType;
	value: ParsedDraft;
	onChange: (next: ParsedDraft) => void;
};

function Field({ label, value, onChange, name }: { label: string; value?: string; onChange: (v: string) => void; name: string }) {
	return (
		<label className="text-xs text-slate-300">
			<span className="block mb-1">{label}</span>
			<input
				name={name}
				value={value || ''}
				onChange={(e) => onChange(e.target.value)}
				onDragOver={(e) => e.preventDefault()}
				onDrop={(e) => {
					const key = e.dataTransfer.getData('text/x-spec-key');
					const txt = e.dataTransfer.getData('text/plain');
					if (!key || !txt) return;
					onChange(txt);
				}}
				className="w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-sm"
			/>
		</label>
	);
}

export default function SpecForm({ type, value, onChange }: Props) {
	return (
		<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
			{(type === 'Hals' || type === 'Rep.' || type === 'Body') && (
				<>
					<Field label="Mensur (mm)" name="scale_length_mm" value={value.scale_length_mm} onChange={(v) => onChange({ ...value, scale_length_mm: v })} />
					<Field label="Griffbrett-Radius (Zoll)" name="fretboard_radius_inch" value={value.fretboard_radius_inch} onChange={(v) => onChange({ ...value, fretboard_radius_inch: v })} />
					<Field label="Griffbrett-Material" name="fretboard_material" value={value.fretboard_material} onChange={(v) => onChange({ ...value, fretboard_material: v })} />
				</>
			)}
			{type === 'Pickguard' && (
				<Field label="Pickup-Konfiguration" name="pickup_config" value={(value as any).pickup_config} onChange={(v) => onChange({ ...value, pickup_config: v })} />
			)}
		</div>
	);
}


