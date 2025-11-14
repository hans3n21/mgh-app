import { prisma } from '@/lib/prisma';

export async function linkMailArtifactsToOrder(mailId: string, orderId: string): Promise<void> {
	// Load mail with attachments
	const mail = await prisma.mail.findUnique({
		where: { id: mailId },
		include: { attachments: true },
	});
	if (!mail) return;

	// Wenn Mail bisher an anderen Auftrag verlinkt war: optional alte Artefakte entfernen
	// Entfernt alte OrderImage-Referenzen und Mail-Nachricht mit Marker
	if (mail.orderId && mail.orderId !== orderId) {
		await prisma.orderImage.deleteMany({ where: { orderId: mail.orderId, comment: { startsWith: 'Mail-Anhang:' } } });
		await prisma.message.deleteMany({ where: { orderId: mail.orderId, body: { contains: `[Mail:${mail.id}]` } } });
	}

	// 1) Create a message in the order's communication, idempotent via token
	const token = `[Mail:${mail.id}]`;
	const existsMsg = await prisma.message.findFirst({ where: { orderId, body: { contains: token } } });
	if (!existsMsg) {
		const header = `Von: ${mail.fromName || mail.fromEmail || 'Unbekannt'}\nBetreff: ${mail.subject || ''}\nDatum: ${mail.date ? new Date(mail.date).toLocaleString() : ''}`;
		const body = `${header}\n\n${mail.text || ''}\n\n${token}`.trim();
		await prisma.message.create({
			data: {
				orderId,
				body,
				senderType: 'customer',
				createdAt: mail.date ?? undefined,
			},
		});
	}

	// 2) Link attachments as OrderImage entries if missing
	for (const att of mail.attachments) {
		const publicPath = `/api/attachments/${att.id}`; // servbares URL; Thumbnail nutzt gleiche Quelle
		const already = await prisma.orderImage.findFirst({ where: { orderId, path: publicPath } });
		if (!already) {
			await prisma.orderImage.create({
				data: {
					orderId,
					path: publicPath,
					comment: `Mail-Anhang: ${att.filename}`,
					attach: true,
					position: 0,
				},
			});
		}
	}
}

export default linkMailArtifactsToOrder;


