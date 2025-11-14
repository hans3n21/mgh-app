import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
	try {
		// Count unread mails using the new unread field
		const unreadCount = await prisma.mail.count({
			where: {
				unread: true,
			},
		});

		return NextResponse.json({ count: unreadCount });
	} catch (error) {
		console.error('Error counting unread mails:', error);
		return NextResponse.json({ error: 'Failed to count unread mails' }, { status: 500 });
	}
}

