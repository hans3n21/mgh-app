import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { z } from 'zod';

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  imapHost: z.string().min(1),
  imapPort: z.number().int().min(1).max(65535),
  imapUser: z.string().min(1),
  imapPass: z.string().min(1),
  smtpHost: z.string().min(1),
  smtpPort: z.number().int().min(1).max(65535),
  smtpUser: z.string().min(1),
  smtpPass: z.string().min(1),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
  userId: z.string().optional().nullable(),
});

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

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Nur Admins können Mail-Accounts sehen
    if (session.user.role !== 'admin' && session.user.role !== 'admin_no_feedback') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const includeCounts = req.nextUrl.searchParams.get('includeCounts') === '1';

    const accounts = await prisma.mailAccount.findMany({
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        ...(includeCounts
          ? {
              _count: {
                select: {
                  mails: true,
                },
              },
            }
          : {}),
      },
      orderBy: [
        { isDefault: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    // Entferne Passwörter aus der Antwort
    const sanitized = accounts.map(({ imapPass, smtpPass, ...rest }) => rest);

    return NextResponse.json(sanitized);
  } catch (error) {
    console.error('Error fetching mail accounts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch mail accounts' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Nur Admins können Mail-Accounts erstellen
    if (session.user.role !== 'admin' && session.user.role !== 'admin_no_feedback') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const data = createSchema.parse(body);

    // Wenn isDefault gesetzt wird, setze alle anderen auf false
    if (data.isDefault) {
      await prisma.mailAccount.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }

    const account = await prisma.mailAccount.create({
      data: {
        name: data.name,
        email: data.email,
        imapHost: data.imapHost,
        imapPort: data.imapPort,
        imapUser: data.imapUser,
        imapPass: data.imapPass,
        smtpHost: data.smtpHost,
        smtpPort: data.smtpPort,
        smtpUser: data.smtpUser,
        smtpPass: data.smtpPass,
        isDefault: data.isDefault ?? false,
        isActive: data.isActive ?? true,
        userId: data.userId || null,
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

    return NextResponse.json(sanitized, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid data', details: error.issues },
        { status: 400 }
      );
    }
    console.error('Error creating mail account:', error);
    return NextResponse.json(
      { error: 'Failed to create mail account' },
      { status: 500 }
    );
  }
}
