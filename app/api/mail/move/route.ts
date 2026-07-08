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

        const result = await moveMail(mailId, targetFolder);

        return NextResponse.json({ success: true, folder: result.folder });
    } catch (error) {
        console.error('Move mail error:', error);
        // Den echten IMAP-Grund durchreichen (z.B. "Maximum number of
        // connections ... exceeded") statt einer nichtssagenden Meldung —
        // sonst steht in der UI nur "Failed to move mail" ohne Ursache.
        const err = error as { responseText?: string; response?: string; message?: string };
        const detail = err?.responseText || err?.response || err?.message || 'Unbekannter Fehler';
        return NextResponse.json({ error: `Verschieben fehlgeschlagen: ${detail}` }, { status: 500 });
    }
}
