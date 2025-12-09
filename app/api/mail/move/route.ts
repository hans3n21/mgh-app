import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { moveMail } from '@/lib/mail/actions';

export async function POST(req: NextRequest) {
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { mailId, targetFolder } = body;

        if (!mailId || !targetFolder) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        await moveMail(mailId, targetFolder);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Move mail error:', error);
        return NextResponse.json({ error: 'Failed to move mail' }, { status: 500 });
    }
}
