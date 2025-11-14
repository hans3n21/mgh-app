"use client";
import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import type { Message } from './types';
import { suggestType } from '@/lib/inbox/rules';
import { parseFields as parseDraftFields, type DraftType, type ParsedDraft } from '@/lib/inbox/parse';
import SpecForm from '@/components/specs/SpecForm';
import OrderDatasheetForm from './OrderDatasheetForm';
import OrderImages from './OrderImages';
import OrderPricing from './OrderPricing';
import { getCategoriesForOrderType, getFieldsForCategory } from '@/lib/order-presets';

type Props = {
	message: Message | null;
	isOpen: boolean;
	onToggle: () => void;
	onOrderResolved?: (orderId: string) => void;
};

export default function DatasheetSidebar({ message, isOpen, onToggle, onOrderResolved }: Props) {
	const suggestion = useMemo(() => {
		if (!message) return null as null | { type: string | null };
		return suggestType(message.html || message.snippet || '', message.subject || '');
	}, [message]);

	const initialDraft = useMemo(() => {
		if (!message) return { fields: {}, source: 'regex' } as { fields: ParsedDraft; source: 'regex' };
		return parseDraftFields(((suggestion?.type as any) ?? 'Hals') as DraftType, { html: message.html as any, text: (message as any).text || message.snippet, subject: message.subject });
	}, [message, suggestion]);

	const [draft, setDraft] = useState<ParsedDraft>({});
	useEffect(() => {
		setDraft(initialDraft.fields);
	}, [initialDraft]);

	const [submitting, setSubmitting] = useState(false);
	const [toast, setToast] = useState<string | null>(null);
	// Auftragsliste und ausgewählter Auftrag
	const [availableOrders, setAvailableOrders] = useState<Array<{id: string; title: string; type: string; customer: any}>>([]);
	const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
	const [orderType, setOrderType] = useState<string | null>(null);
	const [orderData, setOrderData] = useState<any>(null);
	const [showOrderDropdown, setShowOrderDropdown] = useState(false);
	const [showNewOrderForm, setShowNewOrderForm] = useState(false);
	const [newOrderType, setNewOrderType] = useState<string>('GUITAR');
	const [customers, setCustomers] = useState<Array<{id: string; name: string; email?: string; phone?: string}>>([]);
	const [isDragOver, setIsDragOver] = useState(false);
	const [editingCustomer, setEditingCustomer] = useState(false);
	const [customerForm, setCustomerForm] = useState({
		name: '', 
		email: '', 
		phone: '',
		addressLine1: '',
		postalCode: '',
		city: '',
		country: 'DE'
	});
	const [orderImages, setOrderImages] = useState<any[]>([]);
	const [imageRefreshTrigger, setImageRefreshTrigger] = useState(0);
	const fileInputRef = useRef<HTMLInputElement>(null);
	
	// Für die Bearbeitung des Auftragsnamens
	const [editingOrderTitle, setEditingOrderTitle] = useState(false);
	const [orderTitleValue, setOrderTitleValue] = useState('');
	
	// Funktion zum Speichern des Auftragsnamens
	const saveOrderTitle = async () => {
		if (!selectedOrderId || !orderTitleValue.trim()) return;
		
		try {
			const res = await fetch(`/api/orders/${encodeURIComponent(selectedOrderId)}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ title: orderTitleValue.trim() }),
			});
			
			if (res.ok) {
				const updatedOrder = await res.json();
				setOrderData((prev: any) => prev ? { ...prev, title: updatedOrder.title } : null);
				setEditingOrderTitle(false);
				setToast('Auftragsname aktualisiert');
				setTimeout(() => setToast(null), 2000);
			} else {
				setToast('Fehler beim Speichern des Namens');
				setTimeout(() => setToast(null), 3000);
			}
		} catch (error) {
			console.error('Error updating order title:', error);
			setToast('Fehler beim Speichern des Namens');
			setTimeout(() => setToast(null), 3000);
		}
	};

	// Lade verfügbare Aufträge und Kunden
	useEffect(() => {
		let active = true;
		(async () => {
			try {
				const [ordersRes, customersRes] = await Promise.all([
					fetch('/api/orders'),
					fetch('/api/customers')
				]);
				if (!active) return;
				if (ordersRes.ok) {
					const orders = await ordersRes.json();
					setAvailableOrders(orders.map((o: any) => ({ id: o.id, title: o.title, type: o.type, customer: o.customer })));
				}
				if (customersRes.ok) {
					const customerData = await customersRes.json();
					setCustomers(customerData);
				}
			} catch {}
		})();
		return () => { active = false; };
	}, []);

	// Memoized callbacks to prevent infinite loops
	const handleImagesChange = useCallback((images: any[]) => {
		setOrderImages(images);
	}, []);

	const handlePriceUpdate = useCallback((amount: string) => {
		// Optional: Callback für Preis-Updates
	}, []);

	// Setze ausgewählten Auftrag basierend auf der aktuell ausgewählten Mail
	useEffect(() => {
		if (message?.assignedTo) {
			// Wechsle zum zugeordneten Auftrag, auch wenn bereits ein anderer ausgewählt ist
			const previousOrderId = selectedOrderId;
			setSelectedOrderId(message.assignedTo);
			
			// Zeige kurzes Feedback wenn Auftrag automatisch gewechselt wurde
			if (previousOrderId && previousOrderId !== message.assignedTo) {
				setToast(`Auftrag gewechselt zu ${message.assignedTo}`);
				setTimeout(() => setToast(null), 2000);
			}
		} else if (message) {
			// Wenn Mail keinem Auftrag zugeordnet ist, deselektiere aktuellen Auftrag
			setSelectedOrderId(null);
		}
	}, [message?.assignedTo, message?.id]); // Abhängig von assignedTo UND message.id

	// Lade Auftragsdaten wenn Auftrag gewählt wird
	useEffect(() => {
		let active = true;
		(async () => {
			if (!selectedOrderId) {
				setOrderType(null);
				setOrderData(null);
				setOrderTitleValue('');
				return;
			}
			try {
				const res = await fetch(`/api/orders/${encodeURIComponent(selectedOrderId)}`);
				if (!active) return;
				if (res.ok) {
					const data = await res.json();
					setOrderType(data?.type || null);
					setOrderData(data);
					setOrderTitleValue(data?.title || '');
				}
			} catch {}
		})();
		return () => { active = false; };
	}, [selectedOrderId]);

	// Prefill aus bestehenden Auftrags-Specs
	useEffect(() => {
		let active = true;
		(async () => {
			if (!selectedOrderId) return;
			try {
				const res = await fetch(`/api/orders/${encodeURIComponent(selectedOrderId)}/spec`);
				if (!active) return;
				if (res.ok) {
					const list = await res.json();
					const map: Record<string, string> = {};
					for (const it of Array.isArray(list) ? list : []) {
						map[it.key] = it.value;
					}
					setDraft((prev) => ({
						...prev,
						scale_length_mm: map['fretboard_scale'] ?? prev.scale_length_mm,
						fretboard_radius_inch: map['fretboard_radius'] ?? prev.fretboard_radius_inch,
						fretboard_material: map['fretboard_material'] ?? prev.fretboard_material,
					}));
				}
			} catch {}
		})();
		return () => { active = false; };
	}, [selectedOrderId]);

	function buildSpecUpdateForOrderType(currentOrderType: string | null): Record<string, string> {
		if (!currentOrderType) return {};
		const categories = getCategoriesForOrderType(currentOrderType);
		const allowed = new Set<string>();
		for (const cat of categories) getFieldsForCategory(currentOrderType, cat).forEach((k) => allowed.add(k));
		const candidate: Record<string, string> = {};
		if (draft.fretboard_material && allowed.has('fretboard_material')) candidate['fretboard_material'] = String(draft.fretboard_material);
		if (draft.fretboard_radius_inch && allowed.has('fretboard_radius')) candidate['fretboard_radius'] = String(draft.fretboard_radius_inch);
		if (draft.scale_length_mm && allowed.has('fretboard_scale')) candidate['fretboard_scale'] = String(draft.scale_length_mm);
		return candidate;
	}

	// Neuen Auftrag erstellen
	const createNewOrder = async () => {
		if (!message) return;
		setSubmitting(true);
		try {
			let customerId = null;
			
			// Verwende Kundendaten aus dem Formular wenn bearbeitet, sonst aus der Mail
			const customerData = editingCustomer ? customerForm : {
				name: message.fromName || message.fromEmail || 'Unbekannt',
				email: message.fromEmail || '',
				phone: ''
			};

			if (customerData.email) {
				const existingCustomer = customers.find(c => c.email === customerData.email);
				if (existingCustomer) {
					customerId = existingCustomer.id;
				} else {
					const customerRes = await fetch('/api/customers', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify(customerData),
					});
					if (customerRes.ok) {
						const newCustomer = await customerRes.json();
						customerId = newCustomer.id;
						setCustomers(prev => [...prev, newCustomer]);
					}
				}
			}

			if (!customerId && customers.length > 0) {
				customerId = customers[0].id; // Fallback
			}

			if (!customerId) {
				setToast('Fehler: Kein Kunde verfügbar');
				return;
			}

			const orderRes = await fetch('/api/orders', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					title: message.subject || 'Neuer Auftrag',
					type: newOrderType,
					customerId: customerId,
				}),
			});

			if (!orderRes.ok) {
				const errorData = await orderRes.json();
				console.error('Order creation failed:', errorData);
				throw new Error('Auftrag konnte nicht erstellt werden');
			}
			
			const newOrder = await orderRes.json();
			setAvailableOrders(prev => [...prev, {
				id: newOrder.id,
				title: newOrder.title,
				type: newOrder.type,
				customer: newOrder.customer
			}]);
			setSelectedOrderId(newOrder.id);
			setShowNewOrderForm(false);
			setEditingCustomer(false);
			
			// Mail dem neuen Auftrag zuordnen
			await fetch('/api/inbox/assign-order', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ messageId: message.id, orderId: newOrder.id }),
			});

			try { (message as any).assignedTo = newOrder.id; } catch {}
			onOrderResolved?.(newOrder.id);
			setToast(`Neuer Auftrag ${newOrder.id} erstellt`);
		} catch (e) {
			console.error('Create order error:', e);
			setToast('Fehler beim Erstellen des Auftrags');
		} finally {
			setSubmitting(false);
		}
	};

	// Drag & Drop Handler für Anhänge und Dateien
	const handleDragOver = (e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragOver(true);
	};

	const handleDragLeave = (e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragOver(false);
	};

	const handleDrop = async (e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragOver(false);

		if (!selectedOrderId) {
			setToast('Bitte erst einen Auftrag auswählen');
			return;
		}

		try {
			// Prüfe erst auf Mail-Anhänge
			const attachmentUrl = e.dataTransfer.getData('text/attachment-url');
			const attachmentName = e.dataTransfer.getData('text/attachment-name');
			
			if (attachmentUrl) {
				// Mail-Anhang verarbeiten
				setSubmitting(true);
				
				const res = await fetch(`/api/orders/${encodeURIComponent(selectedOrderId)}/images`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						path: attachmentUrl,
						comment: `Mail-Anhang: ${attachmentName || 'Unbekannt'}`,
						attach: true,
						position: orderImages.length,
						scope: 'body'
					}),
				});

				if (!res.ok) throw new Error('Fehler beim Hinzufügen des Bildes');
				
				const newImage = await res.json();
				setOrderImages(prev => [...prev, newImage]);
				setImageRefreshTrigger(prev => prev + 1);
				setToast(`Anhang "${attachmentName}" zum Auftrag hinzugefügt`);
			} else {
				// Normale Dateien verarbeiten
				const files = Array.from(e.dataTransfer.files);
				if (files.length === 0) {
					setToast('Keine gültigen Dateien');
					return;
				}

				await handleFileUpload(files);
			}
		} catch (error) {
			console.error('Drag & Drop Fehler:', error);
			setToast('Fehler beim Hinzufügen der Datei');
		} finally {
			setSubmitting(false);
		}
	};

	// Datei-Upload Handler
	const handleFileUpload = async (files: File[]) => {
		if (!selectedOrderId) {
			setToast('Bitte erst einen Auftrag auswählen');
			return;
		}

		setSubmitting(true);

		try {
			const createdImages: any[] = [];
			
			// Erstelle Promises für alle Datei-Uploads
			const uploadPromises = Array.from(files).map((file, index) => {
				return new Promise<void>((resolve, reject) => {
					const reader = new FileReader();
					reader.onload = async (e) => {
						try {
							const dataUrl = e.target?.result as string;
							const response = await fetch(`/api/orders/${encodeURIComponent(selectedOrderId)}/images`, {
								method: 'POST',
								headers: { 'Content-Type': 'application/json' },
								body: JSON.stringify({
									path: dataUrl,
									comment: `Upload: ${file.name}`,
									position: orderImages.length + index,
									attach: true,
									scope: 'body'
								}),
							});

							if (!response.ok) {
								throw new Error(`Fehler beim Upload von ${file.name}`);
							}
							
							const newImage = await response.json();
							createdImages.push(newImage);
							resolve();
						} catch (error) {
							console.error(`Fehler beim Upload von ${file.name}:`, error);
							reject(error);
						}
					};
					reader.onerror = () => reject(new Error(`Fehler beim Lesen von ${file.name}`));
					reader.readAsDataURL(file);
				});
			});

			// Warte auf alle Uploads
			const results = await Promise.allSettled(uploadPromises);
			const failed = results.filter(r => r.status === 'rejected').length;
			
			if (failed > 0) {
				setToast(`${failed} von ${files.length} Datei(en) konnten nicht hochgeladen werden`);
			} else {
				setToast(`${files.length} Datei(en) erfolgreich hochgeladen`);
			}

			// Update images state
			if (createdImages.length > 0) {
				setOrderImages(prev => [...prev, ...createdImages]);
				setImageRefreshTrigger(prev => prev + 1);
			}
		} catch (error) {
			console.error('File Upload Fehler:', error);
			setToast('Fehler beim Hochladen der Dateien');
		} finally {
			setSubmitting(false);
		}
	};
	useEffect(() => {
		if (toast) {
			const t = setTimeout(() => setToast(null), 2000);
			return () => clearTimeout(t);
		}
	}, [toast]);

	// Dropdown schließen bei Click außerhalb
	useEffect(() => {
		function handleClickOutside(event: MouseEvent) {
			if (showOrderDropdown && !(event.target as Element)?.closest('.order-dropdown')) {
				setShowOrderDropdown(false);
			}
		}
		document.addEventListener('mousedown', handleClickOutside);
		return () => document.removeEventListener('mousedown', handleClickOutside);
	}, [showOrderDropdown]);

	return (
		<div 
			className={`border-l border-slate-800 h-full bg-slate-900 transition-[width] duration-200 ease-in-out ${isOpen ? 'w-[36rem]' : 'w-0'} overflow-hidden flex-shrink-0`}
			aria-label="Datenblatt-Seitenleiste"
		>
			<div className="relative h-full flex flex-col overflow-hidden">
				{isOpen && (
					<div className="h-full flex flex-col overflow-hidden">
						<div className="px-3 py-2 border-b border-slate-800 space-y-3 flex-shrink-0">
							<div className="flex items-center justify-between">
								<h3 className="text-sm font-semibold">Auftragsverwaltung</h3>
								<button
									onClick={() => {
										const newState = !showNewOrderForm;
										setShowNewOrderForm(newState);
										if (newState && message) {
											// Initialisiere Kundenformular mit Mail-Daten
											setCustomerForm({
												name: message.fromName || message.fromEmail || '',
												email: message.fromEmail || '',
												phone: '',
												addressLine1: '',
												postalCode: '',
												city: '',
												country: 'DE'
											});
											setEditingCustomer(true);
										} else {
											setEditingCustomer(false);
										}
									}}
									className="text-xs px-2 py-1 rounded border border-slate-700 hover:bg-slate-800 text-slate-300"
								>
									{showNewOrderForm ? '✕' : '+ Neu'}
								</button>
							</div>
							
							{/* Kompakte Auftrags-Auswahl */}
							{!showNewOrderForm && (
								<div className="flex gap-2 items-center">
									<div className="relative order-dropdown flex-1">
										<button
											onClick={() => setShowOrderDropdown(!showOrderDropdown)}
											className="w-full text-left px-2 py-1 text-xs border border-slate-700 rounded bg-slate-800 hover:bg-slate-700 flex items-center justify-between"
										>
											<span className="truncate">
												{selectedOrderId ? (
													availableOrders.find(o => o.id === selectedOrderId)?.id || selectedOrderId
												) : 'Auftrag wählen...'}
											</span>
											<span className="text-slate-400 ml-2">{showOrderDropdown ? '▲' : '▼'}</span>
										</button>
									{showOrderDropdown && (
										<div className="absolute top-full left-0 right-0 z-20 mt-1 max-h-48 overflow-auto bg-slate-800 border border-slate-700 rounded shadow-lg">
											<button
												onClick={() => {
													setSelectedOrderId(null);
													setShowOrderDropdown(false);
												}}
												className="w-full text-left px-2 py-1 text-xs hover:bg-slate-700 text-slate-400"
											>
												Kein Auftrag
											</button>
											{availableOrders.map((order) => (
												<button
													key={order.id}
													onClick={() => {
														setSelectedOrderId(order.id);
														setShowOrderDropdown(false);
													}}
													className={`w-full text-left px-2 py-1 text-xs hover:bg-slate-700 ${
														selectedOrderId === order.id ? 'bg-slate-700 text-slate-100' : 'text-slate-200'
													}`}
												>
													<div className="font-medium">{order.id}</div>
													<div className="text-slate-400 text-[10px]">{order.title} • {order.type}</div>
												</button>
											))}
										</div>
									)}
									</div>
									
									{/* Button zum Auftrag */}
									{selectedOrderId && (
										<a
											href={`/app/orders/${selectedOrderId}`}
											target="_blank"
											rel="noopener noreferrer"
											className="px-2 py-1 text-xs bg-sky-600 hover:bg-sky-500 text-white rounded flex items-center justify-center transition-colors"
											title={`Auftrag ${selectedOrderId} öffnen`}
										>
											🔗
										</a>
									)}
									
									{/* Auftragsname bearbeiten - rechts neben Dropdown */}
									{selectedOrderId && orderData && (
										<div className="flex-1">
											{editingOrderTitle ? (
												<div className="flex gap-1">
													<input
														type="text"
														value={orderTitleValue}
														onChange={(e) => setOrderTitleValue(e.target.value)}
														onKeyDown={(e) => {
															if (e.key === 'Enter') {
																saveOrderTitle();
															} else if (e.key === 'Escape') {
																setOrderTitleValue(orderData.title || '');
																setEditingOrderTitle(false);
															}
														}}
														className="flex-1 px-2 py-1 text-xs bg-slate-800 border border-slate-600 rounded text-slate-200 focus:outline-none focus:border-sky-500"
														placeholder="Auftragsname..."
														autoFocus
													/>
													<button
														onClick={saveOrderTitle}
														className="px-1.5 py-1 text-xs bg-emerald-600 hover:bg-emerald-500 text-white rounded"
														title="Speichern"
													>
														✓
													</button>
													<button
														onClick={() => {
															setOrderTitleValue(orderData.title || '');
															setEditingOrderTitle(false);
														}}
														className="px-1.5 py-1 text-xs bg-slate-600 hover:bg-slate-500 text-white rounded"
														title="Abbrechen"
													>
														✕
													</button>
												</div>
											) : (
												<div 
													onClick={() => setEditingOrderTitle(true)}
													className="px-2 py-1 text-xs bg-slate-800 border border-slate-700 rounded text-slate-200 hover:bg-slate-700 cursor-pointer flex items-center justify-between group"
													title="Klicken zum Bearbeiten"
												>
													<span className="truncate text-slate-300">{orderData.title || 'Kein Name'}</span>
													<span className="ml-1 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity text-[10px]">✏️</span>
												</div>
											)}
										</div>
									)}
								</div>
							)}

							{showNewOrderForm && (
								<div className="space-y-2">
									<div>
										<label className="block text-xs text-slate-400 mb-1">Auftragstyp</label>
										<select 
											value={newOrderType} 
											onChange={(e) => setNewOrderType(e.target.value)}
											className="w-full text-xs px-2 py-1 border border-slate-700 rounded bg-slate-800 text-slate-200"
										>
											<option value="GUITAR">Gitarre</option>
											<option value="BODY">Body</option>
											<option value="NECK">Hals</option>
											<option value="PICKGUARD">Pickguard</option>
											<option value="PICKUPS">Pickups</option>
											<option value="REPAIR">Reparatur</option>
											<option value="ENGRAVING">Gravur</option>
											<option value="FINISH_ONLY">Finish</option>
										</select>
									</div>
									<div className="flex gap-2">
										<button
											onClick={createNewOrder}
											disabled={submitting}
											className="flex-1 text-xs px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50"
										>
											Erstellen
										</button>
										<button
											onClick={() => setShowNewOrderForm(false)}
											className="text-xs px-2 py-1 rounded border border-slate-700 hover:bg-slate-800 text-slate-300"
										>
											Abbrechen
										</button>
									</div>
								</div>
							)}
						</div>
						<div className="p-3 space-y-3 overflow-auto flex-1 min-h-0">
							{/* Kundendaten anzeigen */}
							{(orderData?.customer || showNewOrderForm) && (
								<div className="text-xs bg-slate-900/50 border border-slate-800/50 rounded p-3">
									{!editingCustomer && !showNewOrderForm && orderData?.customer && (
										<div className="flex items-center gap-2">
											<span className="text-slate-400">Kunde:</span>
											<span className="text-slate-200 font-medium">{orderData.customer.name}</span>
											{orderData.customer.phone && (
												<>
													<span className="text-slate-400">•</span>
													<a 
														href={`tel:${orderData.customer.phone}`}
														className="text-slate-300 hover:text-sky-400 transition-colors"
														title={`Anrufen: ${orderData.customer.phone}`}
													>
														{orderData.customer.phone}
													</a>
												</>
											)}
											<button
												onClick={() => {
													setEditingCustomer(true);
													setCustomerForm({
														name: orderData.customer.name || '',
														email: orderData.customer.email || '',
														phone: orderData.customer.phone || '',
														addressLine1: (orderData.customer as any)?.addressLine1 || '',
														postalCode: (orderData.customer as any)?.postalCode || '',
														city: (orderData.customer as any)?.city || '',
														country: (orderData.customer as any)?.country || 'DE'
													});
												}}
												className="text-slate-400 hover:text-slate-200 text-xs ml-auto"
												title="Kunde bearbeiten"
											>
												✏️
											</button>
										</div>
									)}
									
									{(editingCustomer || showNewOrderForm) && (
										<div className="space-y-2">
											<input
												type="text"
												value={customerForm.name}
												onChange={(e) => setCustomerForm(prev => ({...prev, name: e.target.value}))}
												placeholder="Name"
												className="w-full text-xs px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-200"
											/>
											<input
												type="email"
												value={customerForm.email}
												onChange={(e) => setCustomerForm(prev => ({...prev, email: e.target.value}))}
												placeholder="E-Mail"
												className="w-full text-xs px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-200"
											/>
											<input
												type="text"
												value={customerForm.phone}
												onChange={(e) => setCustomerForm(prev => ({...prev, phone: e.target.value}))}
												placeholder="Telefon"
												className="w-full text-xs px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-200"
											/>
											<input
												type="text"
												value={customerForm.addressLine1}
												onChange={(e) => setCustomerForm(prev => ({...prev, addressLine1: e.target.value}))}
												placeholder="Adresse (Zeile 1)"
												className="w-full text-xs px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-200"
											/>
											<div className="grid grid-cols-3 gap-2">
												<input
													type="text"
													value={customerForm.postalCode}
													onChange={(e) => setCustomerForm(prev => ({...prev, postalCode: e.target.value}))}
													placeholder="PLZ"
													className="text-xs px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-200"
												/>
												<input
													type="text"
													value={customerForm.city}
													onChange={(e) => setCustomerForm(prev => ({...prev, city: e.target.value}))}
													placeholder="Ort"
													className="text-xs px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-200"
												/>
												<input
													type="text"
													value={customerForm.country}
													onChange={(e) => setCustomerForm(prev => ({...prev, country: e.target.value}))}
													placeholder="Land"
													className="text-xs px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-200"
												/>
											</div>
											{!showNewOrderForm && (
												<div className="flex gap-1 mt-2">
													<button
														onClick={async () => {
															if (!orderData?.customer?.id) return;
															try {
																const res = await fetch('/api/customers', {
																	method: 'PATCH',
																	headers: { 'Content-Type': 'application/json' },
																	body: JSON.stringify({ id: orderData.customer.id, ...customerForm }),
																});
																if (res.ok) {
																	// Update local orderData
																	setOrderData((prev: any) => prev ? {
																		...prev,
																		customer: { ...prev.customer, ...customerForm }
																	} : null);
																	setEditingCustomer(false);
																} else {
																	alert('Fehler beim Speichern der Kundendaten');
																}
															} catch (error) {
																console.error('Error updating customer:', error);
																alert('Fehler beim Speichern der Kundendaten');
															}
														}}
														className="flex-1 text-xs px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded"
													>
														Speichern
													</button>
													<button
														onClick={() => setEditingCustomer(false)}
														className="text-xs px-2 py-1 border border-slate-700 hover:bg-slate-800 text-slate-300 rounded"
													>
														Abbrechen
													</button>
												</div>
											)}
										</div>
									)}
								</div>
							)}

							{/* Drag & Drop Zone für Anhänge und Dateien */}
							{selectedOrderId && (
								<div>
									<div 
										className={`text-xs rounded p-3 border-2 border-dashed transition-colors cursor-pointer ${
											isDragOver 
												? 'border-emerald-500 bg-emerald-500/10 text-emerald-300' 
												: 'border-slate-700 bg-slate-950 text-slate-400 hover:border-slate-600'
										}`}
										onDragOver={handleDragOver}
										onDragLeave={handleDragLeave}
										onDrop={handleDrop}
										onClick={() => fileInputRef.current?.click()}
									>
										<div className="flex items-center justify-between">
											<div className="flex items-center gap-2">
												<span>📎</span>
												<span>
													{isDragOver 
														? 'Dateien hier ablegen...' 
														: 'Anhänge ziehen oder Dateien hochladen'
													}
												</span>
											</div>
											<button
												onClick={(e) => {
													e.stopPropagation();
													fileInputRef.current?.click();
												}}
												className="px-2 py-1 rounded border border-slate-600 hover:border-slate-500 hover:bg-slate-800 text-slate-300 text-xs"
												title="Dateien auswählen"
											>
												Durchsuchen
											</button>
										</div>
									</div>
									
									{/* Verstecktes File Input */}
									<input
										ref={fileInputRef}
										type="file"
										multiple
										accept="image/*,.pdf,.doc,.docx,.txt"
										className="hidden"
										onChange={(e) => {
											const files = Array.from(e.target.files || []);
											if (files.length > 0) {
												handleFileUpload(files);
											}
											// Reset input
											e.target.value = '';
										}}
									/>
								</div>
							)}
							{message ? (
								<>
									{selectedOrderId && orderType ? (
										<>
											<div className="text-xs text-slate-400 bg-slate-950 border border-slate-800 rounded p-2 mb-3">
												💡 <strong>Tipp:</strong> Markieren Sie Text in der Mail und ziehen Sie ihn in die Eingabefelder
											</div>
											<OrderDatasheetForm 
												orderId={selectedOrderId} 
												orderType={orderType}
												onSpecsChange={(specs) => {
													// Optional: Update draft mit den neuen Specs
													setDraft(prev => ({ ...prev, ...specs }));
												}}
											/>
										</>
									) : (
										<SpecForm type={((suggestion?.type as any) || 'Hals') as DraftType} value={draft} onChange={setDraft} />
									)}
									{!selectedOrderId && (
										<div className="flex gap-2 justify-end">
											<button
												disabled={submitting}
												onClick={async () => {
													if (!message) return;
													setSubmitting(true);
													try {
														// Erstelle neuen Auftrag mit Datenblatt
														const res = await fetch('/api/datasheets/create', {
															method: 'POST',
															headers: { 'Content-Type': 'application/json' },
															body: JSON.stringify({ mailId: message.id, overrides: draft }),
														});
														if (!res.ok) throw new Error('Fehler');
														const data = await res.json();
														if (data?.orderId) {
															setSelectedOrderId(data.orderId);
															try { (message as any).assignedTo = data.orderId; } catch {}
															onOrderResolved?.(data.orderId);
															
															// Dispatch event to update unread count in navigation
															window.dispatchEvent(new CustomEvent('mail-assigned'));
														}
														setToast('Neuer Auftrag mit Datenblatt erstellt');
													} catch (e) {
														setToast('Fehler beim Aktualisieren');
													} finally {
														setSubmitting(false);
													}
												}}
												className="rounded bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 text-sm"
											>
												Auftrag aus Mail erstellen
											</button>
										</div>
									)}

								</>
							) : (
								<div className="text-sm text-slate-400">Keine Nachricht ausgewählt</div>
							)}

							{/* Preisberechnung und Shop-Integration */}
							<OrderPricing
								orderId={selectedOrderId}
								orderType={orderType || undefined}
								onPriceUpdate={handlePriceUpdate}
								message={message}
								draft={draft}
								submitting={submitting}
								setSubmitting={setSubmitting}
								setToast={setToast}
							/>



							{/* Auftragsbilder anzeigen */}
							<OrderImages 
								orderId={selectedOrderId}
								refreshTrigger={imageRefreshTrigger}
								onImagesChange={handleImagesChange}
							/>
						</div>
					</div>
				)}
				{toast ? (
					<div className="absolute bottom-4 right-4 rounded bg-slate-800 text-slate-100 border border-slate-700 px-3 py-2 text-sm shadow-lg">
						{toast}
					</div>
				) : null}
			</div>
		</div>
	);
}


