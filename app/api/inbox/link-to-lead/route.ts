import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';

const bodySchema = z.object({
	messageId: z.string().min(1),
	leadId: z.string().min(1),
});

export async function POST(req: NextRequest) {
	try {
		const json = await req.json();
		const { messageId, leadId } = bodySchema.parse(json);
		// leadId existiert nicht im Mail-Model
		return NextResponse.json({ 
			error: 'Lead linking not available - leadId field does not exist in Mail model' 
		}, { status: 501 });
	} catch (error) {
		if (error instanceof z.ZodError) {
			return NextResponse.json({ error: 'Invalid data', details: error.issues }, { status: 400 });
		}
		console.error('link-to-lead error', error);
		return NextResponse.json({ error: 'Failed to link to lead' }, { status: 500 });
	}
}


