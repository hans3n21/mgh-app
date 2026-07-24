import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { generateFillableDatasheet } from '@/lib/pdf/fillable-datasheet';
import { DATASHEET_TYPE_LABELS, isValidDatasheetType } from '@/lib/customer-datasheet';

// GET /api/datasheets/fillable?type=GUITAR            -> Blanko-Datenblatt
// GET /api/datasheets/fillable?orderId=ORD-2025-001   -> vorbefuellt aus Auftrag (Typ kommt vom Auftrag)
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const orderId = searchParams.get('orderId') || undefined;
    let type = searchParams.get('type') || 'GUITAR';

    let orderTitle: string | undefined;
    const values: Record<string, string> = {};

    if (orderId) {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: { customer: true, specs: true },
      });
      if (!order) {
        return NextResponse.json({ error: 'Order not found' }, { status: 404 });
      }
      type = order.type;
      orderTitle = order.title;

      if (order.customer) {
        const c = order.customer;
        if (c.name) values['customer.name'] = c.name;
        if (c.email) values['customer.email'] = c.email;
        if (c.phone) values['customer.phone'] = c.phone;
        if (c.addressLine1) values['customer.addressLine1'] = c.addressLine1;
        if (c.postalCode) values['customer.postalCode'] = c.postalCode;
        if (c.city) values['customer.city'] = c.city;
      }

      // Pro Key den ausfuehrlichsten Wert uebernehmen (es kann Duplikate geben)
      for (const spec of order.specs) {
        const key = `order.${spec.key}`;
        const current = values[key];
        if (!current || spec.value.length > current.length) {
          values[key] = spec.value;
        }
      }
    }

    if (!isValidDatasheetType(type)) {
      return NextResponse.json({ error: `Unknown datasheet type: ${type}` }, { status: 400 });
    }

    const bytes = await generateFillableDatasheet({ type, orderId, orderTitle, values });

    const label = (DATASHEET_TYPE_LABELS[type] || type).replace(/[^\w-]+/g, '-');
    const filename = `MGH-Datenblatt-${label}${orderId ? `-${orderId}` : ''}.pdf`;

    return new NextResponse(Buffer.from(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Error generating fillable datasheet:', error);
    return NextResponse.json({ error: 'Failed to generate datasheet' }, { status: 500 });
  }
}
