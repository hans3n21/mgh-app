import { put, del } from '@vercel/blob';
import path from 'path';
import fs from 'fs';
import { Readable } from 'stream';
import { simpleParser } from 'mailparser';
import { prisma } from '@/lib/prisma';
import { getImapClient } from './client';
import { TRASH_FOLDER_CANDIDATES } from './folders';

export interface AttachmentMetadata {
    filename: string;
    path: string; // Blob URL or path identifier for DB
    size: number;
    mimeType: string;
}

/**
 * Type guard to check if a value is a ReadableStream.
 * Works with both Web ReadableStream and Node.js ReadableStream.
 */
function isReadableStream(value: unknown): value is ReadableStream {
    return typeof value === 'object' && 
           value !== null && 
           'getReader' in value && 
           typeof (value as any).getReader === 'function';
}

/**
 * Generates the storage path for an attachment.
 * Format: mail/{mailId}/{filename}
 * Returns the relative path identifier.
 */
export function generateAttachmentPath(mailId: string, filename: string): string {
    // Sanitize filename to prevent directory traversal or weird chars
    // We keep the extension but sanitize the name
    const ext = path.extname(filename);
    const name = path.basename(filename, ext).replace(/[^a-zA-Z0-9-_]/g, '_');
    const safeFilename = `${name}${ext}`;

    return `mail/${mailId}/${safeFilename}`;
}

/**
 * Saves an attachment to Vercel Blob Storage.
 * Returns metadata including the blob URL.
 * Supports Buffer, Uint8Array, Node.js Readable streams, and Web ReadableStream.
 */
export async function saveAttachment(
    stream: Readable | Buffer | Uint8Array | ReadableStream,
    filename: string,
    mailId: string,
    mimeType: string
): Promise<AttachmentMetadata> {
    const relativePath = generateAttachmentPath(mailId, filename);
    
    // Convert to Blob
    let blob: Blob;
    
    if (Buffer.isBuffer(stream) || stream instanceof Uint8Array) {
        // Schritt 1: Immer in Uint8Array konvertieren
        const u8 = Buffer.isBuffer(stream)
            ? new Uint8Array(stream)
            : stream;

        // Schritt 2: Neues ArrayBuffer erzeugen (NICHT u8.buffer verwenden!)
        const sliced = u8.slice();
        const arrayBuffer: ArrayBuffer = sliced.buffer;

        // Schritt 3: Blob erzeugen
        blob = new Blob([arrayBuffer], { type: mimeType });
    } else if (stream instanceof Readable) {
        // Node.js Readable stream - collect all chunks and convert to single Uint8Array
        const bufferChunks: Buffer[] = [];
        for await (const chunk of stream) {
            bufferChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        // Combine all buffers into one
        const combinedBuffer = Buffer.concat(bufferChunks);
        // Convert to Uint8Array with safe ArrayBuffer (same method as Buffer/Uint8Array block)
        const u8 = new Uint8Array(combinedBuffer);
        const sliced = u8.slice();
        const arrayBuffer: ArrayBuffer = sliced.buffer;
        blob = new Blob([arrayBuffer], { type: mimeType });
    } else if (isReadableStream(stream)) {
        // Web ReadableStream - convert to chunks with safe ArrayBuffer
        const chunks: Uint8Array[] = [];
        const reader = stream.getReader();
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                // Convert each chunk to safe ArrayBuffer (same method as Buffer/Uint8Array block)
                const u8 = new Uint8Array(value);
                const sliced = u8.slice();
                const arrayBuffer: ArrayBuffer = sliced.buffer;
                chunks.push(new Uint8Array(arrayBuffer));
            }
        } finally {
            reader.releaseLock();
        }
        // Combine all chunks into single ArrayBuffer for Blob
        const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
        const combined = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
            combined.set(chunk, offset);
            offset += chunk.length;
        }
        const finalSliced = combined.slice();
        const finalArrayBuffer: ArrayBuffer = finalSliced.buffer;
        blob = new Blob([finalArrayBuffer], { type: mimeType });
    } else {
        throw new Error(`Unsupported stream type: ${typeof stream}`);
    }

    // Try Vercel Blob first; fall back to local filesystem if no token / Blob fails (e.g. local dev)
    try {
        if (process.env.BLOB_READ_WRITE_TOKEN) {
            const blobResult = await put(relativePath, blob, {
                access: 'public',
                contentType: mimeType,
                addRandomSuffix: false,
            });
            return {
                filename,
                path: blobResult.url,
                size: blob.size,
                mimeType,
            };
        }
    } catch {
        /* fall through to local */
    }

    const localDir = path.join(process.cwd(), 'uploads', 'mail', mailId);
    fs.mkdirSync(localDir, { recursive: true });
    const localPath = path.join(localDir, path.basename(relativePath));
    const buf = Buffer.from(await blob.arrayBuffer());
    fs.writeFileSync(localPath, buf);
    return {
        filename,
        path: `local:${path.relative(process.cwd(), localPath).replace(/\\/g, '/')}`,
        size: buf.length,
        mimeType,
    };
}

/**
 * Deletes an attachment from Vercel Blob Storage.
 */
export async function deleteAttachment(blobUrl: string): Promise<void> {
    try {
        await del(blobUrl);
    } catch (error) {
        // Ignore if blob doesn't exist
        console.warn('Failed to delete attachment:', error);
    }
}

/**
 * Gets the blob URL for an attachment.
 * For Vercel Blob, the path stored in DB is already the URL.
 */
export function getAttachmentAbsolutePath(blobUrl: string): string {
    return blobUrl;
}

/**
 * Fetches a single attachment's raw content on-demand from the IMAP server.
 *
 * Used when isPersisted=false and the user opens/downloads the attachment.
 * We re-fetch the full message, re-parse it, and find the attachment by
 * filename + cid so we don't need to store per-part IMAP offsets.
 *
 * Returns null when the message no longer exists on the server.
 */
export async function fetchAttachmentFromImap(
    attachmentId: string
): Promise<{ content: Buffer; filename: string; mimeType: string } | null> {
    const att = await prisma.attachment.findUnique({
        where: { id: attachmentId },
        include: { mail: { include: { account: true } } },
    });
    if (!att || !att.imapUid || !att.imapFolder) return null;

    const account = att.mail.account;
    const foldersToTry = Array.from(new Set(
        [att.imapFolder, att.mail.folder, ...TRASH_FOLDER_CANDIDATES, 'INBOX', 'Sent'].filter(Boolean)
    ));

    try {
        const client = await getImapClient(account);

        for (const folder of foldersToTry) {
            let lock: Awaited<ReturnType<typeof client.getMailboxLock>> | null = null;
            try {
                lock = await client.getMailboxLock(folder);
                const msgs: Buffer[] = [];
                for await (const msg of client.fetch(
                    String(att.imapUid),
                    { source: true },
                    { uid: true }
                )) {
                    if (msg.source) msgs.push(Buffer.isBuffer(msg.source) ? msg.source : Buffer.from(msg.source));
                }
                if (msgs.length === 0) continue;

                const parsed = await simpleParser(msgs[0]);
                // Find the best matching attachment deterministically:
                // 1) exact cid match, 2) filename+size, 3) filename.
                const candidates = parsed.attachments
                    .map((a) => {
                        const cidMatches = !!att.cid && !!a.cid && a.cid === att.cid;
                        const filenameMatches = !!a.filename && a.filename === att.filename;
                        const sizeMatches = typeof a.size === 'number' && a.size === att.size;

                        let score = 0;
                        if (cidMatches) score += 100;
                        if (filenameMatches && sizeMatches) score += 50;
                        else if (filenameMatches) score += 10;

                        return { a, score };
                    })
                    .filter((entry) => entry.score > 0)
                    .sort((left, right) => right.score - left.score);
                const match = candidates[0]?.a;
                if (!match) continue;

                return {
                    content: Buffer.isBuffer(match.content) ? match.content : Buffer.from(match.content),
                    filename: att.filename,
                    mimeType: att.mimeType ?? match.contentType ?? 'application/octet-stream',
                };
            } catch {
                continue;
            } finally {
                lock?.release();
            }
        }

        return null;
    } catch (err) {
        console.warn(`[attachments] IMAP fetch failed for attachment ${attachmentId}:`, err);
        return null;
    }
}

/**
 * Fetches an attachment from IMAP and stores it persistently (Blob or local).
 * Sets isPersisted=true and path on the record afterwards.
 *
 * Called when a mail is linked to an order so that order images / downloads
 * remain available even after the source mail is removed from IMAP.
 */
export async function persistAttachment(attachmentId: string): Promise<void> {
    const att = await prisma.attachment.findUnique({ where: { id: attachmentId } });
    if (!att || att.isPersisted) return; // already done

    const fetched = await fetchAttachmentFromImap(attachmentId);
    if (!fetched) {
        // Message gone from IMAP — nothing we can do, leave isPersisted=false.
        console.warn(`[attachments] Cannot persist ${attachmentId}: message no longer on IMAP server`);
        return;
    }

    const saved = await saveAttachment(
        fetched.content,
        fetched.filename,
        att.mailId,
        fetched.mimeType
    );

    await prisma.attachment.update({
        where: { id: attachmentId },
        data: {
            path: saved.path,
            isPersisted: true,
        },
    });
}

/**
 * Loads attachment content as Buffer for email sending.
 * Returns null if attachment not found or cannot be read.
 */
export async function loadAttachmentForEmail(
    attachmentId: string
): Promise<{ filename: string; content: Buffer; contentType: string } | null> {
    const att = await prisma.attachment.findUnique({ where: { id: attachmentId } });
    if (!att || !att.path) return null;

    let buf: Buffer;
    if (att.path.startsWith('local:')) {
        const relPath = att.path.slice(6);
        const localPath = path.join(process.cwd(), relPath);
        if (!fs.existsSync(localPath)) return null;
        buf = fs.readFileSync(localPath);
    } else if (att.path.startsWith('http://') || att.path.startsWith('https://')) {
        const response = await fetch(att.path);
        if (!response.ok) return null;
        const arrBuf = await response.arrayBuffer();
        buf = Buffer.from(arrBuf);
    } else {
        return null;
    }

    return {
        filename: att.filename,
        content: buf,
        contentType: att.mimeType || 'application/octet-stream',
    };
}
