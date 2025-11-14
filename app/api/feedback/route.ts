import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

const feedbackSchema = z.object({
  message: z.string().min(1, 'Nachricht ist erforderlich'),
  page: z.string(),
  url: z.string().url(),
  timestamp: z.string(),
  userAgent: z.string().optional(),
});

const resolveSchema = z.object({
  id: z.string(),
  resolved: z.boolean(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = feedbackSchema.parse(body);

    // Feedback in die Datenbank speichern
    const feedback = await prisma.feedback.create({ 
      data: {
        message: validatedData.message,
        page: validatedData.page,
        url: validatedData.url,
        timestamp: new Date(validatedData.timestamp),
        userAgent: validatedData.userAgent,
      }
    });

    // Zusätzlich in die Konsole loggen
    console.log('📝 Neues Feedback erhalten:', {
      id: feedback.id,
      page: validatedData.page,
      url: validatedData.url,
      timestamp: new Date(validatedData.timestamp).toLocaleString('de-DE'),
      message: validatedData.message,
      userAgent: validatedData.userAgent,
    });

    return NextResponse.json({ 
      success: true, 
      message: 'Feedback erfolgreich gesendet' 
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Ungültige Daten', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Feedback-Fehler:', error);
    return NextResponse.json(
      { error: 'Fehler beim Senden des Feedbacks' },
      { status: 500 }
    );
  }
}

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
