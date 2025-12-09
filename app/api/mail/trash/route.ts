import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q');
    const customerId = searchParams.get('customerId');
    const fromEmail = searchParams.get('fromEmail');

    try {
        const whereClause: any = {
            folder: 'Trash', // or 'TRASH' depending on sync normalization
        };

        if (customerId) whereClause.customerId = customerId;
        if (fromEmail) whereClause.fromEmail = { contains: fromEmail, mode: 'insensitive' };
        if (query) {
            whereClause.OR = [
                { subject: { contains: query, mode: 'insensitive' } },
                { text: { contains: query, mode: 'insensitive' } },
            ];
        }

        const mails = await prisma.mail.findMany({
            where: whereClause,
            orderBy: { date: 'desc' },
            take: 50,
            include: {
                attachments: true,
            },
        });

        return NextResponse.json(mails);
    } catch (error) {
        console.error('Search trash error:', error);
        return NextResponse.json({ error: 'Failed to search trash' }, { status: 500 });
    }
}
