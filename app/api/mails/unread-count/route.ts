import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';

export async function GET(req: NextRequest) {
	try {
		const session = await auth();
		if (!session?.user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const { searchParams } = new URL(req.url);
		const accountId = searchParams.get('accountId') || null;

		if (accountId) {
			// Count for a specific account
			const count = await prisma.mail.count({
				where: { folder: 'INBOX', isRead: false, accountId },
			});
			return NextResponse.json({ count });
		}

		// Return counts per account + total
		const accounts = await prisma.mailAccount.findMany({
			where: { isActive: true },
			select: { id: true },
		});

		const counts: Record<string, number> = {};
		for (const acc of accounts) {
			counts[acc.id] = await prisma.mail.count({
				where: { folder: 'INBOX', isRead: false, accountId: acc.id },
			});
		}

		const total = Object.values(counts).reduce((a, b) => a + b, 0);
		return NextResponse.json({ count: total, perAccount: counts });
	} catch (error) {
		console.error('Error counting unread mails:', error);
		return NextResponse.json({ error: 'Failed to count unread mails' }, { status: 500 });
	}
}
