import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';

const emptyToUndefined = (val: unknown) => (val === '' ? undefined : val);

const CreateProcurementItemSchema = z.object({
  name: z.string().min(1, 'Name ist erforderlich'),
  qty: z.number().int().positive('Menge muss positiv sein'),
  unit: z.preprocess(emptyToUndefined, z.string().optional()),
  neededBy: z.preprocess(emptyToUndefined, z.string().optional().transform(val => val ? new Date(val) : undefined)),
  note: z.preprocess(emptyToUndefined, z.string().optional()),
  orderId: z.preprocess(emptyToUndefined, z.string().optional()),
  link: z.preprocess(emptyToUndefined, z.string().url().optional().or(z.literal(''))),
});

const UpdateProcurementItemSchema = z.object({
  id: z.string(),
  name: z.string().min(1).optional(),
  qty: z.number().int().positive().optional(),
  unit: z.preprocess(emptyToUndefined, z.string().optional()),
  status: z.enum(['offen', 'bestellt', 'archiviert']).optional(),
  neededBy: z.preprocess(emptyToUndefined, z.string().optional().transform(val => val ? new Date(val) : undefined)),
  note: z.preprocess(emptyToUndefined, z.string().optional()),
  orderId: z.preprocess(emptyToUndefined, z.string().optional()),
  link: z.preprocess(emptyToUndefined, z.string().url().optional().or(z.literal(''))),
});

// GET /api/procurement - Liste aller Procurement Items
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const showArchived = searchParams.get('archived') === 'true';
    const status = searchParams.get('status');

    const where: any = {};

    if (!showArchived) {
      where.status = { not: 'archiviert' };
    }

    if (status && status !== 'all') {
      where.status = status;
    }

    const items = await prisma.procurementItem.findMany({
      where,
      include: {
        creator: {
          select: { id: true, name: true, email: true }
        }
      },
      orderBy: [
        { status: 'asc' },
        { createdAt: 'desc' }
      ]
    });

    return NextResponse.json(items);
  } catch (error) {
    console.error('GET /api/procurement error:', error);
    return NextResponse.json({ error: 'Server-Fehler' }, { status: 500 });
  }
}

// POST /api/procurement - Neues Procurement Item erstellen
export async function POST(request: NextRequest) {
  try {
    console.log('🚀 POST /api/procurement - Start');

    const session = await auth();
    console.log('👤 Session:', session?.user ? { id: session.user.id, email: session.user.email, role: session.user.role } : 'No session');

    if (!session?.user) {
      console.log('❌ No session - returning 401');
      return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
    }

    const body = await request.json();
    console.log('📦 Request body:', body);

    const validation = CreateProcurementItemSchema.safeParse(body);
    console.log('✅ Validation result:', validation.success ? 'Success' : validation.error.issues);

    if (!validation.success) {
      console.log('❌ Validation failed:', validation.error.issues);
      return NextResponse.json(
        { error: 'Ungültige Daten', issues: validation.error.issues },
        { status: 400 }
      );
    }

    const data = validation.data;

    // Resolve creator to avoid FK violations
    let createdBy: string | null = null;
    try {
      const byId = session.user?.id
        ? await prisma.user.findUnique({ where: { id: session.user.id } })
        : null;
      if (byId) {
        createdBy = byId.id;
      } else if (session.user?.email) {
        const byEmail = await prisma.user.findUnique({ where: { email: session.user.email } });
        createdBy = byEmail?.id ?? null;
      }
    } catch (e) {
      // Ignore lookup errors, we'll just omit createdBy
      createdBy = null;
    }

    console.log('💾 Creating item with data:', { ...data, unit: 'Stk', createdBy });

    const item = await prisma.procurementItem.create({
      data: {
        ...data,
        unit: 'Stk', // Immer Stück
        createdBy,
        link: (data as any).link ?? undefined,
      },
      include: {
        creator: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    console.log('✅ Item created successfully:', item.id);
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    console.error('❌ POST /api/procurement error:', error);
    return NextResponse.json({
      error: 'Server-Fehler',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

// PATCH /api/procurement - Procurement Item aktualisieren
export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
    }

    const body = await request.json();
    const validation = UpdateProcurementItemSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Ungültige Daten', issues: validation.error.issues },
        { status: 400 }
      );
    }

    const { id, ...updateData } = validation.data;

    // Prüfe ob Item existiert
    const existingItem = await prisma.procurementItem.findUnique({
      where: { id }
    });

    if (!existingItem) {
      return NextResponse.json({ error: 'Item nicht gefunden' }, { status: 404 });
    }

    // Nur Admin kann Status ändern oder Items archivieren
    if (updateData.status && session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Keine Berechtigung für Status-Änderung' }, { status: 403 });
    }

    // Wenn archiviert wird, setze archivedAt
    const finalUpdateData: any = { ...updateData };
    if (updateData.status === 'archiviert' && existingItem.status !== 'archiviert') {
      finalUpdateData.archivedAt = new Date();
    } else if (updateData.status !== 'archiviert' && existingItem.status === 'archiviert') {
      finalUpdateData.archivedAt = null;
    }

    const item = await prisma.procurementItem.update({
      where: { id },
      data: finalUpdateData,
      include: {
        creator: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    return NextResponse.json(item);
  } catch (error) {
    console.error('PATCH /api/procurement error:', error);
    return NextResponse.json({ error: 'Server-Fehler' }, { status: 500 });
  }
}

// DELETE /api/procurement - Procurement Item löschen
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Admin-Berechtigung erforderlich' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID erforderlich' }, { status: 400 });
    }

    await prisma.procurementItem.delete({
      where: { id }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/procurement error:', error);
    return NextResponse.json({ error: 'Server-Fehler' }, { status: 500 });
  }
}
