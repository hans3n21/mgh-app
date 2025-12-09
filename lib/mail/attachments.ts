import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';

const UPLOAD_BASE_DIR = path.join(process.cwd(), 'uploads', 'mail');

export interface AttachmentMetadata {
    filename: string;
    path: string; // Relative path for DB
    size: number;
    mimeType: string;
}

/**
 * Generates the storage path for an attachment.
 * Format: /uploads/mail/{mailId}/{filename}
 * Returns the relative path.
 */
export function generateAttachmentPath(mailId: string, filename: string): string {
    // Sanitize filename to prevent directory traversal or weird chars
    // We keep the extension but sanitize the name
    const ext = path.extname(filename);
    const name = path.basename(filename, ext).replace(/[^a-zA-Z0-9-_]/g, '_');
    const safeFilename = `${name}${ext}`;

    return path.join(mailId, safeFilename);
}

/**
 * Saves an attachment stream to disk.
 * Ensures the directory exists.
 */
export async function saveAttachment(
    stream: Readable | Buffer,
    filename: string,
    mailId: string,
    mimeType: string
): Promise<AttachmentMetadata> {
    const relativePath = generateAttachmentPath(mailId, filename);
    const absolutePath = path.join(UPLOAD_BASE_DIR, relativePath);
    const dir = path.dirname(absolutePath);

    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    if (Buffer.isBuffer(stream)) {
        await fs.promises.writeFile(absolutePath, stream);
    } else {
        const writeStream = fs.createWriteStream(absolutePath);
        await pipeline(stream, writeStream);
    }

    const stats = await fs.promises.stat(absolutePath);

    return {
        filename,
        path: relativePath, // Store relative path in DB
        size: stats.size,
        mimeType,
    };
}

/**
 * Deletes an attachment file.
 */
export async function deleteAttachment(relativePath: string): Promise<void> {
    const absolutePath = path.join(UPLOAD_BASE_DIR, relativePath);
    if (fs.existsSync(absolutePath)) {
        await fs.promises.unlink(absolutePath);

        // Try to remove the directory if empty (cleanup)
        const dir = path.dirname(absolutePath);
        try {
            const files = await fs.promises.readdir(dir);
            if (files.length === 0) {
                await fs.promises.rmdir(dir);
            }
        } catch (e) {
            // Ignore error if directory not empty
        }
    }
}

/**
 * Gets the absolute path for an attachment.
 */
export function getAttachmentAbsolutePath(relativePath: string): string {
    return path.join(UPLOAD_BASE_DIR, relativePath);
}
