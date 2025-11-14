import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import linkMailArtifactsToOrder from '@/lib/mail/linkArtifacts';

const schema = z.object({
	threadId: z.string().min(1),
	type: z.enum(['GUITAR','BODY','NECK','REPAIR','PICKGUARD','PICKUPS','ENGRAVING','FINISH_ONLY']),
	specsDraft: z.record(z.string(), z.any()).optional(),
});

export async function POST(req: NextRequest) {
	// threadId existiert nicht im Mail-Model - Route deaktiviert
	return NextResponse.json({ 
		error: 'Thread functionality not available - threadId field does not exist in Mail model' 
	}, { status: 501 });
}


