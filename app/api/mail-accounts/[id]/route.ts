import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
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

    // Prüfe ob Account Mails hat
    const account = await prisma.mailAccount.findUnique({
      where: { id },
      include: {
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

    if (account._count.mails > 0) {
      return NextResponse.json(
        { error: 'Cannot delete mail account with existing mails' },
        { status: 400 }
      );
    }

    await prisma.mailAccount.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting mail account:', error);
    return NextResponse.json(
      { error: 'Failed to delete mail account' },
      { status: 500 }
    );
  }
}
