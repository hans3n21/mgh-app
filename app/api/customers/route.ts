import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const createCustomerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
});

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
