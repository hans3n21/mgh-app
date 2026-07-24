import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { assignMailToOrder } from '@/lib/mail/actions';
import { auth } from '@/lib/auth';

interface RouteParams { params: Promise<{ id: string }> }

const updateSchema = z.object({
	orderId: z.string().nullable().optional(),
});

export async function GET(_req: NextRequest, { params }: RouteParams) {
	try {
		const session = await auth();
		if (!session?.user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

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
		const session = await auth();
		if (!session?.user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const body = await req.json();
		const data = updateSchema.parse(body);
		const { id } = await params;

		const previous = await prisma.mail.findUnique({
			where: { id },
			select: { orderId: true, customerId: true },
		});

		let customerId: string | null = previous?.customerId ?? null;
		if (data.orderId) {
			const order = await prisma.order.findUnique({
				where: { id: data.orderId },
				select: { customerId: true },
			});
			if (!order) {
				return NextResponse.json({ error: 'Order not found' }, { status: 404 });
			}
			customerId = order.customerId;
		}

		await assignMailToOrder(id, data.orderId ?? null, customerId);

		const updated = await prisma.mail.findUnique({
			where: { id },
			include: { attachments: true, order: true },
		});
		if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });

		return NextResponse.json(updated);
	} catch (error) {
		if (error instanceof z.ZodError) {
			return NextResponse.json({ error: 'Invalid data', details: error.issues }, { status: 400 });
		}
		console.error('Error updating mail:', error);
		return NextResponse.json({ error: 'Failed to update mail' }, { status: 500 });
	}
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
	try {
		const session = await auth();
		if (!session?.user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const { id } = await params;

		const mail = await prisma.mail.findUnique({
			where: { id },
			select: {
				id: true,
				orderId: true,
				attachments: { select: { id: true } },
			},
		});
		if (!mail) return NextResponse.json({ error: 'Not found' }, { status: 404 });

		const attachmentPaths = mail.attachments.map((a) => `/api/attachments/${a.id}`);

		await prisma.$transaction(async (tx) => {
			if (mail.orderId) {
				await tx.message.deleteMany({
					where: { orderId: mail.orderId, body: { contains: `[Mail:${id}]` } },
				});
				if (attachmentPaths.length > 0) {
					await tx.orderImage.deleteMany({
						where: { orderId: mail.orderId, path: { in: attachmentPaths } },
					});
				}
			}
			await tx.mail.delete({ where: { id } });
		});

		return NextResponse.json({ success: true });
	} catch (error) {
		console.error('Error deleting mail:', error);
		return NextResponse.json({ error: 'Failed to delete mail' }, { status: 500 });
	}
}
