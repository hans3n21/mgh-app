import { prisma } from '@/lib/prisma';
import { assignMailToOrder } from './actions';
import type { OrderType } from '@prisma/client';

type CustomerInput = {
	name?: unknown;
	email?: unknown;
	phone?: unknown;
	address?: unknown;
	addressLine1?: unknown;
	postalCode?: unknown;
	city?: unknown;
	country?: unknown;
};

type EnsureOrderFromMailOptions = {
	orderType?: OrderType;
	customer?: CustomerInput;
};

function cleanString(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined;
	const trimmed = value.trim();
	return trimmed || undefined;
}

function isUniqueConstraintError(error: unknown) {
	return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

function customerDataFromMail(
	mail: { fromName: string | null; fromEmail: string | null; replyToEmail?: string | null },
	input?: CustomerInput
) {
	// Reply-To bevorzugen -- bei Kontaktformular-Mails (z. B. dein-pickguard.de)
	// ist fromEmail die eigene Adresse, die echte Kundenadresse steht im Reply-To.
	const email = cleanString(input?.email) || cleanString(mail.replyToEmail) || cleanString(mail.fromEmail);
	const name = cleanString(input?.name) || cleanString(mail.fromName) || email || 'Unbekannt';
	return {
		name,
		email,
		phone: cleanString(input?.phone),
		addressLine1: cleanString(input?.addressLine1) || cleanString(input?.address),
		postalCode: cleanString(input?.postalCode),
		city: cleanString(input?.city),
		country: cleanString(input?.country),
	};
}

async function resolveCustomerForMail(
	mail: { fromName: string | null; fromEmail: string | null },
	input?: CustomerInput
) {
	const data = customerDataFromMail(mail, input);
	const email = data.email;
	const existing = email
		? await prisma.customer.findFirst({
			where: { OR: [{ email }, { additionalEmails: { has: email.toLowerCase() } }] },
		})
		: null;

	if (existing) {
		const updateData = {
			name: cleanString(input?.name),
			phone: cleanString(input?.phone),
			addressLine1: cleanString(input?.addressLine1) || cleanString(input?.address),
			postalCode: cleanString(input?.postalCode),
			city: cleanString(input?.city),
			country: cleanString(input?.country),
		};
		const cleanedUpdate = Object.fromEntries(
			Object.entries(updateData).filter(([, value]) => value !== undefined)
		);
		if (Object.keys(cleanedUpdate).length > 0) {
			return prisma.customer.update({
				where: { id: existing.id },
				data: cleanedUpdate,
			});
		}
		return existing;
	}

	return prisma.customer.create({
		data: {
			name: data.name,
			email: data.email,
			phone: data.phone,
			addressLine1: data.addressLine1,
			postalCode: data.postalCode,
			city: data.city,
			country: data.country,
		},
	});
}

async function createOrderFromMail(mail: { subject: string | null }, customerId: string, orderType: OrderType) {
	const currentYear = new Date().getFullYear();
	for (let attempt = 0; attempt < 5; attempt += 1) {
		const lastOrder = await prisma.order.findFirst({
			where: { id: { startsWith: `ORD-${currentYear}-` } },
			orderBy: { id: 'desc' },
		});
		const match = lastOrder?.id.match(/ORD-(\d{4})-(\d{3})/);
		const nextNumber = (match ? parseInt(match[2], 10) : 0) + 1 + attempt;
		const orderId = `ORD-${currentYear}-${nextNumber.toString().padStart(3, '0')}`;

		try {
			return await prisma.order.create({
				data: {
					id: orderId,
					title: mail.subject || 'Neuer Auftrag aus Mail',
					type: orderType,
					customerId,
					// Aus Mails entstandene Aufträge sind noch nicht freigegeben:
					// sie starten als Entwurf und werden erst nach Freigabe aktiv.
					status: 'draft',
				},
			});
		} catch (error) {
			if (!isUniqueConstraintError(error)) throw error;
		}
	}
	throw new Error('Failed to allocate order ID');
}

export async function ensureOrderFromMail(mailId: string, options: EnsureOrderFromMailOptions = {}) {
	const mail = await prisma.mail.findUnique({ where: { id: mailId } });
	if (!mail) throw new Error('Mail not found');

	if (mail.orderId) {
		const order = await prisma.order.findUnique({ where: { id: mail.orderId } });
		if (order) {
			await assignMailToOrder(mail.id, order.id, order.customerId);
			return { order, mail } as const;
		}
	}

	const customer = await resolveCustomerForMail(mail, options.customer);
	const createdOrder = await createOrderFromMail(mail, customer.id, options.orderType || 'GUITAR');
	await assignMailToOrder(mail.id, createdOrder.id, customer.id);

	return { order: createdOrder, mail } as const;
}

export default ensureOrderFromMail;


