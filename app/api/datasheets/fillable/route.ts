import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { buildDatasheetForOrder, DatasheetBuildError } from '@/lib/pdf/datasheet-for-order';

// GET /api/datasheets/fillable?type=GUITAR            -> Blanko-Datenblatt
// GET /api/datasheets/fillable?orderId=ORD-2025-001   -> vorbefuellt aus Auftrag (Typ kommt vom Auftrag)
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const { bytes, filename } = await buildDatasheetForOrder({
      orderId: searchParams.get('orderId') || undefined,
      type: searchParams.get('type') || undefined,
    });

    return new NextResponse(Buffer.from(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    if (error instanceof DatasheetBuildError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Error generating fillable datasheet:', error);
    return NextResponse.json({ error: 'Failed to generate datasheet' }, { status: 500 });
  }
}
