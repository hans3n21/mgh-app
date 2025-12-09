import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';

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
		const json = await req.json();
		const { messageIds, meta } = bodySchema.parse(json);
		// Note: parsedData is now computed dynamically, not stored in DB
		// Meta updates (read, starred, tags) would need a separate table or different approach
		// For now, we only support isRead updates
		if (meta.read !== undefined) {
			await Promise.all(messageIds.map((id) => prisma.mail.update({
				where: { id },
				data: {
					isRead: meta.read,
				},
			})));
		}
		// TODO: Implement starred and tags if needed (would require schema changes)
		return NextResponse.json({ ok: true });
	} catch (error) {
		if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
		return NextResponse.json({ error: 'Failed to update meta' }, { status: 500 });
	}
}


