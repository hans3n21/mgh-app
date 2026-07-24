import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { persistAttachment } from '@/lib/mail/attachments';
import { touchOrderActivity } from '@/lib/order-activity';

const createImageSchema = z.object({
  path: z.string(),
  comment: z.string().optional(),
  position: z.number().default(0),
  attach: z.boolean().default(false),
  scope: z.string().optional(),
  fieldKey: z.string().optional(),
});

function getAttachmentIdFromApiPath(imagePath: string): string | null {
  const match = imagePath.match(/^\/api\/attachments\/([^/?#]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function ensureAttachmentIsPersisted(attachmentId: string) {
  const attachment = await prisma.attachment.findUnique({
    where: { id: attachmentId },
    select: { id: true, isPersisted: true, path: true },
  });

  if (!attachment) {
    return { ok: false as const, status: 404, error: 'Attachment not found' };
  }

  if (!attachment.isPersisted || !attachment.path) {
    try {
      await persistAttachment(attachmentId);
    } catch (error) {
      console.warn('[order-images] Could not persist mail attachment before linking', {
        attachmentId,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        ok: false as const,
        status: 409,
        error: 'Attachment could not be persisted',
      };
    }
  }

  const refreshed = await prisma.attachment.findUnique({
    where: { id: attachmentId },
    select: { isPersisted: true, path: true },
  });

  if (!refreshed?.isPersisted || !refreshed.path) {
    return {
      ok: false as const,
      status: 409,
      error: 'Attachment could not be persisted',
    };
  }

  return { ok: true as const };
}


export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const validatedData = createImageSchema.parse(body);
    const attachmentId = getAttachmentIdFromApiPath(validatedData.path);

    if (attachmentId) {
      const persisted = await ensureAttachmentIsPersisted(attachmentId);
      if (!persisted.ok) {
        return NextResponse.json(
          { error: persisted.error },
          { status: persisted.status }
        );
      }
    }

    const image = await prisma.orderImage.create({
      data: {
        orderId: id,
        ...validatedData,
      },
    });

    await touchOrderActivity(id);
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

interface RouteParams { params: Promise<{ id: string }> }

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
    const { id: orderId } = await params;

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
        scope: validated.scope === null ? null : validated.scope,
        fieldKey: validated.fieldKey === null ? null : validated.fieldKey,
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
