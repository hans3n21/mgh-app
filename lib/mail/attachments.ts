import { put, del } from '@vercel/blob';
import path from 'path';
import { Readable } from 'stream';

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
        const arrayBuffer = u8.slice().buffer;

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
        const arrayBuffer = u8.slice().buffer;
        blob = new Blob([arrayBuffer], { type: mimeType });
    } else if (isReadableStream(stream)) {
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
