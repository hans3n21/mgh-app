import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
	// Lead Model existiert nicht im Prisma-Schema
	return NextResponse.json({ 
		error: 'Lead functionality not available - Lead model is missing from Prisma schema' 
	}, { status: 501 });
}


