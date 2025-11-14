import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
	try {
		const { searchParams } = new URL(req.url);
		const lang = (searchParams.get('lang') || '').toLowerCase();
		const where: any = {};
		if (lang) where.lang = lang;
		const templates = await prisma.replyTemplate.findMany({ where, orderBy: { key: 'asc' } });
		return NextResponse.json(templates);
	} catch (e) {
		console.error('templates error', e);
		return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
	}
}


