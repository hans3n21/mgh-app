import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const createImageSchema = z.object({
  path: z.string(),
  comment: z.string().optional(),
  position: z.number().default(0),
  attach: z.boolean().default(false),
  scope: z.string().optional(),
  fieldKey: z.string().optional(),
});

interface RouteParams {
  params: { id: string };
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const images = await prisma.orderImage.findMany({
      where: { orderId: id },
      orderBy: { position: 'asc' },
    });

    return NextResponse.json(images);
  } catch (error) {
    console.error('Error fetching images:', error);
    return NextResponse.json(
      { error: 'Failed to fetch images' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const validatedData = createImageSchema.parse(body);

    const image = await prisma.orderImage.create({
      data: {
        orderId: id,
        ...validatedData,
      },
    });

    return NextResponse.json(image);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid data', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Error creating image:', error);
    return NextResponse.json(
      { error: 'Failed to create image' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const imageId = searchParams.get('imageId');

    if (!imageId) {
      return NextResponse.json(
        { error: 'Image ID required' },
        { status: 400 }
      );
    }

    await prisma.orderImage.delete({
      where: {
        id: imageId,
        orderId: id, // Ensure image belongs to this order
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting image:', error);
    return NextResponse.json(
      { error: 'Failed to delete image' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: orderId } = await params as unknown as { id: string };

    const updateSchema = z.object({
      id: z.string(),
      comment: z.string().optional(),
      position: z.number().int().optional(),
      attach: z.boolean().optional(),
      scope: z.string().nullable().optional(),
      fieldKey: z.string().nullable().optional(),
    });

    const body = await request.json();
    const validated = updateSchema.parse(body);

    // Sicherstellen, dass das Bild zu diesem Auftrag gehört
    const existing = await prisma.orderImage.findFirst({
      where: { id: validated.id, orderId },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    }

    const image = await prisma.orderImage.update({
      where: { id: validated.id },
      data: {
        comment: validated.comment ?? undefined,
        position: validated.position,
        attach: validated.attach,
        scope: (validated.scope ?? undefined) as string | undefined,
        fieldKey: (validated.fieldKey ?? undefined) as string | undefined,
      },
    });

    return NextResponse.json(image);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid data', details: error.issues },
        { status: 400 }
      );
    }
    console.error('Error updating image:', error);
    return NextResponse.json({ error: 'Failed to update image' }, { status: 500 });
  }
}