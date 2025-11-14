"use client";
import React, { useState, useEffect, useRef } from 'react';
import { getCategoriesForOrderType, getFieldsForCategory, FIELD_LABELS, CATEGORY_LABELS, isFieldRequired, shouldShowField, sortSpecsByDefinedOrder } from '@/lib/order-presets';
import AutoFillInput from '@/components/AutoFillInput';
import BindingInput from '@/components/BindingInput';
import PickguardInput from '@/components/PickguardInput';
import BatteryCompartmentInput from '@/components/BatteryCompartmentInput';
import SpokewheelInput from '@/components/SpokewheelInput';
import NeckBindingInput from '@/components/NeckBindingInput';

const AUTO_FIELDS = new Set(['body_shape', 'headstock_type', 'neck_wood', 'fretboard_material', 'finish_body']);

type Props = {
	orderId: string;
	orderType: string;
	onSpecsChange?: (specs: Record<string, string>) => void;
};

export default function OrderDatasheetForm({ orderId, orderType, onSpecsChange }: Props) {
	const [specValues, setSpecValues] = useState<Record<string, string>>({});
	const [activeCategories, setActiveCategories] = useState<Set<string>>(new Set());
	const [saving, setSaving] = useState(false);
	const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
	const saveTimerRef = useRef<NodeJS.Timeout | null>(null);

	// Lade Kategorien für diesen Auftragstyp
	const categories = getCategoriesForOrderType(orderType);

	// Initial alle Kategorien aktivieren
	useEffect(() => {
		setActiveCategories(new Set(categories));
	}, [orderType]);

	// Lade vorhandene Spezifikationen
	useEffect(() => {
		let active = true;
		(async () => {
			if (!orderId) return;
			try {
				const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}/spec`);
				if (!active) return;
				if (res.ok) {
					const specs = await res.json();
					// Sortiere Specs nach der definierten Reihenfolge
					const sortedSpecs = sortSpecsByDefinedOrder(specs, orderType);
					const values = sortedSpecs.reduce((acc: Record<string, string>, spec: any) => {
						acc[spec.key] = spec.value;
						return acc;
					}, {});
					setSpecValues(values);
				}
			} catch (error) {
				console.error('Fehler beim Laden der Spezifikationen:', error);
			}
		})();
		return () => { active = false; };
	}, [orderId]);

	// Debounced Save
	const updateSpec = (key: string, value: string) => {
		setSpecValues(prev => ({ ...prev, [key]: value }));
		onSpecsChange?.({ ...specValues, [key]: value });

		// Clear validation error for this field
		if (validationErrors[key]) {
			setValidationErrors(prev => {
				const next = { ...prev };
				delete next[key];
				return next;
			});
		}

		// Debounced save to API
		if (saveTimerRef.current) {
			clearTimeout(saveTimerRef.current);
		}
		saveTimerRef.current = setTimeout(async () => {
			setSaving(true);
			try {
				const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}/spec`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ [key]: value }),
				});
				if (!res.ok) throw new Error('Speichern fehlgeschlagen');
			} catch (error) {
				console.error('Fehler beim Speichern:', error);
			} finally {
				setSaving(false);
			}
		}, 500);
	};

	if (!orderId) {
		return (
			<div className="text-center py-8 text-slate-500">
				<div className="text-4xl mb-2">📋</div>
				<div className="text-sm">Kein Auftrag ausgewählt</div>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			{/* Save Indicator */}
			{saving && (
				<div className="text-xs text-slate-400 flex items-center gap-1">
					<div className="w-3 h-3 border border-slate-400 border-t-transparent rounded-full animate-spin"></div>
					Speichern...
				</div>
			)}

			{/* Category Chips - nur anzeigen wenn mehr als eine Kategorie */}
			{categories.length > 1 && (
				<div className="flex flex-wrap gap-2">
					<button
						onClick={() => setActiveCategories(new Set(categories))}
						className={`rounded-full px-2 py-1 text-xs ${
							activeCategories.size === categories.length ? 'bg-slate-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
						}`}
					>
						Alle
					</button>
					{categories.map((category) => (
						<button
							key={category}
							onClick={() => setActiveCategories(new Set([category]))}
							className={`rounded-full px-2 py-1 text-xs ${
								activeCategories.has(category) && activeCategories.size === 1
									? 'bg-slate-600 text-white'
									: 'bg-slate-800 text-slate-300 hover:bg-slate-700'
							}`}
						>
							{CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS]}
						</button>
					))}
				</div>
			)}

			{/* Dynamic Form Fields by Category */}
			<div className="space-y-4">
				{Array.from(activeCategories).map((category) => {
					const categoryFields = getFieldsForCategory(orderType, category as any);
					if (categoryFields.length === 0) return null;

					return (
						<div key={category} className="space-y-3">
							<h4 className="text-sm font-medium text-slate-300 border-b border-slate-800 pb-2">
								{CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS]}
							</h4>
							
							{/* Category Fields - Word-Style Layout: erste Hälfte links, zweite Hälfte rechts */}
							<div className="grid grid-cols-2 gap-3 text-sm">
								{(() => {
									const halfLength = Math.ceil(categoryFields.length / 2);
									const leftFields = categoryFields.slice(0, halfLength);
									const rightFields = categoryFields.slice(halfLength);
									
									return (
										<>
											{/* Linke Spalte */}
											<div className="space-y-3">
												{leftFields.map((fieldKey) => {
									const isRequiredField = isFieldRequired(orderType, category as any, fieldKey);
									const hasError = validationErrors[fieldKey];
									const label = FIELD_LABELS[fieldKey] || fieldKey;

									// Bedingte Feldanzeige für Oberflächenbehandlung
									if (category === 'oberflaeche' && orderType === 'FINISH_ONLY') {
										const oberflaeche_typ = specValues['oberflaeche_typ'] || '';
										if (!shouldShowField(fieldKey, oberflaeche_typ)) {
											return null;
										}
									}


													return (
														<label key={fieldKey} className="block">
															<div className="text-xs text-slate-400 mb-1 flex items-center gap-1">
																{label}
																{isRequiredField && (
																	<span className="text-red-400">*</span>
																)}
															</div>

															{fieldKey === 'pickguard' ? (
															<PickguardInput
																value={specValues[fieldKey] || ''}
																onChange={(v) => updateSpec(fieldKey, v)}
																hasError={!!hasError}
															/>
														) : fieldKey === 'battery_compartment' ? (
															<BatteryCompartmentInput
																value={specValues[fieldKey] || ''}
																onChange={(v) => updateSpec(fieldKey, v)}
																hasError={!!hasError}
															/>
														) : fieldKey === 'spokewheel' ? (
															<SpokewheelInput
																value={specValues[fieldKey] || ''}
																onChange={(v) => updateSpec(fieldKey, v)}
																hasError={!!hasError}
															/>
														) : fieldKey === 'neck_binding' ? (
															<NeckBindingInput
																value={specValues[fieldKey] || ''}
																onChange={(v) => updateSpec(fieldKey, v)}
																hasError={!!hasError}
															/>
														) : fieldKey === 'body_binding' ? (
																<BindingInput
																	value={specValues[fieldKey] || ''}
																	onChange={(v) => updateSpec(fieldKey, v)}
																	hasError={!!hasError}
																/>
															) : AUTO_FIELDS.has(fieldKey) ? (
																<AutoFillInput
																	fieldKey={fieldKey}
																	value={specValues[fieldKey] || ''}
																	onChange={(v) => updateSpec(fieldKey, v)}
																	placeholder={isRequiredField ? 'Pflichtfeld...' : 'Wert eingeben...'}
																	hasError={!!hasError}
																/>
															) : (
																<input
																	value={specValues[fieldKey] || ''}
																	onChange={(e) => updateSpec(fieldKey, e.target.value)}
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
																			updateSpec(fieldKey, text.trim());
																		}
																	}}
																	className={`w-full rounded bg-slate-950 border px-2 py-1.5 text-sm transition-colors ${hasError ? 'border-red-500 focus:border-red-400' : 'border-slate-800 focus:border-slate-600 hover:border-slate-700'}`}
																	placeholder={isRequiredField ? 'Pflichtfeld...' : 'Wert eingeben...'}
																	title="Text hierhin ziehen oder eingeben"
																/>
															)}

															{hasError && <div className="text-xs text-red-400 mt-1">{hasError}</div>}
														</label>
													);
												})}
											</div>
											
											{/* Rechte Spalte */}
											<div className="space-y-3">
												{rightFields.map((fieldKey) => {
													const isRequiredField = isFieldRequired(orderType, category as any, fieldKey);
													const hasError = validationErrors[fieldKey];
													const label = FIELD_LABELS[fieldKey] || fieldKey;

													// Bedingte Feldanzeige für Oberflächenbehandlung
													if (category === 'oberflaeche' && orderType === 'FINISH_ONLY') {
														const oberflaeche_typ = specValues['oberflaeche_typ'] || '';
														if (!shouldShowField(fieldKey, oberflaeche_typ)) {
															return null;
														}
													}


													return (
														<label key={fieldKey} className="block">
															<div className="text-xs text-slate-400 mb-1 flex items-center gap-1">
																{label}
																{isRequiredField && (
																	<span className="text-red-400">*</span>
																)}
															</div>

															{fieldKey === 'pickguard' ? (
															<PickguardInput
																value={specValues[fieldKey] || ''}
																onChange={(v) => updateSpec(fieldKey, v)}
																hasError={!!hasError}
															/>
														) : fieldKey === 'battery_compartment' ? (
															<BatteryCompartmentInput
																value={specValues[fieldKey] || ''}
																onChange={(v) => updateSpec(fieldKey, v)}
																hasError={!!hasError}
															/>
														) : fieldKey === 'spokewheel' ? (
															<SpokewheelInput
																value={specValues[fieldKey] || ''}
																onChange={(v) => updateSpec(fieldKey, v)}
																hasError={!!hasError}
															/>
														) : fieldKey === 'neck_binding' ? (
															<NeckBindingInput
																value={specValues[fieldKey] || ''}
																onChange={(v) => updateSpec(fieldKey, v)}
																hasError={!!hasError}
															/>
														) : fieldKey === 'body_binding' ? (
																<BindingInput
																	value={specValues[fieldKey] || ''}
																	onChange={(v) => updateSpec(fieldKey, v)}
																	hasError={!!hasError}
																/>
															) : AUTO_FIELDS.has(fieldKey) ? (
																<AutoFillInput
																	fieldKey={fieldKey}
																	value={specValues[fieldKey] || ''}
																	onChange={(v) => updateSpec(fieldKey, v)}
																	placeholder={isRequiredField ? 'Pflichtfeld...' : 'Wert eingeben...'}
																	hasError={!!hasError}
																/>
															) : (
																<input
																	value={specValues[fieldKey] || ''}
																	onChange={(e) => updateSpec(fieldKey, e.target.value)}
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
																			updateSpec(fieldKey, text.trim());
																		}
																	}}
																	className={`w-full rounded bg-slate-950 border px-2 py-1.5 text-sm transition-colors ${hasError ? 'border-red-500 focus:border-red-400' : 'border-slate-800 focus:border-slate-600 hover:border-slate-700'}`}
																	placeholder={isRequiredField ? 'Pflichtfeld...' : 'Wert eingeben...'}
																	title="Text hierhin ziehen oder eingeben"
																/>
															)}

															{hasError && <div className="text-xs text-red-400 mt-1">{hasError}</div>}
														</label>
													);
												})}
											</div>
										</>
									);
								})()}
							</div>
						</div>
					);
				})}

				{activeCategories.size === 0 && (
					<div className="text-center py-6 text-slate-500">
						<div className="text-3xl mb-2">📋</div>
						<div className="text-sm font-medium mb-1">Kategorie auswählen</div>
						<div className="text-xs">Wähle eine oder mehrere Kategorien aus</div>
					</div>
				)}
			</div>

			{/* Validation Summary */}
			{Object.keys(validationErrors).length > 0 && (
				<div className="border border-red-500/20 bg-red-500/10 rounded-lg p-3">
					<div className="text-sm font-medium text-red-400 mb-2">
						Pflichtfelder fehlen:
					</div>
					<ul className="text-xs text-red-300 space-y-1">
						{Object.entries(validationErrors).map(([field, error]) => (
							<li key={field}>• {error}</li>
						))}
					</ul>
				</div>
			)}
		</div>
	);
}
