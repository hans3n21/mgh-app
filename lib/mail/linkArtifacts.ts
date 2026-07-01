import { prisma } from '@/lib/prisma';
import { persistAttachment } from './attachments';

export async function unlinkMailArtifactsFromOrder(mailId: string, orderId: string): Promise<void> {
	const attachments = await prisma.attachment.findMany({
		where: { mailId },
		select: { id: true },
	});
	const attachmentPaths = attachments.map((attachment) => `/api/attachments/${attachment.id}`);

	await prisma.message.deleteMany({
		where: { orderId, body: { contains: `[Mail:${mailId}]` } },
	});

	if (attachmentPaths.length > 0) {
		await prisma.orderImage.deleteMany({
			where: { orderId, path: { in: attachmentPaths } },
		});
	}
}

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
		await unlinkMailArtifactsFromOrder(mail.id, mail.orderId);
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

	// 2) Persist any attachments that were stored as metadata-only.
	// Now that the mail is linked to an order we want them available permanently
	// (independent of IMAP server state).
	const isSentMail = mail.folder === 'Sent' || !!mail.senderId;
	if (!isSentMail) {
		for (const att of mail.attachments) {
			if (!att.isPersisted) {
				try {
					await persistAttachment(att.id);
				} catch (err) {
					console.error(`[linkArtifacts] Failed to persist attachment ${att.id}:`, err);
				}
			}
		}
	}

	// 3) Link attachments as OrderImage entries if missing
	// Reload attachments so we have updated isPersisted/path after step 2.
	const freshAttachments = await prisma.attachment.findMany({ where: { mailId: mail.id } });
	if (!isSentMail) {
		for (const att of freshAttachments) {
			if (!att.isPersisted || !att.path) {
				console.warn('[linkArtifacts] Skipping non-persisted attachment for order image link', {
					attachmentId: att.id,
					mailId: mail.id,
					orderId,
					reason: !att.isPersisted ? 'not_persisted' : 'missing_path',
				});
				continue;
			}

			const publicPath = `/api/attachments/${att.id}`;
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
}

export default linkMailArtifactsToOrder;

