import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { z } from 'zod';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const profileSchema = z.object({
  displayName: z.string().max(80).nullable().optional(),
  aiSystemPrompt: z.string().max(12000).nullable().optional(),
  backgroundInfo: z.string().max(12000).nullable().optional(),
  defaultLanguage: z.string().min(2).max(10).optional(),
  defaultOrderType: z.string().max(40).nullable().optional(),
  templateIds: z.array(z.string().min(1).max(64)).max(200).optional(),
  pinnedFolders: z.array(z.string().min(1).max(200)).max(200).optional(),
});

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

    const profile = await prisma.mailAccountProfile.findUnique({ where: { mailAccountId: id } });
    return NextResponse.json(profile ?? {
      mailAccountId: id,
      displayName: null,
      aiSystemPrompt: null,
      backgroundInfo: null,
      defaultLanguage: 'de',
      defaultOrderType: null,
      templateIds: [],
      pinnedFolders: ['INBOX', 'Sent'],
    });
  } catch {
    return NextResponse.json({ error: 'Failed to load profile' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.user.role !== 'admin' && session.user.role !== 'admin_no_feedback') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const account = await prisma.mailAccount.findUnique({ where: { id } });
    if (!account) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const body = await req.json();
    const parsed = profileSchema.parse(body);
    const {
      displayName,
      aiSystemPrompt,
      backgroundInfo,
      defaultLanguage,
      defaultOrderType,
      templateIds,
      pinnedFolders,
    } = parsed;

    const profile = await prisma.mailAccountProfile.upsert({
      where: { mailAccountId: id },
      create: {
        mailAccountId: id,
        displayName: displayName ?? null,
        aiSystemPrompt: aiSystemPrompt ?? null,
        backgroundInfo: backgroundInfo ?? null,
        defaultLanguage: defaultLanguage ?? 'de',
        defaultOrderType: defaultOrderType ?? null,
        templateIds: templateIds ?? [],
        pinnedFolders: pinnedFolders ?? ['INBOX', 'Sent'],
      },
      update: {
        displayName: displayName ?? null,
        aiSystemPrompt: aiSystemPrompt ?? null,
        backgroundInfo: backgroundInfo ?? null,
        defaultLanguage: defaultLanguage ?? 'de',
        defaultOrderType: defaultOrderType ?? null,
        templateIds: templateIds ?? [],
        pinnedFolders: pinnedFolders ?? ['INBOX', 'Sent'],
      },
    });

    return NextResponse.json(profile);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid data', details: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to save profile' }, { status: 500 });
  }
}
