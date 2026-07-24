import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { replyToMail } from '@/lib/mail/actions';
import { fetchAttachmentFromImap, loadAttachmentForEmail } from '@/lib/mail/attachments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteParams {
	params: Promise<{ id: string }>;
}

const bodySchema = z.object({
	to: z.string().trim().email().optional(),
	moveToTrash: z.boolean().optional(),
});

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

async function getConfiguredDatevAddress(): Promise<string | null> {
	const setting = await prisma.systemSetting.findUnique({ where: { key: 'datev:forwardEmail' } });
	return process.env.DATEV_FORWARD_EMAIL || setting?.value || null;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
	try {
		const session = await auth();
		if (!session?.user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const { id } = await params;
		const rawBody = await req.json().catch(() => ({}));
		const body = bodySchema.parse(rawBody);

		const target = body.to || await getConfiguredDatevAddress();
		const targetValidation = z.string().email().safeParse(target);
		if (!targetValidation.success) {
			return NextResponse.json(
				{ error: 'DATEV-Zieladresse fehlt oder ist ungueltig', code: 'DATEV_TARGET_REQUIRED' },
				{ status: 400 }
			);
		}

		const mail = await prisma.mail.findUnique({
			where: { id },
			include: {
				account: true,
				attachments: { orderBy: { createdAt: 'asc' } },
			},
		});
		if (!mail) return NextResponse.json({ error: 'Mail not found' }, { status: 404 });

		const attachments: Array<{ filename: string; content: Buffer; contentType: string }> = [];
		let skippedAttachmentCount = 0;
		for (const attachment of mail.attachments) {
			const loaded = await loadAttachmentForEmail(attachment.id);
			if (loaded) {
				attachments.push(loaded);
				continue;
			}

			const fetched = await fetchAttachmentFromImap(attachment.id);
			if (fetched) {
				attachments.push({
					filename: fetched.filename,
					content: fetched.content,
					contentType: fetched.mimeType,
				});
			} else {
				skippedAttachmentCount += 1;
			}
		}

		const originalDate = mail.date ? mail.date.toLocaleString('de-DE') : '-';
		const originalText = mail.text || mail.snippet || '';
		const text = [
			'Weiterleitung an DATEV aus der MGH App.',
			'',
			`Original von: ${mail.fromName || mail.fromEmail}`,
			`Original E-Mail: ${mail.fromEmail}`,
			`Original Betreff: ${mail.subject || 'Ohne Betreff'}`,
			`Original Datum: ${originalDate}`,
			'',
			'Originalnachricht:',
			originalText || '(kein Textinhalt)',
		].join('\n');

		const html = [
			'<p>Weiterleitung an DATEV aus der MGH App.</p>',
			'<dl>',
			`<dt>Original von</dt><dd>${escapeHtml(mail.fromName || mail.fromEmail)}</dd>`,
			`<dt>Original E-Mail</dt><dd>${escapeHtml(mail.fromEmail)}</dd>`,
			`<dt>Original Betreff</dt><dd>${escapeHtml(mail.subject || 'Ohne Betreff')}</dd>`,
			`<dt>Original Datum</dt><dd>${escapeHtml(originalDate)}</dd>`,
			'</dl>',
			'<p>Originalnachricht:</p>',
			`<pre>${escapeHtml(originalText || '(kein Textinhalt)')}</pre>`,
		].join('');

		const sentMail = await replyToMail({
			accountId: mail.account.id,
			senderId: (session.user as any).id || 'system',
			orderId: mail.orderId || undefined,
			customerId: mail.customerId || undefined,
			to: [targetValidation.data],
			subject: mail.subject ? `DATEV: ${mail.subject}` : 'DATEV: Rechnung',
			html,
			text,
			attachments: attachments.length > 0 ? attachments : undefined,
		});

		return NextResponse.json({
			ok: true,
			mode: 'sent',
			mailId: sentMail.id,
			to: targetValidation.data,
			attachmentCount: attachments.length,
			skippedAttachmentCount,
		});
	} catch (error) {
		if (error instanceof z.ZodError) {
			return NextResponse.json({ error: 'Invalid body', details: error.issues }, { status: 400 });
		}
		console.error('DATEV forward error:', error instanceof Error ? error.message : String(error));
		return NextResponse.json({ error: 'DATEV-Weiterleitung fehlgeschlagen' }, { status: 500 });
	}
}
