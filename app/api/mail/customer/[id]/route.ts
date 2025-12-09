import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: customerId } = await params;

    try {
        const mails = await prisma.mail.findMany({
            where: { customerId },
            orderBy: { date: 'desc' },
            include: {
                attachments: true,
                sender: { select: { name: true, email: true } },
            },
        });

        return NextResponse.json(mails);
    } catch (error) {
        console.error('Fetch customer mails error:', error);
        return NextResponse.json({ error: 'Failed to fetch customer mails' }, { status: 500 });
    }
}
