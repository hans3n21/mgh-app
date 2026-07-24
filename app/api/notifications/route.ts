import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';

/** Eigene Benachrichtigungen: ungelesene zuerst, dann neueste gelesene. */
export async function GET() {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	}

	const [unread, recent] = await Promise.all([
		prisma.notification.findMany({
			where: { userId: session.user.id, readAt: null },
			orderBy: { createdAt: 'desc' },
			take: 20,
		}),
		prisma.notification.findMany({
			where: { userId: session.user.id, readAt: { not: null } },
			orderBy: { createdAt: 'desc' },
			take: 5,
		}),
	]);

	return NextResponse.json({ unreadCount: unread.length, items: [...unread, ...recent] });
}

const markReadSchema = z.object({
	ids: z.array(z.string()).optional(), // ohne ids: alle als gelesen markieren
});

export async function POST(req: NextRequest) {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	}

	const body = markReadSchema.parse(await req.json().catch(() => ({})));
	await prisma.notification.updateMany({
		where: {
			userId: session.user.id,
			readAt: null,
			...(body.ids && body.ids.length > 0 ? { id: { in: body.ids } } : {}),
		},
		data: { readAt: new Date() },
	});

	return NextResponse.json({ ok: true });
}
