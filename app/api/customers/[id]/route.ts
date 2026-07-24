import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { z } from 'zod';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const updateCustomerSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional().nullable(),
  additionalEmails: z.array(z.string().email()).optional(),
  phone: z.string().optional().nullable(),
  addressLine1: z.string().optional().nullable(),
  postalCode: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  company: z.string().optional().nullable(),
});

/** Does any OTHER customer already claim this address (as primary or secondary)? */
async function findEmailConflict(customerId: string, email: string) {
  return prisma.customer.findFirst({
    where: {
      id: { not: customerId },
      OR: [
        { email: { equals: email, mode: 'insensitive' } },
        { additionalEmails: { has: email } },
      ],
    },
    select: { id: true, name: true },
  });
}

function companyKey(customerId: string) {
  return `customer:company:${customerId}`;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const [customer, companySetting] = await Promise.all([
      prisma.customer.findUnique({
        where: { id },
        include: {
          orders: {
            select: { id: true },
          },
        },
      }),
      prisma.systemSetting.findUnique({
        where: { key: companyKey(id) },
      }),
    ]);

    if (!customer) {
      return NextResponse.json({ error: 'Kunde nicht gefunden' }, { status: 404 });
    }

    return NextResponse.json({
      ...customer,
      company: companySetting?.value || '',
      orderCount: customer.orders?.length || 0,
    });
  } catch {
    return NextResponse.json({ error: 'Fehler beim Laden des Kunden' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const cleaned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body || {})) {
      if (typeof v === 'string') {
        cleaned[k] = v.trim() === '' ? null : v.trim();
      } else {
        cleaned[k] = v;
      }
    }
    const data = updateCustomerSchema.parse(cleaned);
    const { company, additionalEmails, ...customerFields } = data;

    // Warn on (but don't block) an address already claimed by another
    // customer — merging duplicate customer records is a separate, manual step.
    const warnings: Array<{ email: string; conflictCustomer: { id: string; name: string } }> = [];
    let normalizedAdditionalEmails: string[] | undefined;

    if (additionalEmails !== undefined) {
      const primaryEmail = customerFields.email !== undefined
        ? customerFields.email
        : (await prisma.customer.findUnique({ where: { id }, select: { email: true } }))?.email ?? null;
      const primaryLower = primaryEmail?.toLowerCase() ?? null;

      const seen = new Set<string>();
      normalizedAdditionalEmails = [];
      for (const raw of additionalEmails) {
        const email = raw.trim().toLowerCase();
        if (!email || email === primaryLower || seen.has(email)) continue;
        seen.add(email);
        normalizedAdditionalEmails.push(email);
      }

      for (const email of normalizedAdditionalEmails) {
        const conflict = await findEmailConflict(id, email);
        if (conflict) warnings.push({ email, conflictCustomer: conflict });
      }
    }

    const updated = await prisma.customer.update({
      where: { id },
      data: {
        ...customerFields,
        ...(normalizedAdditionalEmails !== undefined ? { additionalEmails: normalizedAdditionalEmails } : {}),
      },
    });

    if (company !== undefined) {
      if (company === null) {
        await prisma.systemSetting.deleteMany({ where: { key: companyKey(id) } });
      } else {
        await prisma.systemSetting.upsert({
          where: { key: companyKey(id) },
          update: { value: company },
          create: { key: companyKey(id), value: company },
        });
      }
    }

    const companySetting = await prisma.systemSetting.findUnique({
      where: { key: companyKey(id) },
    });

    return NextResponse.json({
      ...updated,
      company: companySetting?.value || '',
      warnings,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid data', details: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Fehler beim Aktualisieren des Kunden' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Nur Admins können Kunden löschen
    if (session.user.role !== 'admin' && session.user.role !== 'admin_no_feedback') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;

    // Prüfe ob Kunde existiert und Aufträge hat
    const customer = await prisma.customer.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            orders: true,
          },
        },
      },
    });

    if (!customer) {
      return NextResponse.json({ error: 'Kunde nicht gefunden' }, { status: 404 });
    }

    // Warnen wenn Kunde Aufträge hat
    if (customer._count.orders > 0) {
      return NextResponse.json(
        { 
          error: `Kunde hat ${customer._count.orders} Aufträge und kann nicht gelöscht werden`,
          hasOrders: true,
          orderCount: customer._count.orders
        },
        { status: 400 }
      );
    }

    // Kunde löschen
    await prisma.customer.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting customer:', error);
    return NextResponse.json(
      { error: 'Fehler beim Löschen des Kunden' },
      { status: 500 }
    );
  }
}
