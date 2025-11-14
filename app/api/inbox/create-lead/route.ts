import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';

const bodySchema = z.object({
	threadId: z.string().min(1).optional(),
	messageId: z.string().min(1).optional(),
	type: z.string().min(1),
	initialNote: z.string().max(2000).optional(),
}).refine((v) => !!v.threadId || !!v.messageId, { message: 'threadId oder messageId erforderlich' });

export async function POST(req: NextRequest) {
	// Lead und Thread Models existieren nicht im Prisma-Schema
	return NextResponse.json({ 
		error: 'Lead functionality not available - required Prisma models (lead, thread) are missing from schema' 
	}, { status: 501 });
}


