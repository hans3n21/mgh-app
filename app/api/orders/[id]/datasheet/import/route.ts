import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { importDatasheetIntoOrder } from '@/lib/datasheet-import';

interface RouteParams { params: Promise<{ id: string }> }

// POST /api/orders/[id]/datasheet/import  (multipart: file = ausgefuelltes PDF)
// Fuer den Datei-Upload aus dem Auftragsdetail. Der Mail-Anhang laeuft ueber
// ../import-attachment, damit das PDF nicht durch den Browser wandern muss.
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: orderId } = await params;

    const formData = await req.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file required' }, { status: 400 });
    }
    // Wird gesetzt, wenn der Bediener eine Herkunfts-Warnung bewusst bestaetigt hat.
    const force = String(formData.get('force') || '') === 'true';

    const result = await importDatasheetIntoOrder({
      orderId,
      bytes: await file.arrayBuffer(),
      force,
    });

    if (!result.ok) {
      const { status, ...rest } = result;
      return NextResponse.json(rest, { status });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error importing datasheet PDF:', error);
    return NextResponse.json({ error: 'Failed to import datasheet' }, { status: 500 });
  }
}
