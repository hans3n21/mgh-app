import { prisma } from '@/lib/prisma';

export async function ensureOrderFromMail(mailId: string) {
	const mail = await prisma.mail.findUnique({ where: { id: mailId } });
	if (!mail) throw new Error('Mail not found');

	if (mail.orderId) {
		const order = await prisma.order.findUnique({ where: { id: mail.orderId } });
		return { order: order!, mail } as const;
	}

	let customer = mail.fromEmail
		? await prisma.customer.findFirst({ where: { email: mail.fromEmail } })
		: null;
	if (!customer) {
		customer = await prisma.customer.create({
			data: {
				name: mail.fromName || mail.fromEmail || 'Unbekannt',
				email: mail.fromEmail || undefined,
			},
		});
	}

	const lastOrder = await prisma.order.findFirst({ orderBy: { id: 'desc' } });
	let orderNumber = 1;
	if (lastOrder) {
		const match = lastOrder.id.match(/ORD-(\d{4})-(\d{3})/);
		if (match) orderNumber = parseInt(match[2]) + 1;
	}
	const currentYear = new Date().getFullYear();
	const orderId = `ORD-${currentYear}-${orderNumber.toString().padStart(3, '0')}`;

	const createdOrder = await prisma.order.create({
		data: {
			id: orderId,
			title: mail.subject || 'Neuer Auftrag aus Mail',
			type: 'GUITAR',
			customerId: customer.id,
		},
	});

	await prisma.mail.update({ where: { id: mail.id }, data: { orderId: createdOrder.id } });

	return { order: createdOrder, mail } as const;
}

export default ensureOrderFromMail;


