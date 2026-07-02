import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';

const bodySchema = z.object({
	messageIds: z.array(z.string().min(1)),
	meta: z.object({
		starred: z.boolean().optional(),
		read: z.boolean().optional(),
		tags: z.array(z.string()).optional(),
	}).strict(),
});

export async function POST(req: NextRequest) {
	try {
		const session = await auth();
		if (!session?.user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const json = await req.json();
		const { messageIds, meta } = bodySchema.parse(json);

		const data: { isRead?: boolean; starred?: boolean } = {};
		if (meta.read !== undefined) data.isRead = meta.read;
		if (meta.starred !== undefined) data.starred = meta.starred;

		if (Object.keys(data).length > 0) {
			await prisma.mail.updateMany({
				where: { id: { in: messageIds } },
				data,
			});
		}

		// Tags werden angehaengt (Set-Union), passend zum optimistischen UI-Update im Client.
		if (meta.tags && meta.tags.length > 0) {
			const existing = await prisma.mail.findMany({
				where: { id: { in: messageIds } },
				select: { id: true, tags: true },
			});
			await Promise.all(existing.map((mail) => {
				const merged = Array.from(new Set([...(mail.tags ?? []), ...meta.tags!]));
				return prisma.mail.update({ where: { id: mail.id }, data: { tags: merged } });
			}));
		}

		return NextResponse.json({ ok: true });
	} catch (error) {
		if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
		return NextResponse.json({ error: 'Failed to update meta' }, { status: 500 });
	}
}


