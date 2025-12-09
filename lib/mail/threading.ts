import { prisma } from '@/lib/prisma';

export interface ThreadResult {
    threadId: string;
    orderId?: string | null;
}

/**
 * Computes the threadId for a new message.
 * 
 * Rules:
 * 1. If In-Reply-To matches an existing message, inherit its threadId and orderId.
 * 2. If References match existing messages, inherit from the most recent one found.
 * 3. If no match, generate a new threadId (using the message's own ID or a new CUID).
 * 
 * @param messageId The Message-ID header of the new message
 * @param inReplyTo The In-Reply-To header
 * @param references The References header (array of Message-IDs)
 * @param fallbackThreadId The ID to use if no parent found (usually the new message's CUID)
 */
export async function computeThreadId(
    inReplyTo: string | undefined | null,
    references: string[] | undefined | null,
    fallbackThreadId: string
): Promise<ThreadResult> {
    // 1. Try direct parent (In-Reply-To)
    if (inReplyTo) {
        const parent = await prisma.mail.findUnique({
            where: { messageId: inReplyTo },
            select: { threadId: true, orderId: true },
        });

        if (parent?.threadId) {
            return { threadId: parent.threadId, orderId: parent.orderId };
        }
    }

    // 2. Try references (iterate backwards to find most recent ancestor)
    if (references && Array.isArray(references) && references.length > 0) {
        // Limit to last 5 references to avoid excessive DB calls
        const recentRefs = references.slice(-5).reverse();

        for (const refId of recentRefs) {
            const parent = await prisma.mail.findUnique({
                where: { messageId: refId },
                select: { threadId: true, orderId: true },
            });

            if (parent?.threadId) {
                return { threadId: parent.threadId, orderId: parent.orderId };
            }
        }
    }

    // 3. New Thread
    return { threadId: fallbackThreadId, orderId: null };
}
