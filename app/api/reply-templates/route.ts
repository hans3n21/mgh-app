import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { z } from 'zod';

const createSchema = z.object({
	key: z.string().min(1, 'Key ist erforderlich'),
	lang: z.enum(['de', 'en']).default('de'),
	subject: z.string().optional(),
	body: z.string().min(1, 'Body ist erforderlich'),
	variables: z.array(z.string()).optional(),
});

const updateSchema = createSchema.partial().extend({
	key: z.string().min(1).optional(),
});

export async function GET(req: NextRequest) {
	try {
		const { searchParams } = new URL(req.url);
		const lang = searchParams.get('lang');
		const where: any = {};
		if (lang) where.lang = lang.toLowerCase();
		const templates = await prisma.replyTemplate.findMany({ where, orderBy: { key: 'asc' } });
		return NextResponse.json(templates);
	} catch (error: any) {
		console.error('Error fetching reply templates:', error);
		return NextResponse.json({ error: 'Fehler beim Laden der Templates' }, { status: 500 });
	}
}

export async function POST(req: NextRequest) {
	try {
		const session = await auth();
		if (!session?.user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}
		if (session.user.role !== 'admin' && session.user.role !== 'admin_no_feedback') {
			return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
		}

		const body = await req.json();
		const data = createSchema.parse(body);

		// Prüfen, ob Key bereits existiert
		const existing = await prisma.replyTemplate.findUnique({
			where: { key: data.key },
		});
		if (existing) {
			return NextResponse.json({ error: 'Template mit diesem Key existiert bereits' }, { status: 400 });
		}

		const template = await prisma.replyTemplate.create({
			data: {
				key: data.key,
				lang: data.lang,
				subject: data.subject || null,
				body: data.body,
				variables: data.variables ?? undefined,
			},
		});

		return NextResponse.json(template, { status: 201 });
	} catch (error: any) {
		if (error instanceof z.ZodError) {
			return NextResponse.json({ error: (error as z.ZodError).issues[0].message }, { status: 400 });
		}
		console.error('Error creating reply template:', error);
		return NextResponse.json({ error: 'Fehler beim Erstellen des Templates' }, { status: 500 });
	}
}
