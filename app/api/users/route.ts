import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

const createUserSchema = z.object({
  name: z.string().min(1, 'Name ist erforderlich'),
  email: z.string().email('Gültige E-Mail-Adresse erforderlich'),
  password: z.string().min(6, 'Passwort muss mindestens 6 Zeichen haben'),
  role: z.enum(['admin', 'admin_no_feedback', 'staff']).default('staff'),
});

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    
    // Nur Admins können Benutzer verwalten
    if (!session) {
      console.error('GET /api/users: No session found');
      return NextResponse.json(
        { error: 'Unauthorized - No session' },
        { status: 401 }
      );
    }

    if (session.user?.role !== 'admin' && session.user?.role !== 'admin_no_feedback') {
      console.error(`GET /api/users: Insufficient permissions. Role: ${session.user?.role}`);
      return NextResponse.json(
        { error: `Unauthorized - Role: ${session.user?.role}` },
        { status: 401 }
      );
    }

    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        _count: {
          select: {
            orders: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to fetch users: ${errorMessage}` },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    // Nur Admins können Benutzer erstellen
    if (!session || (session.user?.role !== 'admin' && session.user?.role !== 'admin_no_feedback')) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const validatedData = createUserSchema.parse(body);

    // Prüfen ob E-Mail bereits existiert
    const existingUser = await prisma.user.findUnique({
      where: { email: validatedData.email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'E-Mail-Adresse bereits vergeben' },
        { status: 400 }
      );
    }

    // Passwort hashen
    const passwordHash = await bcrypt.hash(validatedData.password, 12);

    // Benutzer erstellen
    const user = await prisma.user.create({
      data: {
        name: validatedData.name,
        email: validatedData.email,
        passwordHash,
        role: validatedData.role,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Error creating user:', error);
    return NextResponse.json(
      { error: 'Failed to create user' },
      { status: 500 }
    );
  }
}
