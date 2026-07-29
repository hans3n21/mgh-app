"use client";
import React, { useState, useEffect, useRef } from 'react';
import { getCategoriesForOrderType, getFieldsForCategory, FIELD_LABELS, CATEGORY_LABELS, isFieldRequired, shouldShowField, sortSpecsByDefinedOrder } from '@/lib/order-presets';
import AutoFillInput from '@/components/AutoFillInput';
import BindingInput from '@/components/BindingInput';
import PickguardInput from '@/components/PickguardInput';
import BatteryCompartmentInput from '@/components/BatteryCompartmentInput';
import SpokewheelInput from '@/components/SpokewheelInput';
import NeckBindingInput from '@/components/NeckBindingInput';
import HeadstockLogoInput from '@/components/HeadstockLogoInput';
import PickupMountInput from '@/components/PickupMountInput';

const AUTO_FIELDS = new Set(['body_shape', 'headstock_type', 'neck_wood', 'fretboard_material', 'finish_body', 'finish_body_top', 'finish_body_back', 'finish_neck', 'headstock_finish']);

type Props = {
	orderId: string;
	orderType: string;
	editable?: boolean;
	onSpecsChange?: (specs: Record<string, string>) => void;
};

export default function OrderDatasheetForm({ orderId, orderType, editable = true, onSpecsChange }: Props) {
	const LINKED_SPEC_KEYS: Record<string, string> = {
		body_surface_treatment: 'finish_body',
		finish_body: 'body_surface_treatment',
	};

	const [specValues, setSpecValues] = useState<Record<string, string>>({});
	const [saving, setSaving] = useState(false);
	const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
	const saveTimerRef = useRef<NodeJS.Timeout | null>(null);

	// Lade Kategorien für diesen Auftragstyp
	const categories = orderType ? getCategoriesForOrderType(orderType) : [];
	const [activeCategories, setActiveCategories] = useState<Set<string>>(new Set());

	// Initial alle Kategorien aktivieren wenn orderType sich ändert
	useEffect(() => {
		if (!orderType) {
			setActiveCategories(new Set());
			return;
		}
		const newCategories = getCategoriesForOrderType(orderType);
		console.log('OrderDatasheetForm: Kategorien geladen', { orderType, categories: newCategories });
		if (newCategories.length > 0) {
			setActiveCategories(new Set(newCategories));
		}
	}, [orderType]);

	// Lade vorhandene Spezifikationen
	useEffect(() => {
		let active = true;
		const load = async () => {
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
		};
		load();
		// Nach dem Uebernehmen eines Vorschlags stehen neue Werte in der DB —
		// ohne dieses Neuladen zeigt das Formular weiter den alten Stand.
		window.addEventListener('mgh:suggestions-applied', load);
		return () => {
			active = false;
			window.removeEventListener('mgh:suggestions-applied', load);
		};
	}, [orderId, orderType]);

	// Debounced Save
	const updateSpec = (key: string, value: string) => {
		if (!editable) return;
		const nextUpdates: Record<string, string> = { [key]: value };
		const linkedKey = LINKED_SPEC_KEYS[key];
		if (linkedKey && (specValues[linkedKey] ?? '') !== (value ?? '')) {
			nextUpdates[linkedKey] = value;
		}

		setSpecValues(prev => ({ ...prev, ...nextUpdates }));
		onSpecsChange?.({ ...specValues, ...nextUpdates });

		// Clear validation error for this field
		const keysToClear = Object.keys(nextUpdates).filter((k) => validationErrors[k]);
		if (keysToClear.length > 0) {
			setValidationErrors(prev => {
				const next = { ...prev };
				keysToClear.forEach((k) => delete next[k]);
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
					body: JSON.stringify(nextUpdates),
				});
				if (!res.ok) throw new Error('Speichern fehlgeschlagen');
			} catch (error) {
				console.error('Fehler beim Speichern:', error);
			} finally {
				setSaving(false);
			}
		}, 500);
	};

	const isTruthySpecValue = (value?: string) => {
		const normalized = (value || '').trim().toLowerCase();
		return normalized === 'ja' || normalized === 'true' || normalized === '1' || normalized === 'yes';
	};

	const shouldRenderField = (fieldKey: string) => {
		if (fieldKey === 'pickup_mount_frame' || fieldKey === 'headstock_logo_notes') return false;
		const hasTop = isTruthySpecValue(specValues['body_has_top']);
		const hasLegacyValue = Boolean((specValues[fieldKey] || '').trim());
		if (fieldKey === 'body_top' || fieldKey === 'body_top_thickness') return hasTop || hasLegacyValue;
		// Mit Top wird das Finish in Top/Korpus aufgeteilt, das Gesamt-Finish entfällt.
		if (fieldKey === 'finish_body_top' || fieldKey === 'finish_body_back') return hasTop || hasLegacyValue;
		if (fieldKey === 'finish_body' || fieldKey === 'body_surface_treatment') return !hasTop;
		return true;
	};

	if (!orderId || !orderType) {
		return (
			<div className="text-center py-8 text-slate-500">
				<div className="text-4xl mb-2">📋</div>
				<div className="text-sm">{!orderId ? 'Kein Auftrag ausgewählt' : 'Auftragstyp wird geladen...'}</div>
			</div>
		);
	}

	if (!editable) {
		return (
			<div className="space-y-4">
				{categories.length > 1 && (
					<div className="flex flex-wrap gap-2">
						<button
							type="button"
							onClick={() => setActiveCategories(new Set(categories))}
							className={`rounded-full px-2 py-1 text-xs ${
								activeCategories.size === categories.length ? 'bg-slate-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
							}`}
						>
							Alle
						</button>
						{categories.map((category) => {
							const isActive = activeCategories.has(category);
							return (
								<button
									key={category}
									type="button"
									onClick={() => {
										const newSet = new Set(activeCategories);
										if (isActive) {
											newSet.delete(category);
										} else {
											newSet.add(category);
										}
										if (newSet.size > 0) {
											setActiveCategories(newSet);
										}
									}}
									className={`rounded-full px-2 py-1 text-xs ${
										isActive
											? 'bg-slate-600 text-white'
											: 'bg-slate-800 text-slate-300 hover:bg-slate-700'
									}`}
								>
									{CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS]}
								</button>
							);
						})}
					</div>
				)}

				<div className="space-y-4">
					{Array.from(activeCategories).map((category) => {
						const visibleFields = getFieldsForCategory(orderType, category as any).filter((fieldKey) => {
							if (category === 'oberflaeche' && orderType === 'FINISH_ONLY') {
								const oberflaeche_typ = specValues['oberflaeche_typ'] || '';
								if (!shouldShowField(fieldKey, oberflaeche_typ)) return false;
							}
							return shouldRenderField(fieldKey);
						});
						if (visibleFields.length === 0) return null;

						return (
							<div key={category} className="space-y-3">
								<h4 className="text-sm font-medium text-slate-300 border-b border-slate-800 pb-2">
									{CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS]}
								</h4>
								<div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
									{visibleFields.map((fieldKey) => {
										const label = FIELD_LABELS[fieldKey] || fieldKey;
										const value = (specValues[fieldKey] || '').trim();
										return (
											<div key={fieldKey} className="rounded border border-slate-800 bg-slate-950/50 px-2.5 py-2">
												<div className="text-[11px] text-slate-500 mb-1">{label}</div>
												<div className={`text-sm leading-snug break-words ${value ? 'text-slate-200' : 'text-slate-600'}`}>
													{value || 'Nicht ausgefuellt'}
												</div>
											</div>
										);
									})}
								</div>
							</div>
						);
					})}
				</div>
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
					{categories.map((category) => {
						const isActive = activeCategories.has(category);
						return (
							<button
								key={category}
								onClick={() => {
									const newSet = new Set(activeCategories);
									if (isActive) {
										newSet.delete(category);
									} else {
										newSet.add(category);
									}
									// Mindestens eine Kategorie muss aktiv sein
									if (newSet.size > 0) {
										setActiveCategories(newSet);
									}
								}}
								className={`rounded-full px-2 py-1 text-xs ${
									isActive
										? 'bg-slate-600 text-white'
										: 'bg-slate-800 text-slate-300 hover:bg-slate-700'
								}`}
							>
								{CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS]}
							</button>
						);
					})}
				</div>
			)}

			{/* Dynamic Form Fields by Category */}
			<div className="space-y-4">
				{activeCategories.size === 0 && categories.length > 0 && (
					<div className="text-xs text-slate-400 mb-2">
						Keine Kategorien aktiv. Bitte Kategorien auswählen.
					</div>
				)}
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

									if (!shouldRenderField(fieldKey)) {
										return null;
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
															) : fieldKey === 'pickup_mount_direct' ? (
																<PickupMountInput
																	directValue={specValues['pickup_mount_direct'] || ''}
																	frameValue={specValues['pickup_mount_frame'] || ''}
																	onDirectChange={(v) => updateSpec('pickup_mount_direct', v)}
																	onFrameChange={(v) => updateSpec('pickup_mount_frame', v)}
																/>
															) : fieldKey === 'headstock_logo' ? (
																<HeadstockLogoInput
																	logoValue={specValues['headstock_logo'] || ''}
																	notesValue={specValues['headstock_logo_notes'] || ''}
																	onLogoChange={(v) => updateSpec('headstock_logo', v)}
																	onNotesChange={(v) => updateSpec('headstock_logo_notes', v)}
																	hasError={!!hasError}
																/>
															) : fieldKey === 'customer_provides_body' || fieldKey === 'customer_provides_neck' ? (
																<div className="flex items-center gap-2">
																	<input
																		type="checkbox"
																		id={`${fieldKey}-checkbox-left`}
																		checked={isTruthySpecValue(specValues[fieldKey])}
																		onChange={(e) => updateSpec(fieldKey, e.target.checked ? 'Ja' : 'Nein')}
																		className="rounded border-slate-600 bg-slate-950 text-sky-600 focus:ring-sky-500 focus:ring-offset-0"
																	/>
																	<label htmlFor={`${fieldKey}-checkbox-left`} className="text-sm cursor-pointer">
																		{label}
																	</label>
																</div>
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
															) : fieldKey === 'body_has_top' ? (
																<div className="flex items-center gap-2">
																	<input
																		type="checkbox"
																		id={`body-top-checkbox-left-${fieldKey}`}
																		checked={isTruthySpecValue(specValues[fieldKey])}
																		onChange={(e) => updateSpec(fieldKey, e.target.checked ? 'Ja' : 'Nein')}
																		className="rounded border-slate-600 bg-slate-950 text-sky-600 focus:ring-sky-500 focus:ring-offset-0"
																	/>
																	<label htmlFor={`body-top-checkbox-left-${fieldKey}`} className="text-sm cursor-pointer">
																		Top vorhanden
																	</label>
																</div>
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

													if (!shouldRenderField(fieldKey)) {
														return null;
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
															) : fieldKey === 'pickup_mount_direct' ? (
																<PickupMountInput
																	directValue={specValues['pickup_mount_direct'] || ''}
																	frameValue={specValues['pickup_mount_frame'] || ''}
																	onDirectChange={(v) => updateSpec('pickup_mount_direct', v)}
																	onFrameChange={(v) => updateSpec('pickup_mount_frame', v)}
																/>
															) : fieldKey === 'headstock_logo' ? (
																<HeadstockLogoInput
																	logoValue={specValues['headstock_logo'] || ''}
																	notesValue={specValues['headstock_logo_notes'] || ''}
																	onLogoChange={(v) => updateSpec('headstock_logo', v)}
																	onNotesChange={(v) => updateSpec('headstock_logo_notes', v)}
																	hasError={!!hasError}
																/>
															) : fieldKey === 'customer_provides_body' || fieldKey === 'customer_provides_neck' ? (
																<div className="flex items-center gap-2">
																	<input
																		type="checkbox"
																		id={`${fieldKey}-checkbox-right`}
																		checked={isTruthySpecValue(specValues[fieldKey])}
																		onChange={(e) => updateSpec(fieldKey, e.target.checked ? 'Ja' : 'Nein')}
																		className="rounded border-slate-600 bg-slate-950 text-sky-600 focus:ring-sky-500 focus:ring-offset-0"
																	/>
																	<label htmlFor={`${fieldKey}-checkbox-right`} className="text-sm cursor-pointer">
																		{label}
																	</label>
																</div>
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
															) : fieldKey === 'body_has_top' ? (
																<div className="flex items-center gap-2">
																	<input
																		type="checkbox"
																		id={`body-top-checkbox-right-${fieldKey}`}
																		checked={isTruthySpecValue(specValues[fieldKey])}
																		onChange={(e) => updateSpec(fieldKey, e.target.checked ? 'Ja' : 'Nein')}
																		className="rounded border-slate-600 bg-slate-950 text-sky-600 focus:ring-sky-500 focus:ring-offset-0"
																	/>
																	<label htmlFor={`body-top-checkbox-right-${fieldKey}`} className="text-sm cursor-pointer">
																		Top vorhanden
																	</label>
																</div>
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
