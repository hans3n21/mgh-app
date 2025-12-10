import { put, del } from '@vercel/blob';
import path from 'path';
import { Readable } from 'stream';
import { ReadableStream as NodeReadableStream } from 'stream/web';

export interface AttachmentMetadata {
    filename: string;
    path: string; // Blob URL or path identifier for DB
    size: number;
    mimeType: string;
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
        // Buffer or Uint8Array - direct conversion
        blob = new Blob([stream], { type: mimeType });
    } else if (stream instanceof Readable) {
        // Node.js Readable stream - convert to Buffer first
        const chunks: Buffer[] = [];
        for await (const chunk of stream) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        blob = new Blob(chunks, { type: mimeType });
    } else if (stream instanceof ReadableStream || stream instanceof NodeReadableStream) {
        // Web ReadableStream - convert to chunks
        const chunks: Uint8Array[] = [];
        const reader = stream.getReader();
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                chunks.push(value);
            }
        } finally {
            reader.releaseLock();
        }
        blob = new Blob(chunks, { type: mimeType });
    } else {
        throw new Error(`Unsupported stream type: ${typeof stream}`);
    }

    const blobResult = await put(relativePath, blob, {
        access: 'public',
        contentType: mimeType,
        addRandomSuffix: false,
    });

    return {
        filename,
        path: blobResult.url, // Store blob URL in DB
        size: blob.size,
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
