import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const createCustomerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  addressLine1: z.string().optional(),
  postalCode: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
});

const updateCustomerSchema = createCustomerSchema.partial();

export async function GET() {
  try {
    const customers = await prisma.customer.findMany({
      include: {
        orders: true,
      },
      orderBy: {
        name: 'asc',
      },
    });

    return NextResponse.json(customers);
  } catch (error) {
    console.error('Error fetching customers:', error);
    return NextResponse.json(
      { error: 'Failed to fetch customers' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = createCustomerSchema.parse(body);

    const customer = await prisma.customer.create({
      data: validatedData,
    });

    return NextResponse.json(customer, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid data', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Error creating customer:', error);
    return NextResponse.json(
      { error: 'Failed to create customer' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...rest } = body || {};
    if (!id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 });
    }
    // Normalize: leere Strings in optionale Felder zu undefined
    const cleaned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rest)) {
      if (typeof v === 'string') {
        const trimmed = v.trim();
        cleaned[k] = trimmed === '' ? undefined : trimmed;
      } else {
        cleaned[k] = v;
      }
    }
    const data = updateCustomerSchema.parse(cleaned);
    const updated = await prisma.customer.update({ where: { id: String(id) }, data });
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid data', details: error.issues }, { status: 400 });
    }
    console.error('Error updating customer:', error);
    return NextResponse.json({ error: 'Failed to update customer' }, { status: 500 });
  }
}
