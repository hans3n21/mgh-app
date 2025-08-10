import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const specUpdateSchema = z.record(z.string());

interface RouteParams {
  params: { id: string };
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const specs = await prisma.orderSpecKV.findMany({
      where: { orderId: params.id },
      orderBy: { key: 'asc' },
    });

    return NextResponse.json(specs);
  } catch (error) {
    console.error('Error fetching specs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch specs' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const body = await request.json();
    const validatedData = specUpdateSchema.parse(body);

    // Upsert specs
    const updates = await Promise.all(
      Object.entries(validatedData).map(([key, value]) =>
        prisma.orderSpecKV.upsert({
          where: {
            id: `spec-${params.id}-${key}`,
          },
          update: { value },
          create: {
            id: `spec-${params.id}-${key}`,
            orderId: params.id,
            key,
            value,
          },
        })
      )
    );

    return NextResponse.json(updates);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid data', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Error updating specs:', error);
    return NextResponse.json(
      { error: 'Failed to update specs' },
      { status: 500 }
    );
  }
}
