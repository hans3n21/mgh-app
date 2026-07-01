import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { z } from 'zod';

const updateSchema = z.object({
	key: z.string().min(1).optional(),
	lang: z.enum(['de', 'en']).optional(),
	subject: z.string().optional().nullable(),
	body: z.string().min(1).optional(),
	variables: z.array(z.string()).optional().nullable(),
});

type RouteParams = {
	params: Promise<{ id: string }>;
};

export async function GET(_req: NextRequest, { params }: RouteParams) {
	try {
		const { id } = await params;
		const template = await prisma.replyTemplate.findUnique({
			where: { id },
		});
		if (!template) {
			return NextResponse.json({ error: 'Template nicht gefunden' }, { status: 404 });
		}
		return NextResponse.json(template);
	} catch (error: any) {
		console.error('Error fetching reply template:', error);
		return NextResponse.json({ error: 'Fehler beim Laden des Templates' }, { status: 500 });
	}
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
	try {
		const session = await auth();
		if (!session?.user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}
		if (session.user.role !== 'admin' && session.user.role !== 'admin_no_feedback') {
			return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
		}

		const { id } = await params;
		const body = await req.json();
		const data = updateSchema.parse(body);

		// Prüfen, ob Template existiert
		const existing = await prisma.replyTemplate.findUnique({
			where: { id },
		});
		if (!existing) {
			return NextResponse.json({ error: 'Template nicht gefunden' }, { status: 404 });
		}

		// Wenn Key geändert wird, prüfen ob neuer Key bereits existiert
		if (data.key && data.key !== existing.key) {
			const keyExists = await prisma.replyTemplate.findUnique({
				where: { key: data.key },
			});
			if (keyExists) {
				return NextResponse.json({ error: 'Template mit diesem Key existiert bereits' }, { status: 400 });
			}
		}

		const template = await prisma.replyTemplate.update({
			where: { id },
			data: {
				...(data.key && { key: data.key }),
				...(data.lang && { lang: data.lang }),
				...(data.subject !== undefined && { subject: data.subject }),
				...(data.body && { body: data.body }),
				...(data.variables !== undefined && { variables: data.variables ?? undefined }),
			},
		});

		return NextResponse.json(template);
	} catch (error: any) {
		if (error instanceof z.ZodError) {
			return NextResponse.json({ error: (error as z.ZodError).issues[0].message }, { status: 400 });
		}
		console.error('Error updating reply template:', error);
		return NextResponse.json({ error: 'Fehler beim Aktualisieren des Templates' }, { status: 500 });
	}
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
	try {
		const session = await auth();
		if (!session?.user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}
		if (session.user.role !== 'admin' && session.user.role !== 'admin_no_feedback') {
			return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
		}

		const { id } = await params;
		const template = await prisma.replyTemplate.findUnique({
			where: { id },
		});
		if (!template) {
			return NextResponse.json({ error: 'Template nicht gefunden' }, { status: 404 });
		}

		await prisma.replyTemplate.delete({
			where: { id },
		});

		return NextResponse.json({ success: true });
	} catch (error: any) {
		console.error('Error deleting reply template:', error);
		return NextResponse.json({ error: 'Fehler beim Löschen des Templates' }, { status: 500 });
	}
}
