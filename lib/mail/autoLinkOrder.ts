import { prisma } from '@/lib/prisma';
import linkMailArtifactsToOrder from '@/lib/mail/linkArtifacts';
import { parseMail } from './parseMail';

const ORDER_REGEX = /\bORD-\d{4}-\d+\b/;

export async function autoLinkOrderForMail(mailId: string): Promise<string | null> {
	const mail = await prisma.mail.findUnique({ where: { id: mailId } });
	if (!mail) return null;
	if (mail.orderId) return mail.orderId; // already linked

	// 1) Explicit order number from parsedData (computed dynamically)
	const parsedData = parseMail(mail.text || '', mail.html || '');
	const candidateFromParsed: string | undefined = parsedData.orderNumber;
	const fromText = typeof candidateFromParsed === 'string' ? candidateFromParsed : undefined;
	const explicit = fromText && ORDER_REGEX.test(fromText) ? fromText.match(ORDER_REGEX)![0] : undefined;
	if (explicit) {
		const order = await prisma.order.findUnique({ where: { id: explicit } });
		if (order) {
			await prisma.mail.update({ where: { id: mail.id }, data: { orderId: order.id } });
			await linkMailArtifactsToOrder(mail.id, order.id);
			return order.id;
		}
	}

	// 2) Fallback: by fromEmail and unique open order of that customer
	if (mail.fromEmail) {
		const customer = await prisma.customer.findFirst({ where: { email: mail.fromEmail } });
		if (customer) {
			const openOrders = await prisma.order.findMany({
				where: { customerId: customer.id, status: { not: 'complete' } },
				select: { id: true },
			});
			if (openOrders.length === 1) {
				await prisma.mail.update({ where: { id: mail.id }, data: { orderId: openOrders[0].id } });
				await linkMailArtifactsToOrder(mail.id, openOrders[0].id);
				return openOrders[0].id;
			}
		}
	}

	return null;
}

export default autoLinkOrderForMail;


