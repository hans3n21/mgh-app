import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';

interface RouteParams { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: RouteParams) {
	try {
		const session = await auth();
		if (!session?.user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const { id } = await params;
		const body = await req.json();
		const isRead = Boolean(body.isRead);

		const mail = await prisma.mail.findUnique({ where: { id } });
		if (!mail) {
			return NextResponse.json({ error: 'Mail not found' }, { status: 404 });
		}

		const updated = await prisma.mail.update({
			where: { id },
			data: { isRead },
			select: { id: true, isRead: true },
		});

		return NextResponse.json(updated);
	} catch (error) {
		console.error('Error marking mail as read:', error);
		return NextResponse.json({ error: 'Failed to update mail' }, { status: 500 });
	}
}
