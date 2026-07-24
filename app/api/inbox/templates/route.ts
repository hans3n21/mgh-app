import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';

// Diese Route ist für die Kompatibilität mit dem ReplyComposer
// Die neue Route ist /api/reply-templates
export async function GET(req: NextRequest) {
	try {
		const session = await auth();
		if (!session) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const { searchParams } = new URL(req.url);
		const lang = (searchParams.get('lang') || '').toLowerCase();
		const accountId = searchParams.get('accountId') || null;

		const where: any = {};
		if (lang) where.lang = lang;

		const templates = await prisma.replyTemplate.findMany({ where, orderBy: { key: 'asc' } });

		if (!accountId) return NextResponse.json(templates);

		// Priorisiere Vorlagen aus dem Account-Profil
		const profile = await prisma.mailAccountProfile.findUnique({ where: { mailAccountId: accountId } });
		const priorityIds = profile?.templateIds ?? [];

		if (priorityIds.length === 0) return NextResponse.json(templates);

		const suggested = templates.filter(t => priorityIds.includes(t.id));
		const others = templates.filter(t => !priorityIds.includes(t.id));

		return NextResponse.json([
			...suggested.map(t => ({ ...t, suggested: true })),
			...others,
		]);
	} catch (e) {
		console.error('templates error', e);
		return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
	}
}

