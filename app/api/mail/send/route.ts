import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { replyToMail } from '@/lib/mail/actions';
import { getDefaultAccount } from '@/lib/mail/account'; // We need to implement this helper or just use DB
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const formData = await req.formData();

        const orderId = formData.get('orderId') as string;
        const customerId = formData.get('customerId') as string;
        const accountId = formData.get('accountId') as string;
        const to = JSON.parse(formData.get('to') as string || '[]');
        const cc = JSON.parse(formData.get('cc') as string || '[]');
        const bcc = JSON.parse(formData.get('bcc') as string || '[]');
        const subject = formData.get('subject') as string;
        const html = formData.get('html') as string;
        const text = formData.get('text') as string;
        const inReplyToMessageId = formData.get('inReplyToMessageId') as string;

        const files = formData.getAll('attachments') as File[];

        // Process attachments
        const attachments = [];
        for (const file of files) {
            if (file.size > 0) {
                const buffer = Buffer.from(await file.arrayBuffer());
                attachments.push({
                    filename: file.name,
                    content: buffer,
                    contentType: file.type,
                });
            }
        }

        // Resolve Account ID
        let finalAccountId = accountId;
        if (!finalAccountId) {
            const defaultAccount = await prisma.mailAccount.findFirst({ where: { isDefault: true } });
            if (defaultAccount) finalAccountId = defaultAccount.id;
            else {
                // Fallback to any active
                const anyAccount = await prisma.mailAccount.findFirst({ where: { isActive: true } });
                if (anyAccount) finalAccountId = anyAccount.id;
                else throw new Error('No active mail account found');
            }
        }

        const result = await replyToMail({
            accountId: finalAccountId,
            senderId: session.user.id,
            orderId: orderId || undefined,
            customerId: customerId || undefined,
            to,
            cc,
            bcc,
            subject,
            html,
            text,
            inReplyToMessageId: inReplyToMessageId || undefined,
            attachments,
        });

        return NextResponse.json(result);
    } catch (error) {
        console.error('Send mail error:', error);
        return NextResponse.json({ error: 'Failed to send mail' }, { status: 500 });
    }
}
