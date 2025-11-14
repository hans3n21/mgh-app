import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface RouteParams { 
  params: Promise<{ id: string }> 
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { unread = false } = body; // Default to mark as read

    const mail = await prisma.mail.update({
      where: { id },
      data: { unread },
      select: { id: true, subject: true, unread: true }
    });

    return NextResponse.json({ 
      success: true, 
      mail: {
        id: mail.id,
        subject: mail.subject,
        unread: mail.unread
      }
    });
  } catch (error) {
    console.error('Error updating mail read status:', error);
    return NextResponse.json({ error: 'Failed to update read status' }, { status: 500 });
  }
}
