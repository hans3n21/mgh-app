import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { ImapFlow } from 'imapflow';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(_req: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Nur Admins können Verbindungen testen
    if (session.user.role !== 'admin' && session.user.role !== 'admin_no_feedback') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const account = await prisma.mailAccount.findUnique({
      where: { id },
    });

    if (!account) {
      return NextResponse.json({ error: 'Mail account not found' }, { status: 404 });
    }

    if (!account.isActive) {
      return NextResponse.json({ error: 'Mail account is not active' }, { status: 400 });
    }

    // Teste IMAP-Verbindung
    const client = new ImapFlow({
      host: account.imapHost,
      port: account.imapPort,
      secure: account.imapPort === 993,
      auth: {
        user: account.imapUser,
        pass: account.imapPass,
      },
      logger: false,
      disableAutoEnable: true,
      missingIdleCommand: 'NOOP',
    });

    try {
      await client.connect();
      const mailbox = await client.mailboxOpen('INBOX');
      const exists = mailbox.exists || 0;
      
      await client.logout();
      
      return NextResponse.json({
        success: true,
        message: `Verbindung erfolgreich! INBOX enthält ${exists} Nachrichten.`,
        mailCount: exists,
      });
    } catch (error: any) {
      // Versuche Logout auch bei Fehler
      try {
        await client.logout();
      } catch {}

      return NextResponse.json(
        {
          error: 'Verbindung fehlgeschlagen',
          details: error.message || 'Unbekannter Fehler',
        },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error('Error testing mail account connection:', error);
    return NextResponse.json(
      {
        error: 'Fehler beim Testen der Verbindung',
        details: error.message || 'Unbekannter Fehler',
      },
      { status: 500 }
    );
  }
}
