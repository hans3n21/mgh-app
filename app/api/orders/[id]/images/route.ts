import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const createImageSchema = z.object({
  path: z.string(),
  comment: z.string().optional(),
  position: z.number().default(0),
  attach: z.boolean().default(false),
});

interface RouteParams {
  params: { id: string };
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const images = await prisma.orderImage.findMany({
      where: { orderId: params.id },
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
    const body = await request.json();
    const validatedData = createImageSchema.parse(body);

    const image = await prisma.orderImage.create({
      data: {
        orderId: params.id,
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
        orderId: params.id, // Ensure image belongs to this order
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
