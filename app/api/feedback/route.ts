import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

const resolveSchema = z.object({
  id: z.string(),
  resolved: z.boolean(),
});

// Neues Feedback kommt ueber PointOut (/api/pointout/feedback). Hier nur Liste und Erledigt-Status.
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session || session.user?.role !== 'admin') {
      return NextResponse.json(
        { error: 'Zugriff verweigert' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const resolved = searchParams.get('resolved');

    const feedback = await prisma.feedback.findMany({
      where: resolved !== null ? { resolved: resolved === 'true' } : undefined,
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(feedback);

  } catch (error) {
    console.error('Fehler beim Laden des Feedbacks:', error);
    return NextResponse.json(
      { error: 'Fehler beim Laden des Feedbacks' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session || session.user?.role !== 'admin') {
      return NextResponse.json(
        { error: 'Zugriff verweigert' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validatedData = resolveSchema.parse(body);

    const feedback = await prisma.feedback.update({
      where: { id: validatedData.id },
      data: {
        resolved: validatedData.resolved,
        resolvedBy: validatedData.resolved ? session.user.id : null,
        resolvedAt: validatedData.resolved ? new Date() : null,
      },
    });

    return NextResponse.json(feedback);

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Ungültige Daten', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Fehler beim Aktualisieren des Feedbacks:', error);
    return NextResponse.json(
      { error: 'Fehler beim Aktualisieren des Feedbacks' },
      { status: 500 }
    );
  }
}
