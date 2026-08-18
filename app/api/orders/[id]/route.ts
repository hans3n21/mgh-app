import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { touchOrderActivity } from '@/lib/order-activity';
import { notify } from '@/lib/notify';
import { auth } from '@/lib/auth';

// Zahlungsdaten kommen als reines Tagesdatum aus dem <input type="date">.
// Gespeichert wird 12:00 Uhr, damit der Tag in keiner Zeitzone kippt.
const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .transform((val) => new Date(`${val}T12:00:00`));

const updateOrderSchema = z.object({
  status: z.enum(['draft', 'awaiting_payment', 'intake', 'quote', 'in_progress', 'waiting_parts', 'finishing', 'setup', 'awaiting_customer', 'complete', 'design_review']).optional(),
  // Auftragsnotiz (frueher "Naechster Schritt", hatte nie ein Eingabefeld):
  // Einzeiler wie "zahlt im November" — beantwortet "was ist mit dem Auftrag?"
  nextStep: z.string().max(500).nullable().optional(),
  assigneeId: z.string().nullable().optional(),
  title: z.string().optional(),
  customerId: z.string().min(1).optional(),
  finalAmountCents: z.number().int().nonnegative().nullable().optional(),
  paymentStatus: z.enum(['open','deposit','paid']).optional(),
  paymentMethod: z.enum(['paypal', 'direktueberweisung']).nullable().optional(),
  depositAmountCents: z.number().int().nonnegative().nullable().optional(),
  depositPaidAt: z.union([dateOnly, z.null()]).optional(),
  paidAt: z.union([dateOnly, z.null()]).optional(),
  shippingCents: z.number().int().nonnegative().nullable().optional(),
});

interface RouteParams { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        customer: true,
        assignee: true,
        specs: true,
        items: { include: { priceItem: true } },
        images: true,
        messages: { include: { sender: true } },
      },
    });

    if (!order) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      );
    }

    // Entferne Duplikate in Specs: behalte den "besten" Wert pro Key
    // Strategie: längerer Wert bevorzugt (vollständiger), sonst neuerer (spätere CUID)
    if (order.specs && Array.isArray(order.specs)) {
      const uniqueSpecsMap = new Map<string, typeof order.specs[0]>();
      for (const spec of order.specs) {
        const existing = uniqueSpecsMap.get(spec.key);
        if (!existing) {
          uniqueSpecsMap.set(spec.key, spec);
        } else {
          const existingLength = existing.value.length;
          const currentLength = spec.value.length;
          if (currentLength > existingLength) {
            uniqueSpecsMap.set(spec.key, spec);
          } else if (currentLength === existingLength && spec.id > existing.id) {
            uniqueSpecsMap.set(spec.key, spec);
          }
        }
      }
      order.specs = Array.from(uniqueSpecsMap.values());
    }

    return NextResponse.json(order);
  } catch (error) {
    console.error('Error fetching order:', error);
    return NextResponse.json(
      { error: 'Failed to fetch order' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const body = await request.json();
    const validatedData = updateOrderSchema.parse(body);

    const { id } = await params;

    // Kunde muss existieren, sonst knallt erst der Fremdschlüssel als 500er
    // (gleiches Muster wie beim Anlegen in app/api/orders/route.ts).
    if (validatedData.customerId) {
      const customerExists = await prisma.customer.findUnique({
        where: { id: validatedData.customerId },
        select: { id: true },
      });
      if (!customerExists) {
        return NextResponse.json({ error: 'Kunde nicht gefunden' }, { status: 400 });
      }
    }

    // Ändert sich der Zahlungsstand, zwei Automatiken auf Basis des Bestands:
    // 1) "Angezahlt heißt: wir starten" — ein wartender Auftrag wird aktiv.
    // 2) Zahlungsdatum: beim Setzen von Angezahlt/Bezahlt heute stempeln
    //    (sofern kein Datum mitkommt und noch keins gespeichert ist); beim
    //    Entfernen der Haken die Daten wieder löschen. deposit→paid lässt
    //    depositPaidAt stehen — der Chef will beide Zahlungen zuordnen können.
    if (validatedData.paymentStatus) {
      const existing = await prisma.order.findUnique({
        where: { id },
        select: { status: true, depositPaidAt: true, paidAt: true },
      });

      if (
        !validatedData.status &&
        (validatedData.paymentStatus === 'deposit' || validatedData.paymentStatus === 'paid') &&
        existing?.status === 'awaiting_payment'
      ) {
        validatedData.status = 'intake';
      }

      if (validatedData.paymentStatus === 'deposit') {
        if (validatedData.depositPaidAt === undefined && !existing?.depositPaidAt) {
          validatedData.depositPaidAt = new Date();
        }
      } else if (validatedData.paymentStatus === 'paid') {
        if (validatedData.paidAt === undefined && !existing?.paidAt) {
          validatedData.paidAt = new Date();
        }
      } else if (validatedData.paymentStatus === 'open') {
        if (validatedData.depositPaidAt === undefined) validatedData.depositPaidAt = null;
        if (validatedData.paidAt === undefined) validatedData.paidAt = null;
      }
    }

    const order = await prisma.order.update({
      where: { id },
      data: validatedData,
      include: {
        customer: true,
        assignee: true,
        specs: true,
        items: { include: { priceItem: true } },
        images: true,
        messages: { include: { sender: true } },
      },
    });

    await touchOrderActivity(id);

    // Bei Neuzuweisung den neuen Bearbeiter benachrichtigen (außer Selbstzuweisung)
    if (validatedData.assigneeId) {
      const session = await auth();
      if (session?.user?.id && session.user.id !== validatedData.assigneeId) {
        await notify({
          userId: validatedData.assigneeId,
          type: 'order_assigned',
          title: `Auftrag dir zugewiesen: ${order.title}`,
          href: `/app/orders/${order.id}`,
        });
      }
    }

    // Entferne Duplikate in Specs: behalte den "besten" Wert pro Key
    if (order.specs && Array.isArray(order.specs)) {
      const uniqueSpecsMap = new Map<string, typeof order.specs[0]>();
      for (const spec of order.specs) {
        const existing = uniqueSpecsMap.get(spec.key);
        if (!existing) {
          uniqueSpecsMap.set(spec.key, spec);
        } else {
          const existingLength = existing.value.length;
          const currentLength = spec.value.length;
          if (currentLength > existingLength) {
            uniqueSpecsMap.set(spec.key, spec);
          } else if (currentLength === existingLength && spec.id > existing.id) {
            uniqueSpecsMap.set(spec.key, spec);
          }
        }
      }
      order.specs = Array.from(uniqueSpecsMap.values());
    }

    return NextResponse.json(order);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid data', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Error updating order:', error);
    return NextResponse.json(
      { error: 'Failed to update order' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Prüfen, ob der Auftrag existiert
    const existing = await prisma.order.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      );
    }

    // Standardweg ist der Papierkorb: die Zeile bleibt stehen, nur deletedAt wird
    // gesetzt. Endgültiges Löschen gibt es nur noch ausdrücklich über ?permanent=1
    // aus dem Papierkorb heraus — denn dabei folgen die onDelete-Cascades im Schema
    // und nehmen Bilder, Datenblatt, Positionen und Notizen mit.
    const permanent = request.nextUrl.searchParams.get('permanent') === '1';

    if (permanent) {
      await prisma.order.delete({ where: { id } });
      return NextResponse.json({ ok: true, permanent: true });
    }

    if (existing.deletedAt) {
      return NextResponse.json({ ok: true, alreadyDeleted: true });
    }

    await prisma.order.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return NextResponse.json({ ok: true, permanent: false });
  } catch (error) {
    console.error('Error deleting order:', error);
    return NextResponse.json(
      { error: 'Failed to delete order' },
      { status: 500 }
    );
  }
}
