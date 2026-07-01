import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { ImapFlow } from 'imapflow';

interface RouteParams {
  params: Promise<{ id: string }>;
}

async function getDatabaseFolders(accountId: string) {
  const rows = await prisma.mail.findMany({
    where: {
      accountId,
      isDeleted: false,
    },
    select: {
      folder: true,
    },
  });

  const uniqueFolders = Array.from(
    new Set(rows.map((row) => row.folder).filter((folder): folder is string => Boolean(folder)))
  ).sort((a, b) => a.localeCompare(b));

  return uniqueFolders.map((path) => {
    const parts = path.split(/[/\\]/);
    return {
      path,
      name: parts[parts.length - 1] || path,
      delimiter: path.includes('/') ? '/' : '.',
      specialUse: null,
      source: 'database',
    };
  });
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.user.role !== 'admin' && session.user.role !== 'admin_no_feedback') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const account = await prisma.mailAccount.findUnique({ where: { id } });
    if (!account) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (!account.isActive) return NextResponse.json({ error: 'Account not active' }, { status: 400 });

    let client: ImapFlow | null = null;
    try {
      client = new ImapFlow({
        host: account.imapHost,
        port: account.imapPort,
        secure: account.imapPort === 993,
        auth: { user: account.imapUser, pass: account.imapPass },
        logger: false,
        disableAutoEnable: true,
        missingIdleCommand: 'NOOP',
      });

      await client.connect();
      // ImapFlow.list() accepts an options object; cast to any to avoid TS overload conflict
      const list = await (client as any).list({ pattern: '*' });
      await client.logout();

      const folders = (list || []).map((item: any) => ({
        path: item.path,
        name: item.name,
        delimiter: item.delimiter ?? '/',
        specialUse: item.specialUse ?? null,
      }));

      if (folders.length > 0) return NextResponse.json(folders);
    } catch (error: any) {
      try {
        await client?.logout();
      } catch {
        // Ignore logout errors; the DB fallback below is enough for navigation.
      }
      const fallbackFolders = await getDatabaseFolders(id);
      if (fallbackFolders.length > 0) return NextResponse.json(fallbackFolders);
      return NextResponse.json({ error: 'Failed to list folders', details: error?.message }, { status: 500 });
    }

    const fallbackFolders = await getDatabaseFolders(id);
    return NextResponse.json(fallbackFolders);
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to list folders', details: error?.message }, { status: 500 });
  }
}
