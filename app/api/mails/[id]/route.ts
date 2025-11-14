import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import linkMailArtifactsToOrder from '@/lib/mail/linkArtifacts';

interface RouteParams { params: Promise<{ id: string }> }

const updateSchema = z.object({
	orderId: z.string().nullable().optional(),
});

export async function GET(_req: NextRequest, { params }: RouteParams) {
	try {
		const { id } = await params;
		const mail = await prisma.mail.findUnique({
			where: { id },
			include: { attachments: true, order: true },
		});
		if (!mail) return NextResponse.json({ error: 'Not found' }, { status: 404 });
		return NextResponse.json(mail);
	} catch (error) {
		console.error('Error fetching mail:', error);
		return NextResponse.json({ error: 'Failed to fetch mail' }, { status: 500 });
	}
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
	try {
		const body = await req.json();
		const data = updateSchema.parse(body);
		const { id } = await params;
		const updated = await prisma.mail.update({
			where: { id },
			data: { orderId: data.orderId ?? null },
			include: { attachments: true, order: true },
		});

		if (updated.orderId) {
			// Verlinke Anhänge und Nachricht in den Auftrag (idempotent)
			await linkMailArtifactsToOrder(updated.id, updated.orderId);
		}
		return NextResponse.json(updated);
	} catch (error) {
		if (error instanceof z.ZodError) {
			return NextResponse.json({ error: 'Invalid data', details: error.issues }, { status: 400 });
		}
		console.error('Error updating mail:', error);
		return NextResponse.json({ error: 'Failed to update mail' }, { status: 500 });
	}
}


