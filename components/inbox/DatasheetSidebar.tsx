"use client";
import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import type { Message } from './types';
import { suggestType } from '@/lib/inbox/rules';
import { parseFields as parseDraftFields, type DraftType, type ParsedDraft } from '@/lib/inbox/parse';
import SpecForm from '@/components/specs/SpecForm';
import OrderDatasheetForm from './OrderDatasheetForm';
import OrderImages from './OrderImages';
import OrderPricing from './OrderPricing';
import { normalizeWorkflowStatus } from '@/lib/order-status';
import { getCategoriesForOrderType, getFieldsForCategory } from '@/lib/order-presets';
import PhoneLink from '@/components/PhoneLink';

type Props = {
	message: Message | null;
	isOpen: boolean;
	onToggle: () => void;
	onOrderResolved?: (orderId: string) => void;
};

export default function DatasheetSidebar({ message, isOpen, onToggle, onOrderResolved }: Props) {
	const MIN_WIDTH = 400; // kompakt, aber noch gut lesbar
	const DEFAULT_WIDTH = MIN_WIDTH;
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
	const [activePanelTab, setActivePanelTab] = useState<'auftrag' | 'info'>('auftrag');
	const [editingDatasheet, setEditingDatasheet] = useState(false);
	// Auftragsliste und ausgewählter Auftrag
	const [availableOrders, setAvailableOrders] = useState<Array<{id: string; title: string; type: string; customer: any; status?: string; finalAmountCents?: number | null; createdAt?: string}>>([]);
	const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
	const [orderType, setOrderType] = useState<string | null>(null);
	const [orderData, setOrderData] = useState<any>(null);
	const [showOrderDropdown, setShowOrderDropdown] = useState(false);
	const [showNewOrderForm, setShowNewOrderForm] = useState(false);
	const [showOlderOrders, setShowOlderOrders] = useState(false);
	const [staffUsers, setStaffUsers] = useState<Array<{ id: string; name: string; role?: string }>>([]);
	const [assigneeSaving, setAssigneeSaving] = useState(false);
	const [customers, setCustomers] = useState<Array<{
		id: string;
		name: string;
		email?: string;
		phone?: string;
		addressLine1?: string;
		postalCode?: string;
		city?: string;
		country?: string;
		company?: string;
		createdAt?: string;
		orderCount?: number;
	}>>([]);
	const [matchedCustomer, setMatchedCustomer] = useState<{
		id: string;
		name: string;
		email?: string;
		phone?: string;
		addressLine1?: string;
		postalCode?: string;
		city?: string;
		country?: string;
		company?: string;
		createdAt?: string;
		orderCount?: number;
	} | null>(null);
	const [isDragOver, setIsDragOver] = useState(false);
	const [orderImages, setOrderImages] = useState<any[]>([]);
	const [imageRefreshTrigger, setImageRefreshTrigger] = useState(0);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [sidebarWidth, setSidebarWidth] = useState<number>(DEFAULT_WIDTH);
	const [isResizing, setIsResizing] = useState(false);
	const [customerNote, setCustomerNote] = useState('');
	const [loadedNote, setLoadedNote] = useState('');
	const [noteSaving, setNoteSaving] = useState(false);
	const [customerInfoDraft, setCustomerInfoDraft] = useState({
		name: '',
		company: '',
		addressLine1: '',
		postalCode: '',
		city: '',
		phone: '',
		email: '',
		country: 'DE',
	});
	const [customerInfoEditMode, setCustomerInfoEditMode] = useState(false);
	const [customerInfoSaving, setCustomerInfoSaving] = useState(false);
	const [customerInfoSaved, setCustomerInfoSaved] = useState(false);
	
	// Für die Bearbeitung des Auftragsnamens
	const [editingOrderTitle, setEditingOrderTitle] = useState(false);
	const [orderTitleValue, setOrderTitleValue] = useState('');

	const statusDotClass: Record<string, string> = {
		intake: 'bg-slate-400',
		in_progress: 'bg-sky-400',
		setup: 'bg-cyan-400',
		complete: 'bg-emerald-400',
	};

	const normalizePhone = (raw?: string | null) => (raw || '').replace(/[^\d+]/g, '');
	const toWhatsappNumber = (raw?: string | null) => normalizePhone(raw).replace(/[^\d]/g, '');
	const formatCustomerSince = (value?: string) => {
		if (!value) return null;
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return null;
		return date.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
	};
	const ORDER_TYPE_CHIPS: Array<{ value: string; label: string }> = [
		{ value: 'GUITAR', label: 'Gitarre' },
		{ value: 'BODY', label: 'Body' },
		{ value: 'NECK', label: 'Hals' },
		{ value: 'PICKGUARD', label: 'Pickguard' },
		{ value: 'REPAIR', label: 'Reparatur' },
		{ value: 'ENGRAVING', label: 'Gravur' },
		{ value: 'FINISH_ONLY', label: 'Finish' },
	];
	
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

	const saveCustomerInfo = async () => {
		if (!shownCustomer?.id || !customerInfoDraft.name.trim()) return;
		setCustomerInfoSaving(true);
		try {
			const res = await fetch(`/api/customers/${encodeURIComponent(shownCustomer.id)}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(customerInfoDraft),
			});
			if (!res.ok) throw new Error('save failed');
			const updated = await res.json();
			setMatchedCustomer((prev) => (prev && prev.id === shownCustomer.id ? { ...prev, ...updated } : prev));
			setCustomers((prev) => prev.map((c) => (c.id === shownCustomer.id ? { ...c, ...updated } : c)));
			setOrderData((prev: any) =>
				prev?.customer?.id === shownCustomer.id
					? { ...prev, customer: { ...prev.customer, ...updated } }
					: prev
			);
			setCustomerInfoEditMode(false);
			setCustomerInfoSaved(true);
			setTimeout(() => setCustomerInfoSaved(false), 1200);
		} catch {
			setToast('Kundendaten konnten nicht gespeichert werden');
			setTimeout(() => setToast(null), 2200);
		} finally {
			setCustomerInfoSaving(false);
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
					setAvailableOrders(orders.map((o: any) => ({
						id: o.id,
						title: o.title,
						type: o.type,
						customer: o.customer,
						status: o.status,
						finalAmountCents: o.finalAmountCents ?? null,
						createdAt: o.createdAt,
					})));
				}
				if (customersRes.ok) {
					const customerData = await customersRes.json();
					setCustomers(customerData);
				}
			} catch {}
		})();
		return () => { active = false; };
	}, []);

	useEffect(() => {
		let active = true;
		(async () => {
			try {
				const res = await fetch('/api/users');
				if (!active || !res.ok) return;
				const users = await res.json();
				if (!active) return;
				setStaffUsers(
					(Array.isArray(users) ? users : [])
						.filter((u: any) => !!u?.id && !!u?.name)
						.map((u: any) => ({ id: String(u.id), name: String(u.name), role: u.role }))
				);
			} catch {
				// optional helper list only
			}
		})();
		return () => {
			active = false;
		};
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
		if (!message) return;
		const orderId = message.assignedTo ?? null;
		const previousOrderId = selectedOrderId;
		setSelectedOrderId(orderId);
		// Kurzes Feedback wenn Auftrag sich durch Mail-Wechsel geändert hat
		if (previousOrderId !== orderId && (previousOrderId || orderId)) {
			setToast(orderId ? `Auftrag gewechselt zu ${orderId}` : 'Keine Zuordnung');
			setTimeout(() => setToast(null), 2000);
		}
	}, [message?.id, message?.assignedTo]);

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

	// Kunde automatisch aus Mail-Absender erkennen
	useEffect(() => {
		const fromEmail = (message?.fromEmail || '').trim().toLowerCase();
		if (!fromEmail) {
			setMatchedCustomer(null);
			return;
		}
		const match = customers.find((c) => (c.email || '').trim().toLowerCase() === fromEmail) || null;
		setMatchedCustomer(match);
	}, [message?.fromEmail, customers]);

	const shownCustomer = orderData?.customer || matchedCustomer;
	const relatedOrders = useMemo(() => {
		const customerId = shownCustomer?.id;
		if (!customerId) return [] as typeof availableOrders;
		return availableOrders.filter((o: any) => o?.customer?.id === customerId);
	}, [availableOrders, shownCustomer?.id]);
	const currentRelatedIndex = useMemo(
		() => relatedOrders.findIndex((o) => o.id === selectedOrderId),
		[relatedOrders, selectedOrderId]
	);
	const activeRelatedOrderId = (currentRelatedIndex >= 0 ? relatedOrders[currentRelatedIndex]?.id : relatedOrders[0]?.id) || null;
	const olderRelatedOrders = useMemo(
		() => relatedOrders.filter((o) => o.id !== activeRelatedOrderId),
		[relatedOrders, activeRelatedOrderId]
	);
	const sortedCustomerHistory = useMemo(() => {
		return [...relatedOrders].sort((a, b) => {
			const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
			const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
			return db - da;
		});
	}, [relatedOrders]);
	const customerSinceLabel = useMemo(() => {
		const direct = formatCustomerSince((shownCustomer as any)?.createdAt);
		if (direct) return direct;
		const oldest = [...relatedOrders]
			.filter((o) => !!o.createdAt)
			.sort((a, b) => new Date(a.createdAt as string).getTime() - new Date(b.createdAt as string).getTime())[0];
		return formatCustomerSince(oldest?.createdAt);
	}, [shownCustomer, relatedOrders]);
	const customerOrderCount = (shownCustomer as any)?.orderCount ?? relatedOrders.length;

	useEffect(() => {
		setActivePanelTab('auftrag');
	}, [message?.id]);

	useEffect(() => {
		setEditingDatasheet(false);
	}, [selectedOrderId, orderType]);

	useEffect(() => {
		setCustomerInfoEditMode(false);
		setCustomerInfoSaved(false);
		if (!shownCustomer) {
			setCustomerInfoDraft({
				name: '',
				company: '',
				addressLine1: '',
				postalCode: '',
				city: '',
				phone: '',
				email: '',
				country: 'DE',
			});
			return;
		}
		setCustomerInfoDraft({
			name: shownCustomer.name || '',
			company: (shownCustomer as any).company || '',
			addressLine1: (shownCustomer as any).addressLine1 || '',
			postalCode: (shownCustomer as any).postalCode || '',
			city: (shownCustomer as any).city || '',
			phone: shownCustomer.phone || '',
			email: shownCustomer.email || '',
			country: (shownCustomer as any).country || 'DE',
		});
	}, [shownCustomer?.id]);

	useEffect(() => {
		const customerId = shownCustomer?.id;
		if (!customerId) return;
		let active = true;
		(async () => {
			try {
				const res = await fetch(`/api/customers/${encodeURIComponent(customerId)}`);
				if (!active || !res.ok) return;
				const fullCustomer = await res.json();
				if (!active) return;
				setMatchedCustomer((prev) => (prev && prev.id === customerId ? { ...prev, ...fullCustomer } : prev));
				setCustomers((prev) => prev.map((c) => (c.id === customerId ? { ...c, ...fullCustomer } : c)));
				setOrderData((prev: any) =>
					prev?.customer?.id === customerId
						? { ...prev, customer: { ...prev.customer, ...fullCustomer } }
						: prev
				);
				setCustomerInfoDraft((prev) => ({
					...prev,
					name: fullCustomer.name || '',
					company: fullCustomer.company || '',
					addressLine1: fullCustomer.addressLine1 || '',
					postalCode: fullCustomer.postalCode || '',
					city: fullCustomer.city || '',
					phone: fullCustomer.phone || '',
					email: fullCustomer.email || '',
					country: fullCustomer.country || 'DE',
				}));
			} catch {
				// Keep current local state silently
			}
		})();
		return () => {
			active = false;
		};
	}, [shownCustomer?.id]);

	useEffect(() => {
		const customerId = shownCustomer?.id;
		if (!customerId) {
			setCustomerNote('');
			setLoadedNote('');
			return;
		}
		let active = true;
		(async () => {
			try {
				const res = await fetch(`/api/customers/${encodeURIComponent(customerId)}/note`);
				if (!active) return;
				if (res.ok) {
					const data = await res.json();
					const value = String(data?.note || '');
					setCustomerNote(value);
					setLoadedNote(value);
				}
			} catch {
				if (active) {
					setCustomerNote('');
					setLoadedNote('');
				}
			}
		})();
		return () => { active = false; };
	}, [shownCustomer?.id]);

	useEffect(() => {
		const customerId = shownCustomer?.id;
		if (!customerId) return;
		if (customerNote === loadedNote) return;
		const t = setTimeout(async () => {
			setNoteSaving(true);
			try {
				const res = await fetch(`/api/customers/${encodeURIComponent(customerId)}/note`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ note: customerNote }),
				});
				if (res.ok) setLoadedNote(customerNote);
			} catch {
				// ignore autosave errors silently; user keeps text locally
			} finally {
				setNoteSaving(false);
			}
		}, 600);
		return () => clearTimeout(t);
	}, [customerNote, loadedNote, shownCustomer?.id]);

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

	function draftTypeToOrderType(type: DraftType | null | undefined): string {
		if (type === 'Hals') return 'NECK';
		if (type === 'Body') return 'BODY';
		if (type === 'Pickguard') return 'PICKGUARD';
		if (type === 'Pickups') return 'PICKUPS';
		if (type === 'Rep.') return 'REPAIR';
		return 'GUITAR';
	}

	// Neuen Auftrag erstellen
	const createNewOrder = async (orderTypeValue: string) => {
		if (!message) return;
		setSubmitting(true);
		let specsImported = false;
		try {
			let customerId = null;
			const customerData = {
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
					type: orderTypeValue,
					customerId: customerId,
				}),
			});

			if (!orderRes.ok) {
				const errorData = await orderRes.json();
				console.error('Order creation failed:', errorData);
				throw new Error('Auftrag konnte nicht erstellt werden');
			}
			
			const newOrder = await orderRes.json();

			// Mail, Thread und Anhänge dem neuen Auftrag zuordnen.
			const assignRes = await fetch('/api/inbox/assign-order', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ messageId: message.id, orderId: newOrder.id }),
			});
			if (!assignRes.ok) {
				const assignError = await assignRes.json().catch(() => ({}));
				console.error('Mail assignment after order creation failed:', assignError);
				throw new Error('Auftrag wurde erstellt, aber die Mail konnte nicht verknüpft werden');
			}

			setAvailableOrders(prev => [...prev, {
				id: newOrder.id,
				title: newOrder.title,
				type: newOrder.type,
				customer: newOrder.customer
			}]);
			setSelectedOrderId(newOrder.id);
			setShowNewOrderForm(false);

			const specUpdate = buildSpecUpdateForOrderType(orderTypeValue);
			if (Object.keys(specUpdate).length > 0) {
				const specRes = await fetch(`/api/orders/${encodeURIComponent(newOrder.id)}/spec`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(specUpdate),
				});
				specsImported = specRes.ok;
				if (!specRes.ok) {
					console.warn('Spec import from mail failed', await specRes.text().catch(() => ''));
				}
			}

			try { (message as any).assignedTo = newOrder.id; } catch {}
			onOrderResolved?.(newOrder.id);
			window.dispatchEvent(new CustomEvent('mail-assigned'));
			setImageRefreshTrigger(prev => prev + 1);
			setToast(specsImported ? `Neuer Auftrag ${newOrder.id} mit Specs und Mail erstellt` : `Neuer Auftrag ${newOrder.id} mit Mail erstellt`);
		} catch (e) {
			console.error('Create order error:', e);
			setToast('Fehler beim Erstellen des Auftrags');
		} finally {
			setSubmitting(false);
		}
	};

	const updateAssignee = async (assigneeId: string) => {
		if (!selectedOrderId) return;
		setAssigneeSaving(true);
		try {
			const payload = { assigneeId: assigneeId || null };
			const res = await fetch(`/api/orders/${encodeURIComponent(selectedOrderId)}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload),
			});
			if (!res.ok) throw new Error('assign failed');
			const updated = await res.json();
			setOrderData(updated);
			setToast('Mitarbeiter zugewiesen');
			setTimeout(() => setToast(null), 1200);
		} catch {
			setToast('Zuweisung fehlgeschlagen');
			setTimeout(() => setToast(null), 1600);
		} finally {
			setAssigneeSaving(false);
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
	const assignOrderToCurrentMail = useCallback(async (orderId: string | null) => {
		if (!message) {
			setSelectedOrderId(orderId);
			return true;
		}
		try {
			const res = await fetch(`/api/mails/${message.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ orderId }),
			});
			if (!res.ok) throw new Error('Fehler');
			try { (message as any).assignedTo = orderId; } catch {}
			if (orderId) {
				onOrderResolved?.(orderId);
				window.dispatchEvent(new CustomEvent('mail-assigned'));
				setImageRefreshTrigger(prev => prev + 1);
				setToast(`Mail/Thread mit ${orderId} verknüpft`);
			} else {
				setToast('Zuordnung aufgehoben');
			}
			setSelectedOrderId(orderId);
			return true;
		} catch {
			setToast(orderId ? 'Fehler beim Zuweisen' : 'Fehler beim Aufheben der Zuordnung');
			return false;
		}
	}, [message, onOrderResolved]);

	useEffect(() => {
		if (toast) {
			const t = setTimeout(() => setToast(null), 2000);
			return () => clearTimeout(t);
		}
	}, [toast]);

	useEffect(() => {
		setShowOlderOrders(false);
	}, [selectedOrderId, shownCustomer?.id]);

	useEffect(() => {
		if (isOpen) {
			setSidebarWidth(MIN_WIDTH);
		}
	}, [isOpen]);

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

	useEffect(() => {
		if (!isResizing) return;
		const previousUserSelect = document.body.style.userSelect;
		document.body.style.userSelect = 'none';

		const maxWidth = Math.max(DEFAULT_WIDTH, Math.floor(window.innerWidth * 0.72));
		const onPointerMove = (event: PointerEvent) => {
			setSidebarWidth((prev) => {
				const next = prev - event.movementX;
				return Math.max(MIN_WIDTH, Math.min(maxWidth, next));
			});
		};
		const onPointerUp = () => setIsResizing(false);
		window.addEventListener('pointermove', onPointerMove);
		window.addEventListener('pointerup', onPointerUp, { once: true });

		return () => {
			document.body.style.userSelect = previousUserSelect;
			window.removeEventListener('pointermove', onPointerMove);
			window.removeEventListener('pointerup', onPointerUp);
		};
	}, [isResizing]);

	return (
		<div 
			className={`relative border-l border-slate-700/80 h-full bg-[linear-gradient(180deg,rgba(15,23,42,0.72)_0%,rgba(15,23,42,0.92)_100%)] ${isResizing ? '' : 'transition-[width] duration-200 ease-in-out'} overflow-hidden flex-shrink-0`}
			style={{ width: isOpen ? `${sidebarWidth}px` : '0px' }}
			aria-label="Datenblatt-Seitenleiste"
		>
			{isOpen && (
				<button
					type="button"
					onPointerDown={(e) => {
						e.preventDefault();
						setIsResizing(true);
					}}
					className="absolute left-0 top-0 h-full w-2 -translate-x-1/2 cursor-col-resize z-30 group"
					aria-label="Breite der Auftragsverwaltung anpassen"
					title="Breite anpassen"
				>
					<span className="absolute inset-y-0 left-1/2 w-[2px] -translate-x-1/2 bg-transparent group-hover:bg-sky-500/50 group-active:bg-sky-400/70 transition-colors" />
				</button>
			)}
			<div className="relative h-full flex flex-col overflow-hidden">
				{isOpen && (
					<div className="h-full flex flex-col overflow-hidden p-2 rounded-xl border border-slate-700/60 bg-[linear-gradient(180deg,rgba(30,41,59,0.26)_0%,rgba(15,23,42,0.5)_100%)]">
						<div className="px-2 py-2 border-b border-slate-700/70 bg-transparent space-y-2 flex-shrink-0">
							<div className="px-0.5 py-0.5">
								<div className="flex flex-wrap items-start justify-between gap-3">
									<div className="min-w-0 flex-1">
										{selectedOrderId ? (
											<div className="group/orderline w-full inline-flex items-center gap-2">
												{editingOrderTitle ? (
													<div className="min-w-0 flex-1 flex items-center gap-1">
														<input
															type="text"
															value={orderTitleValue}
															onChange={(e) => setOrderTitleValue(e.target.value)}
															onKeyDown={(e) => {
																if (e.key === 'Enter') saveOrderTitle();
																if (e.key === 'Escape') {
																	setOrderTitleValue(orderData?.title || '');
																	setEditingOrderTitle(false);
																}
															}}
															className="min-w-0 flex-1 h-7 bg-transparent border-b border-slate-600/80 text-[18px] leading-6 font-semibold text-slate-100 focus:outline-none focus:border-sky-400"
															placeholder="Auftragsname..."
															autoFocus
														/>
														<button
															type="button"
															onClick={saveOrderTitle}
															className="text-[11px] text-emerald-300 hover:text-emerald-200"
															title="Speichern"
														>
															✓
														</button>
														<button
															type="button"
															onClick={() => {
																setOrderTitleValue(orderData?.title || '');
																setEditingOrderTitle(false);
															}}
															className="text-[11px] text-slate-400 hover:text-slate-200"
															title="Abbrechen"
														>
															✕
														</button>
													</div>
												) : (
													<>
														<div className="min-w-0 flex-1 inline-flex items-center gap-1.5">
															<a
																href={`/app/orders/${encodeURIComponent(selectedOrderId)}`}
																className="min-w-0 flex-1 text-left cursor-pointer transition-all duration-150 hover:text-sky-200 hover:drop-shadow-[0_0_10px_rgba(56,189,248,0.45)] active:text-sky-100"
																title={`Auftrag ${selectedOrderId} öffnen`}
															>
																<span className="truncate text-[18px] leading-6 font-semibold text-slate-100">
																	{orderData?.title || availableOrders.find((o) => o.id === selectedOrderId)?.title || selectedOrderId}
																</span>
															</a>
															<button
																type="button"
																onClick={(e) => {
																	e.preventDefault();
																	e.stopPropagation();
																	setEditingOrderTitle(true);
																}}
																className="shrink-0 text-[12px] text-slate-400/80 opacity-70 transition-all duration-150 hover:opacity-100 hover:text-slate-200 active:scale-110 active:text-sky-300"
																title="Auftragsname bearbeiten"
															>
																✏
															</button>
														</div>
													</>
												)}
											</div>
										) : (
											<div className="text-[18px] leading-6 font-semibold text-slate-100 truncate">
												{shownCustomer?.name || message?.fromName || message?.fromEmail || 'Unbekannter Kunde'}
											</div>
										)}
										{selectedOrderId ? (
											<>
												<div className="text-[13px] text-slate-300/85 truncate">
													{shownCustomer?.name || message?.fromName || message?.fromEmail || 'Unbekannter Kunde'}
												</div>
												<div className="text-[11px] text-slate-500 truncate">
													{`Kunde seit ${customerSinceLabel || '—'} · ${customerOrderCount || 0} Aufträge`}
												</div>
											</>
										) : (
											<div className="text-xs text-slate-400 truncate">
												{`Kunde seit ${customerSinceLabel || '—'} · ${customerOrderCount || 0} Aufträge`}
											</div>
										)}
									</div>
									<div className="flex items-center gap-1.5 ml-auto self-center">
										{shownCustomer?.phone ? (
											<PhoneLink
												phone={shownCustomer.phone}
												className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-slate-700/60 bg-slate-800/40 text-slate-400 transition-all duration-150 hover:text-sky-200 hover:border-sky-500/60 hover:bg-slate-800/80 hover:shadow-[0_0_10px_rgba(56,189,248,0.35)]"
												title={`Anrufen: ${shownCustomer.phone}`}
											>
												☎
											</PhoneLink>
										) : (
											<button
												type="button"
												disabled
												className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-slate-800 bg-slate-900/40 text-slate-600"
												title="Keine Telefonnummer"
											>
												☎
											</button>
										)}
										<a
											href={shownCustomer?.phone ? `https://wa.me/${toWhatsappNumber(shownCustomer.phone)}` : '#'}
											target="_blank"
											rel="noopener noreferrer"
											className={`h-7 w-7 inline-flex items-center justify-center rounded-md border transition-all duration-150 ${
												shownCustomer?.phone
													? 'border-slate-700/60 bg-slate-800/40 text-slate-400 hover:text-emerald-200 hover:border-emerald-500/60 hover:bg-slate-800/80 hover:shadow-[0_0_10px_rgba(16,185,129,0.35)]'
													: 'border-slate-800 bg-slate-900/40 text-slate-600 pointer-events-none'
											}`}
											title={shownCustomer?.phone ? 'WhatsApp öffnen' : 'Keine Telefonnummer'}
										>
											💬
										</a>
										<a
											href={shownCustomer?.email ? `/app/posteingang?compose=1&to=${encodeURIComponent(shownCustomer.email)}` : '#'}
											className={`h-7 w-7 inline-flex items-center justify-center rounded-md border transition-all duration-150 ${
												shownCustomer?.email
													? 'border-slate-700/60 bg-slate-800/40 text-slate-400 hover:text-violet-200 hover:border-violet-500/60 hover:bg-slate-800/80 hover:shadow-[0_0_10px_rgba(139,92,246,0.35)]'
													: 'border-slate-800 bg-slate-900/40 text-slate-600 pointer-events-none'
											}`}
											title={shownCustomer?.email ? 'Neue Mail verfassen' : 'Keine E-Mail'}
										>
											✉
										</a>
									</div>
								</div>
								<div className="mt-2 grid grid-cols-2 gap-1.5">
									<button
										type="button"
										onClick={() => setActivePanelTab('auftrag')}
										className={`text-xs px-2 py-1 rounded border ${activePanelTab === 'auftrag' ? 'border-sky-600 bg-sky-600/20 text-sky-200' : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
									>
										Auftrag
									</button>
									<button
										type="button"
										onClick={() => setActivePanelTab('info')}
										className={`text-xs px-2 py-1 rounded border ${activePanelTab === 'info' ? 'border-sky-600 bg-sky-600/20 text-sky-200' : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
									>
										Info
									</button>
								</div>
							</div>

							{activePanelTab === 'auftrag' && (
							<>
							{/* Kompakte Auftrags-Auswahl */}
							<div className="space-y-1.5">
									<div className="flex items-center gap-1.5">
									{selectedOrderId && (
										<div className="w-36">
											<select
												value={(orderData?.assignee?.id || orderData?.assigneeId || '') as string}
												onChange={(e) => updateAssignee(e.target.value)}
												disabled={assigneeSaving}
												className="w-full h-7 px-2 text-xs rounded border border-slate-700/80 bg-slate-800/80 text-slate-200 hover:bg-slate-700 disabled:opacity-60"
												title="Mitarbeiter zuweisen"
											>
												<option value="">Mitarbeiter</option>
												{staffUsers.map((user) => (
													<option key={user.id} value={user.id}>
														{user.name}
													</option>
												))}
											</select>
										</div>
									)}
									<div className="relative order-dropdown flex-1">
										<button
											onClick={() => setShowOrderDropdown(!showOrderDropdown)}
											className="w-full text-left px-2 py-1 text-xs border border-slate-700/80 rounded bg-slate-800/80 hover:bg-slate-700 flex items-center justify-between"
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
												onClick={async () => {
													setShowOrderDropdown(false);
													await assignOrderToCurrentMail(null);
												}}
												className="w-full text-left px-2 py-1 text-xs hover:bg-slate-700 text-slate-400"
											>
												Kein Auftrag
											</button>
											{availableOrders.map((order) => (
												<button
													key={order.id}
													onClick={async () => {
														setShowOrderDropdown(false);
														await assignOrderToCurrentMail(order.id);
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
									<button
										type="button"
										onClick={() => setShowNewOrderForm((v) => !v)}
										className="h-7 px-2.5 rounded border border-slate-700/80 bg-slate-800/80 text-xs text-slate-200 hover:bg-slate-700 inline-flex items-center gap-1"
										title="Neuen Auftrag anlegen"
									>
										<span className="text-sm leading-none">+</span>
										<span>Neu</span>
									</button>
									</div>
									{showNewOrderForm && (
										<div className="grid grid-cols-2 gap-1.5">
											{ORDER_TYPE_CHIPS.map((chip) => (
												<button
													key={chip.value}
													type="button"
													disabled={submitting}
													onClick={() => createNewOrder(chip.value)}
													className="rounded border border-slate-700 bg-slate-800/75 px-2 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-700 disabled:opacity-50"
												>
													{chip.label}
												</button>
											))}
										</div>
									)}

									{relatedOrders.length > 1 && (
										<div className="flex items-center gap-1">
											<button
												type="button"
												disabled={(currentRelatedIndex >= 0 ? currentRelatedIndex : 0) <= 0}
												onClick={() => {
													const idx = currentRelatedIndex >= 0 ? currentRelatedIndex : 0;
													const prev = relatedOrders[idx - 1];
													if (prev) assignOrderToCurrentMail(prev.id);
												}}
												className="px-1.5 py-1 text-xs rounded border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-40"
												title="Vorheriger Auftrag dieses Kunden"
											>
												◀
											</button>
											<div className="flex-1 text-[11px] text-slate-300 truncate px-2 py-1 rounded bg-slate-800/60 border border-slate-700/60">
												{relatedOrders[currentRelatedIndex >= 0 ? currentRelatedIndex : 0]?.id}
											</div>
											<button
												type="button"
												disabled={(currentRelatedIndex >= 0 ? currentRelatedIndex : 0) >= relatedOrders.length - 1}
												onClick={() => {
													const idx = currentRelatedIndex >= 0 ? currentRelatedIndex : 0;
													const next = relatedOrders[idx + 1];
													if (next) assignOrderToCurrentMail(next.id);
												}}
												className="px-1.5 py-1 text-xs rounded border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-40"
												title="Nächster Auftrag dieses Kunden"
											>
												▶
											</button>
										</div>
									)}

									{selectedOrderId && (
										<OrderImages
											orderId={selectedOrderId}
											refreshTrigger={imageRefreshTrigger}
											onImagesChange={handleImagesChange}
										/>
									)}
								</div>
							</>
							)}
						</div>
						<div className="p-2 space-y-2 overflow-auto flex-1 min-h-0">
							{activePanelTab === 'auftrag' ? (
							<>
							{!showNewOrderForm && olderRelatedOrders.length > 0 && (
								<div className="text-xs bg-slate-900/40 border border-slate-800/50 rounded p-1.5">
									<button
										type="button"
										onClick={() => setShowOlderOrders((v) => !v)}
										className="w-full flex items-center justify-between text-slate-300 hover:text-slate-100"
									>
										<span>Ältere Aufträge ({olderRelatedOrders.length})</span>
										<span className="text-slate-500">{showOlderOrders ? '▲' : '▼'}</span>
									</button>
									{showOlderOrders && (
										<div className="mt-2 space-y-1 max-h-40 overflow-auto">
											{olderRelatedOrders.map((order) => (
												<button
													key={order.id}
													type="button"
													onClick={() => assignOrderToCurrentMail(order.id)}
													className="w-full text-left px-2 py-1 rounded border border-slate-700/70 bg-slate-800/60 hover:bg-slate-700 text-slate-200"
												>
													<div className="font-medium">{order.id}</div>
													<div className="text-[10px] text-slate-400 truncate">{order.title} • {order.type}</div>
												</button>
											))}
										</div>
									)}
								</div>
							)}

							{/* Drag & Drop Zone für Anhänge und Dateien */}
							{selectedOrderId && (
								<div>
									<div 
										className={`text-xs rounded p-2 border border-dashed transition-colors cursor-pointer ${
											isDragOver 
												? 'border-emerald-500 bg-emerald-500/10 text-emerald-300' 
												: 'border-slate-700/70 bg-slate-900/45 text-slate-400 hover:border-slate-500/80'
										}`}
										onDragOver={handleDragOver}
										onDragLeave={handleDragLeave}
										onDrop={handleDrop}
										onClick={() => fileInputRef.current?.click()}
									>
										<div className="flex items-center justify-between gap-2">
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
												className="px-1.5 py-0.5 rounded border border-slate-600 hover:border-slate-500 hover:bg-slate-800 text-slate-300 text-[11px]"
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
							{/* Zeige OrderDatasheetForm wenn ein Auftrag ausgewählt ist, unabhängig von Mail */}
							{selectedOrderId && orderType ? (
								<>
									<div className="flex items-center justify-between gap-2 rounded border border-slate-800 bg-slate-900/50 px-2 py-1.5">
										<div>
											<div className="text-xs font-medium text-slate-200">Datenblatt</div>
											<div className="text-[11px] text-slate-500">{editingDatasheet ? "Bearbeitung aktiv" : "Ansicht"}</div>
										</div>
										<button
											type="button"
											onClick={() => setEditingDatasheet((value) => !value)}
											className={editingDatasheet ? "rounded bg-sky-600 px-2 py-1 text-xs font-medium text-white hover:bg-sky-500" : "rounded border border-slate-700 px-2 py-1 text-xs font-medium text-slate-200 hover:bg-slate-800"}
										>
											{editingDatasheet ? "Fertig" : "Bearbeiten"}
										</button>
									</div>
									{editingDatasheet && message && (
										<div className="text-xs text-slate-400 bg-slate-900/60 border border-slate-700/70 rounded p-2 mb-3">
											💡 <strong>Tipp:</strong> Markieren Sie Text in der Mail und ziehen Sie ihn in die Eingabefelder
										</div>
									)}
									<OrderDatasheetForm
										orderId={selectedOrderId}
										orderType={orderType}
										editable={editingDatasheet}
										onSpecsChange={(specs) => {
											// Optional: Update draft mit den neuen Specs
											setDraft(prev => ({ ...prev, ...specs }));
										}}
									/>
								</>
							) : message ? (
								<>
									<SpecForm type={((suggestion?.type as any) || 'Hals') as DraftType} value={draft} onChange={setDraft} />
									{!selectedOrderId && (
										<div className="flex gap-2 justify-end">
											<button
												disabled={submitting}
												onClick={() => createNewOrder(draftTypeToOrderType((suggestion?.type as DraftType) || 'Hals'))}
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
							</>
							) : (
							<>
								<div className="px-0.5 py-0.5 border-b border-slate-700/50">
									<div className="flex items-center justify-between mb-2">
										<div className="text-sm font-semibold">Kundendaten</div>
										<div className="flex items-center gap-2">
											{customerInfoSaved && <div className="text-[10px] text-emerald-300">autosaved</div>}
											{shownCustomer?.id && !customerInfoEditMode && (
												<button
													type="button"
													onClick={() => setCustomerInfoEditMode(true)}
													className="text-[11px] text-slate-300 hover:text-slate-100 border border-slate-700 rounded px-2 py-0.5"
												>
													✏ Bearbeiten
												</button>
											)}
										</div>
									</div>
									<div className="grid grid-cols-[96px_1fr] items-center gap-x-3 gap-y-1.5 text-xs">
										<div className="text-slate-500">Name</div>
										{customerInfoEditMode ? (
											<input
												value={customerInfoDraft.name}
												onChange={(e) => setCustomerInfoDraft((p) => ({ ...p, name: e.target.value }))}
												className="h-6 rounded border border-slate-700 bg-transparent px-2 text-xs text-slate-200"
											/>
										) : (
											<div className="h-6 flex items-center text-slate-200">{customerInfoDraft.name || '—'}</div>
										)}

										<div className="text-slate-500">Firma</div>
										{customerInfoEditMode ? (
											<input
												value={customerInfoDraft.company}
												onChange={(e) => setCustomerInfoDraft((p) => ({ ...p, company: e.target.value }))}
												className="h-6 rounded border border-slate-700 bg-transparent px-2 text-xs text-slate-200"
											/>
										) : (
											<div className="h-6 flex items-center text-slate-200">{customerInfoDraft.company || '—'}</div>
										)}

										<div className="text-slate-500">Straße</div>
										{customerInfoEditMode ? (
											<input
												value={customerInfoDraft.addressLine1}
												onChange={(e) => setCustomerInfoDraft((p) => ({ ...p, addressLine1: e.target.value }))}
												className="h-6 rounded border border-slate-700 bg-transparent px-2 text-xs text-slate-200"
											/>
										) : (
											<div className="h-6 flex items-center text-slate-200">{customerInfoDraft.addressLine1 || '—'}</div>
										)}

										<div className="text-slate-500">PLZ / Ort</div>
										{customerInfoEditMode ? (
											<div className="grid grid-cols-2 gap-2">
												<input
													value={customerInfoDraft.postalCode}
													onChange={(e) => setCustomerInfoDraft((p) => ({ ...p, postalCode: e.target.value }))}
													className="h-6 rounded border border-slate-700 bg-transparent px-2 text-xs text-slate-200"
												/>
												<input
													value={customerInfoDraft.city}
													onChange={(e) => setCustomerInfoDraft((p) => ({ ...p, city: e.target.value }))}
													className="h-6 rounded border border-slate-700 bg-transparent px-2 text-xs text-slate-200"
												/>
											</div>
										) : (
											<div className="h-6 flex items-center text-slate-200">
												{[customerInfoDraft.postalCode, customerInfoDraft.city].filter(Boolean).join(' ') || '—'}
											</div>
										)}

										<div className="text-slate-500">Telefon</div>
										{customerInfoEditMode ? (
											<input
												value={customerInfoDraft.phone}
												onChange={(e) => setCustomerInfoDraft((p) => ({ ...p, phone: e.target.value }))}
												className="h-6 rounded border border-slate-700 bg-transparent px-2 text-xs text-slate-200"
											/>
										) : (
											<div className="h-6 flex items-center text-slate-200">{customerInfoDraft.phone || '—'}</div>
										)}

										<div className="text-slate-500">E-Mail</div>
										{customerInfoEditMode ? (
											<input
												value={customerInfoDraft.email}
												onChange={(e) => setCustomerInfoDraft((p) => ({ ...p, email: e.target.value }))}
												className="h-6 rounded border border-slate-700 bg-transparent px-2 text-xs text-slate-200"
											/>
										) : (
											<div className="h-6 flex items-center text-slate-200 truncate">{customerInfoDraft.email || '—'}</div>
										)}
									</div>
									{customerInfoEditMode && (
										<div className="mt-3 flex justify-end gap-2">
											<button
												type="button"
												onClick={() => {
													setCustomerInfoEditMode(false);
													setCustomerInfoDraft({
														name: shownCustomer?.name || '',
														company: (shownCustomer as any)?.company || '',
														addressLine1: (shownCustomer as any)?.addressLine1 || '',
														postalCode: (shownCustomer as any)?.postalCode || '',
														city: (shownCustomer as any)?.city || '',
														phone: shownCustomer?.phone || '',
														email: shownCustomer?.email || '',
														country: (shownCustomer as any)?.country || 'DE',
													});
												}}
												className="px-2 py-1 text-xs rounded border border-slate-700 text-slate-300 hover:bg-slate-800"
											>
												Abbrechen
											</button>
											<button
												type="button"
												disabled={customerInfoSaving || !shownCustomer?.id || !customerInfoDraft.name.trim()}
												onClick={saveCustomerInfo}
												className="px-2 py-1 text-xs rounded bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50"
											>
												{customerInfoSaving ? 'Speichert…' : 'Speichern'}
											</button>
										</div>
									)}
								</div>

								<div className="px-0.5 py-1.5 border-b border-slate-700/50">
									<div className="text-sm font-semibold mb-2">Auftragshistorie</div>
									{sortedCustomerHistory.length === 0 ? (
										<div className="text-xs text-slate-500">Keine Aufträge für diesen Kunden gefunden.</div>
									) : (
										<div className="space-y-1 max-h-64 overflow-auto">
											{sortedCustomerHistory.map((order) => (
												<button
													key={order.id}
													type="button"
													onClick={() => assignOrderToCurrentMail(order.id)}
													className={`w-full text-left px-2 py-1.5 rounded border ${
														selectedOrderId === order.id
															? 'border-sky-600/60 bg-sky-600/10'
															: 'border-slate-800 bg-slate-900/60 hover:bg-slate-800/70'
													}`}
												>
													<div className="flex items-center gap-2 min-w-0">
														<span className={`h-2 w-2 rounded-full ${statusDotClass[normalizeWorkflowStatus(order.status || '')] || 'bg-slate-500'}`} />
														<span className="text-xs text-slate-200 truncate">{order.title || 'Ohne Titel'}</span>
													</div>
													<div className="mt-0.5 flex items-center justify-between gap-2">
														<span className="text-[10px] text-slate-400">{order.id}</span>
														<span className="text-[10px] text-emerald-300">
															{typeof order.finalAmountCents === 'number'
																? `${(order.finalAmountCents / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
																: '—'}
														</span>
													</div>
												</button>
											))}
										</div>
									)}
								</div>

								<div className="border-t border-slate-700/50" />

								<div className="px-0.5 py-1.5">
									<div className="flex items-center justify-between mb-2">
										<div className="text-sm font-semibold">Notiz</div>
										<div className="text-[10px] text-slate-500">{noteSaving ? 'speichert…' : 'autosaved'}</div>
									</div>
									<textarea
										value={customerNote}
										onChange={(e) => setCustomerNote(e.target.value)}
										rows={7}
										placeholder="Interne Kundennotiz..."
										className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-200"
									/>
								</div>
							</>
							)}
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
