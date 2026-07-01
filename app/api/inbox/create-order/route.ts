import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import linkMailArtifactsToOrder from '@/lib/mail/linkArtifacts';
import { auth } from '@/lib/auth';

const schema = z.object({
	threadId: z.string().min(1),
	type: z.enum(['GUITAR','BODY','NECK','REPAIR','PICKGUARD','PICKUPS','ENGRAVING','FINISH_ONLY']),
	specsDraft: z.record(z.string(), z.any()).optional(),
});

export async function POST(req: NextRequest) {
	const session = await auth();
	if (!session?.user) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	}

	// threadId existiert nicht im Mail-Model - Route deaktiviert
	return NextResponse.json({ 
		error: 'Thread functionality not available - threadId field does not exist in Mail model' 
	}, { status: 501 });
}

