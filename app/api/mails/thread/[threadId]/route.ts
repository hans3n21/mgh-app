import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';

export async function GET(req: NextRequest, { params }: { params: Promise<{ threadId: string }> }) {
	try {
		const session = await auth();
		if (!session?.user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const { threadId } = await params;
		const { searchParams } = new URL(req.url);
		const accountId = searchParams.get('accountId') || undefined;

		const where = accountId ? { threadId, accountId } : { threadId };
		const mails = await prisma.mail.findMany({
			where,
			orderBy: { date: 'asc' },
			include: { attachments: true, order: { select: { id: true, title: true } } },
		});

		if (mails.length === 0) {
			const single = await prisma.mail.findFirst({
				where: accountId ? { id: threadId, accountId } : { id: threadId },
				include: { attachments: true, order: { select: { id: true, title: true } } },
			});
			if (single) return NextResponse.json([single]);
			return NextResponse.json([]);
		}

		return NextResponse.json(mails);
	} catch (error) {
		console.error('Failed to fetch thread:', error instanceof Error ? error.message : String(error));
		return NextResponse.json({ error: 'Failed to fetch thread' }, { status: 500 });
	}
}
