import { prisma } from '@/lib/prisma';
import type { Customer } from '@prisma/client';

/**
 * Finds a unique customer by email address.
 * 
 * Rules:
 * 1. Match by email (case-insensitive).
 * 2. If EXACTLY ONE customer matches, return it.
 * 3. If multiple customers match, return null (ambiguous).
 * 4. If no match, return null.
 */
export async function findCustomerForEmail(email: string): Promise<Customer | null> {
    if (!email) return null;

    const customers = await prisma.customer.findMany({
        where: {
            email: {
                equals: email,
                mode: 'insensitive',
            },
        },
        take: 2, // Optimization: we only need to know if count is 1 or >1
    });

    if (customers.length === 1) {
        return customers[0];
    }

    // 0 or >1 matches -> return null
    return null;
}
