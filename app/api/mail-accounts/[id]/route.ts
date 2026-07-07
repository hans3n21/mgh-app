import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { deleteAttachment } from '@/lib/mail/attachments';
import { z } from 'zod';

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  imapHost: z.string().min(1).optional(),
  imapPort: z.number().int().min(1).max(65535).optional(),
  imapUser: z.string().min(1).optional(),
  imapPass: z.string().min(1).optional(),
  smtpHost: z.string().min(1).optional(),
  smtpPort: z.number().int().min(1).max(65535).optional(),
  smtpUser: z.string().min(1).optional(),
  smtpPass: z.string().min(1).optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
  userId: z.string().optional().nullable(),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Nur Admins können Mail-Accounts sehen
    if (session.user.role !== 'admin' && session.user.role !== 'admin_no_feedback') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const account = await prisma.mailAccount.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        _count: {
          select: {
            mails: true,
          },
        },
      },
    });

    if (!account) {
      return NextResponse.json({ error: 'Mail account not found' }, { status: 404 });
    }

    // Entferne Passwörter aus der Antwort
    const { imapPass, smtpPass, ...sanitized } = account;

    return NextResponse.json(sanitized);
  } catch (error) {
    console.error('Error fetching mail account:', error);
    return NextResponse.json(
      { error: 'Failed to fetch mail account' },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Nur Admins können Mail-Accounts bearbeiten
    if (session.user.role !== 'admin' && session.user.role !== 'admin_no_feedback') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();
    const data = updateSchema.parse(body);

    // Wenn isDefault gesetzt wird, setze alle anderen auf false
    if (data.isDefault) {
      await prisma.mailAccount.updateMany({
        where: { 
          isDefault: true,
          id: { not: id },
        },
        data: { isDefault: false },
      });
    }

    const account = await prisma.mailAccount.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.email !== undefined && { email: data.email }),
        ...(data.imapHost !== undefined && { imapHost: data.imapHost }),
        ...(data.imapPort !== undefined && { imapPort: data.imapPort }),
        ...(data.imapUser !== undefined && { imapUser: data.imapUser }),
        ...(data.imapPass !== undefined && { imapPass: data.imapPass }),
        ...(data.smtpHost !== undefined && { smtpHost: data.smtpHost }),
        ...(data.smtpPort !== undefined && { smtpPort: data.smtpPort }),
        ...(data.smtpUser !== undefined && { smtpUser: data.smtpUser }),
        ...(data.smtpPass !== undefined && { smtpPass: data.smtpPass }),
        ...(data.isDefault !== undefined && { isDefault: data.isDefault }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        ...(data.userId !== undefined && { userId: data.userId || null }),
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    // Entferne Passwörter aus der Antwort
    const { imapPass, smtpPass, ...sanitized } = account;

    return NextResponse.json(sanitized);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid data', details: error.issues },
        { status: 400 }
      );
    }
    console.error('Error updating mail account:', error);
    return NextResponse.json(
      { error: 'Failed to update mail account' },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Nur Admins können Mail-Accounts löschen
    if (session.user.role !== 'admin' && session.user.role !== 'admin_no_feedback') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;

    const account = await prisma.mailAccount.findUnique({ where: { id } });
    if (!account) {
      return NextResponse.json({ error: 'Mail account not found' }, { status: 404 });
    }

    // Collect what needs local/Blob file cleanup before the cascading DB
    // delete removes the rows. This never touches the real IMAP/SMTP server --
    // only our local database and locally/Blob-stored copies of attachments.
    const mailsToDelete = await prisma.mail.findMany({
      where: { accountId: id },
      select: { id: true },
    });
    const remoteAttachments = await prisma.attachment.findMany({
      where: { mail: { accountId: id }, path: { startsWith: 'http' } },
      select: { path: true },
    });

    // Mail rows cascade-delete their Attachment/MailExtraction rows at the DB
    // level; MailAccount cascade-deletes MailAccountProfile/AiProfile/
    // EmailTemplate/KnowledgeEntry/CompanyData at the DB level (verified against
    // the live schema, not just prisma/schema.prisma).
    const { count: deletedMails } = await prisma.mail.deleteMany({ where: { accountId: id } });
    await prisma.mailAccount.delete({ where: { id } });

    // Best-effort file cleanup -- the DB deletion above already succeeded, so
    // failures here are logged but don't fail the request.
    for (const att of remoteAttachments) {
      if (!att.path) continue;
      try {
        await deleteAttachment(att.path);
      } catch (cleanupError) {
        console.warn('[mail-accounts] Failed to delete Blob attachment:', att.path, cleanupError);
      }
    }
    for (const mail of mailsToDelete) {
      try {
        const dir = path.resolve(process.cwd(), 'uploads', 'mail', mail.id);
        if (dir.startsWith(process.cwd() + path.sep) && fs.existsSync(dir)) {
          fs.rmSync(dir, { recursive: true, force: true });
        }
      } catch (cleanupError) {
        console.warn('[mail-accounts] Failed to remove local attachment dir for mail:', mail.id, cleanupError);
      }
    }

    return NextResponse.json({ success: true, deletedMails });
  } catch (error) {
    console.error('Error deleting mail account:', error);
    return NextResponse.json(
      { error: 'Failed to delete mail account' },
      { status: 500 }
    );
  }
}
