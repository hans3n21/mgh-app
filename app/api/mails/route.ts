import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
	try {
		const { searchParams } = new URL(req.url);
		const q = (searchParams.get('q') || '').trim();
		const filter = (searchParams.get('filter') || 'all').toLowerCase();

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
		} else if (filter === 'with_attachments') {
			where.hasAttachments = true;
		}

		const mails = await prisma.mail.findMany({
			where,
			orderBy: { date: 'desc' },
			include: { attachments: true, order: { select: { id: true, title: true } } },
			// limit to reasonable amount for UI; client can refine via search
			take: 200,
		});

		return NextResponse.json(mails);
	} catch (error) {
		console.error('Error fetching mails:', error);
		return NextResponse.json({ error: 'Failed to fetch mails' }, { status: 500 });
	}
}


