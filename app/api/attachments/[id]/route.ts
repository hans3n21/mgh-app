import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface RouteParams { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: RouteParams) {
	try {
		const { id } = await params;
		const att = await prisma.attachment.findUnique({ where: { id } });
		if (!att) return NextResponse.json({ error: 'Not found' }, { status: 404 });

		// If path is a blob URL, redirect to it
		// Otherwise, fetch and proxy the blob
		if (att.path.startsWith('http://') || att.path.startsWith('https://')) {
			// Redirect to blob URL
			return NextResponse.redirect(att.path, {
				headers: {
					'Content-Type': att.mimeType || 'application/octet-stream',
					'Content-Disposition': `inline; filename="${att.filename}"`,
				},
			});
		}

		// Fallback: try to fetch from blob storage
		const response = await fetch(att.path);
		if (!response.ok) {
			return NextResponse.json({ error: 'Failed to fetch attachment' }, { status: 404 });
		}

		const blob = await response.blob();
		return new NextResponse(blob, {
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


