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
		// store meta on Mail as parsedData extension for now
		await Promise.all(messageIds.map((id) => prisma.mail.update({
			where: { id },
			data: {
				parsedData: meta as any,
			},
		})));
		return NextResponse.json({ ok: true });
	} catch (error) {
		if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
		return NextResponse.json({ error: 'Failed to update meta' }, { status: 500 });
	}
}


