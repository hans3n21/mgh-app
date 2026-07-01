import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';

export async function GET(req: NextRequest) {
	const session = await auth();
	if (!session?.user) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	}

	// Lead Model existiert nicht im Prisma-Schema
	return NextResponse.json({ 
		error: 'Lead functionality not available - Lead model is missing from Prisma schema' 
	}, { status: 501 });
}


