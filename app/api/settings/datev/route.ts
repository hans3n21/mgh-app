import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SETTING_KEY = 'datev:forwardEmail';

export async function GET() {
  try {
    const setting = await prisma.systemSetting.findUnique({ where: { key: SETTING_KEY } });
    return NextResponse.json({
      forwardEmail: setting?.value || '',
      // Surfaces the env-var override so admins aren't confused about why the
      // field appears unchangeable / a different address is actually used.
      envOverrideSet: !!process.env.DATEV_FORWARD_EMAIL,
    });
  } catch {
    return NextResponse.json({ error: 'Fehler beim Laden der DATEV-Einstellungen' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 });
    }
    if (session.user.role !== 'admin' && session.user.role !== 'admin_no_feedback') {
      return NextResponse.json({ error: 'Nur Admins koennen DATEV-Einstellungen aendern' }, { status: 403 });
    }

    const body = await req.json();
    const forwardEmail = z.string().trim().email().or(z.literal('')).parse(body.forwardEmail ?? '');

    await prisma.systemSetting.upsert({
      where: { key: SETTING_KEY },
      update: { value: forwardEmail },
      create: { key: SETTING_KEY, value: forwardEmail },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Ungueltige E-Mail-Adresse' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Fehler beim Speichern der DATEV-Einstellungen' }, { status: 500 });
  }
}
