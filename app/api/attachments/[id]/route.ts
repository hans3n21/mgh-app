import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { prisma } from '@/lib/prisma';
import { fetchAttachmentFromImap, saveAttachment } from '@/lib/mail/attachments';
import { auth } from '@/lib/auth';

interface RouteParams { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: RouteParams) {
	try {
		const session = await auth();
		if (!session) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const { id } = await params;
		const att = await prisma.attachment.findUnique({ where: { id } });
		if (!att) return NextResponse.json({ error: 'Not found' }, { status: 404 });

		const contentType = att.mimeType || 'application/octet-stream';
		const disposition = `inline; filename="${att.filename}"`;

		// ── Not yet persisted: fetch on-demand from IMAP ──────────────────────
		if (!att.isPersisted || !att.path) {
			const fetched = await fetchAttachmentFromImap(id);
			if (!fetched) {
				console.warn('[attachments] on-demand fetch returned no data', {
					attachmentId: att.id,
					mailId: att.mailId,
					imapFolder: att.imapFolder,
					imapUid: att.imapUid,
					filename: att.filename,
					cid: att.cid,
				});
				return NextResponse.json(
					{ error: 'Attachment not available (message no longer on server)' },
					{ status: 404 }
				);
			}

			try {
				const saved = await saveAttachment(
					fetched.content,
					fetched.filename,
					att.mailId,
					fetched.mimeType
				);
				await prisma.attachment.update({
					where: { id: att.id },
					data: {
						path: saved.path,
						size: saved.size,
						mimeType: saved.mimeType,
						isPersisted: true,
					},
				});
			} catch (persistError) {
				// Serving the attachment is more important than caching it.
				console.warn('[attachments] on-demand persist failed', {
					attachmentId: att.id,
					mailId: att.mailId,
					error: persistError instanceof Error ? persistError.message : String(persistError),
				});
			}

			return new NextResponse(new Uint8Array(fetched.content), {
				headers: {
					'Content-Type': fetched.mimeType,
					'Content-Disposition': disposition,
					'Content-Length': String(fetched.content.length),
					// Short cache — content won't change but we don't want to
					// permanently cache something that may disappear from IMAP.
					'Cache-Control': 'private, max-age=300',
				},
			});
		}

		// ── Persisted: serve from Blob or local filesystem ────────────────────
		if (att.path.startsWith('http://') || att.path.startsWith('https://')) {
			return NextResponse.redirect(att.path, {
				headers: {
					'Content-Type': contentType,
					'Content-Disposition': disposition,
				},
			});
		}

		if (att.path.startsWith('local:')) {
			const relPath = att.path.slice(6);
			const cwd = process.cwd();
			const localPath = path.resolve(cwd, relPath);
			if (!localPath.startsWith(cwd + path.sep)) {
				return NextResponse.json({ error: 'Invalid attachment path' }, { status: 400 });
			}
			if (!fs.existsSync(localPath)) {
				return NextResponse.json({ error: 'Attachment file not found' }, { status: 404 });
			}
			const buf = fs.readFileSync(localPath);
			return new NextResponse(buf, {
				headers: { 'Content-Type': contentType, 'Content-Disposition': disposition, 'Content-Length': String(buf.length) },
			});
		}

		const response = await fetch(att.path);
		if (!response.ok) {
			return NextResponse.json({ error: 'Failed to fetch attachment' }, { status: 404 });
		}
		const blob = await response.blob();
		return new NextResponse(blob, {
			headers: { 'Content-Type': contentType, 'Content-Disposition': disposition, 'Content-Length': String(blob.size) },
		});
	} catch (error) {
		console.error('Error serving attachment:', error);
		return NextResponse.json({ error: 'Failed to serve attachment' }, { status: 500 });
	}
}
