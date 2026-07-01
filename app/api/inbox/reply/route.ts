import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { detectLang } from '@/lib/lang/detectLang';
import { publish } from '@/lib/realtime';
import { auth } from '@/lib/auth';

const bodySchema = z.object({
	threadId: z.string().min(1),
	subject: z.string().optional(),
	body: z.string().min(1),
	to: z.string().email().optional(),
});

export async function POST(req: NextRequest) {
	const session = await auth();
	if (!session?.user) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	}

	// InboxMessage Model existiert nicht im Prisma-Schema
	return NextResponse.json({ 
		error: 'Inbox reply functionality not available - InboxMessage model is missing from Prisma schema' 
	}, { status: 501 });
}


