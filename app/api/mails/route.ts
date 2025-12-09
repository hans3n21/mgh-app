import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { parseMail } from '@/lib/mail/parseMail';

export async function GET(req: NextRequest) {
	try {
		const { searchParams } = new URL(req.url);
		const q = (searchParams.get('q') || '').trim();
		const filter = (searchParams.get('filter') || 'all').toLowerCase();

		console.log('📨 /api/mails → Request params:', { q, filter });

		const where: any = {};
		if (q) {
			where.OR = [
				{ subject: { contains: q, mode: 'insensitive' } },
				{ fromEmail: { contains: q, mode: 'insensitive' } },
				{ fromName: { contains: q, mode: 'insensitive' } },
			];
		}
		if (filter === 'assigned') {
			where.orderId = { not: null };
		} else if (filter === 'unassigned') {
			where.orderId = null;
		}
		// Note: 'with_attachments' filter is handled after query, not in Prisma where clause

		console.log('📨 /api/mails → WHERE:', JSON.stringify(where, null, 2));

		const mails = await prisma.mail.findMany({
			where,
			orderBy: { date: 'desc' },
			include: { attachments: true, order: { select: { id: true, title: true } } },
			// limit to reasonable amount for UI; client can refine via search
			take: 200,
		});

		console.log('📨 /api/mails → Prisma returned:', mails.length, 'mails');

		// Filter by attachments if needed (after query, since hasAttachments doesn't exist in DB)
		let filteredMails = mails;
		if (filter === 'with_attachments') {
			const beforeCount = filteredMails.length;
			filteredMails = mails.filter(m => m.attachments && m.attachments.length > 0);
			console.log('📨 /api/mails → After attachment filter:', beforeCount, '→', filteredMails.length);
		}

		// Add computed fields: parsedData and hasAttachments
		const enrichedMails = filteredMails.map((m, index) => {
			const attachmentsCount = m.attachments ? m.attachments.length : 0;
			const hasAttachments = attachmentsCount > 0;
			const parsedData = parseMail(m.text || '', m.html || '');

			console.log('📨 /api/mails → Mail:', {
				index,
				id: m.id,
				subject: m.subject || '(No Subject)',
				attachments: attachmentsCount,
				hasAttachments,
				parsedDataKeys: Object.keys(parsedData).length,
			});

			return {
				...m,
				parsedData,
				hasAttachments,
				// Ensure isRead is included (from Prisma schema)
				isRead: m.isRead ?? false,
			};
		});

		console.log('📨 /api/mails → Final result:', enrichedMails.length, 'enriched mails');
		return NextResponse.json(enrichedMails);
	} catch (error) {
		console.error('❌ /api/mails → Error:', error);
		console.error('❌ /api/mails → Error details:', {
			message: error instanceof Error ? error.message : String(error),
			stack: error instanceof Error ? error.stack : undefined,
			name: error instanceof Error ? error.name : undefined,
		});
		return NextResponse.json({ error: 'Failed to fetch mails' }, { status: 500 });
	}
}


