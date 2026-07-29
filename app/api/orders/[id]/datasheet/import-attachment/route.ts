import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { loadAttachmentBytes } from '@/lib/mail/attachment-bytes';
import { importDatasheetIntoOrder } from '@/lib/datasheet-import';

interface RouteParams { params: Promise<{ id: string }> }

const Body = z.object({
  attachmentId: z.string().min(1),
  force: z.boolean().optional(),
});

// POST /api/orders/[id]/datasheet/import-attachment  { attachmentId, force? }
// Uebernimmt ein Datenblatt direkt aus einem Mail-Anhang. Der Inhalt wird hier
// geladen — nicht persistierte Anhaenge haengen sonst am IMAP-Abruf im Browser,
// ohne dass der Bediener sieht, dass ueberhaupt etwas passiert.
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: orderId } = await params;
    const body = Body.parse(await req.json().catch(() => ({})));

    const attachment = await prisma.attachment.findUnique({ where: { id: body.attachmentId } });
    if (!attachment) {
      return NextResponse.json({ error: 'Anhang nicht gefunden' }, { status: 404 });
    }

    const loaded = await loadAttachmentBytes(body.attachmentId);
    if (!loaded) {
      return NextResponse.json(
        { error: 'Anhang konnte nicht geladen werden (Mail evtl. nicht mehr auf dem Server).' },
        { status: 404 },
      );
    }

    const result = await importDatasheetIntoOrder({
      orderId,
      bytes: new Uint8Array(loaded.content),
      force: body.force,
    });

    if (!result.ok) {
      const { status, ...rest } = result;
      return NextResponse.json(rest, { status });
    }
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid body', details: error.issues }, { status: 400 });
    }
    console.error('Error importing datasheet from attachment:', error);
    return NextResponse.json({ error: 'Failed to import datasheet' }, { status: 500 });
  }
}
