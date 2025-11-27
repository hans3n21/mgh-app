import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createReadStream } from 'fs';
import * as path from 'path';

interface RouteParams { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: RouteParams) {
	try {
		const { id } = await params;
		const att = await prisma.attachment.findUnique({ where: { id } });
		if (!att) return NextResponse.json({ error: 'Not found' }, { status: 404 });

		const abs = path.join(process.cwd(), 'uploads', 'mail', att.path);
		const stream = createReadStream(abs);
		return new NextResponse(stream as any, {
			headers: {
				'Content-Type': att.mimeType || 'application/octet-stream',
				'Content-Disposition': `inline; filename="${att.filename}"`,
			},
		});
	} catch (error) {
		console.error('Error serving attachment:', error);
		return NextResponse.json({ error: 'Failed to serve attachment' }, { status: 500 });
	}
}


