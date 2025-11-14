import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getPresetForOrderType, getCategoriesForOrderType, getFieldsForCategory } from '@/lib/order-presets';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const allSpecs = await prisma.orderSpecKV.findMany({
      where: { orderId: id },
      orderBy: { key: 'asc' },
    });

    // Entferne Duplikate: behalte den "besten" Wert pro Key
    // Strategie: längerer Wert bevorzugt (vollständiger), sonst neuerer (spätere CUID)
    const uniqueSpecsMap = new Map<string, typeof allSpecs[0]>();
    for (const spec of allSpecs) {
      const existing = uniqueSpecsMap.get(spec.key);
      if (!existing) {
        uniqueSpecsMap.set(spec.key, spec);
      } else {
        // Bevorzuge längeren Wert (vollständiger), sonst neueren (spätere CUID)
        const existingLength = existing.value.length;
        const currentLength = spec.value.length;
        if (currentLength > existingLength) {
          uniqueSpecsMap.set(spec.key, spec);
        } else if (currentLength === existingLength && spec.id > existing.id) {
          // Gleiche Länge: neuerer Eintrag (spätere CUID)
          uniqueSpecsMap.set(spec.key, spec);
        }
      }
    }

    return NextResponse.json(Array.from(uniqueSpecsMap.values()));
  } catch (error) {
    console.error('Error fetching specs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch specs' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    // Robust body parsing
    let body: unknown;
    try {
      body = await request.json();
    } catch (e) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    // Accept only string values
    const candidate = Object.fromEntries(
      Object.entries(body as Record<string, unknown>)
        .filter(([, v]) => typeof v === 'string') as [string, string][]
    );

    // Fetch order type
    const order = await prisma.order.findUnique({ where: { id }, select: { type: true } });
    if (!order) {
      return NextResponse.json({ error: 'Order nicht gefunden' }, { status: 404 });
    }

    // Compute allowed and required keys
    const categories = getCategoriesForOrderType(order.type as any);
    const allowedKeys = new Set<string>();
    for (const cat of categories) {
      getFieldsForCategory(order.type as any, cat).forEach((k) => allowedKeys.add(k));
    }
    const preset = getPresetForOrderType(order.type as any);
    const requiredKeys = new Set<string>(
      categories.flatMap((cat) => preset.required?.[cat] ?? [])
    );

    // Validate incoming fields
    for (const [key, value] of Object.entries(candidate)) {
      if (!allowedKeys.has(key)) {
        return NextResponse.json({ error: `Ungültiges Feld: ${key}` }, { status: 400 });
      }
      if (requiredKeys.has(key) && !String(value).trim()) {
        return NextResponse.json({ error: `Pflichtfeld leer: ${key}` }, { status: 400 });
      }
    }

    // Upsert specs - entferne Duplikate für jeden Key, bevor der neue Wert gespeichert wird
    const updates = await Promise.all(
      Object.entries(candidate).map(async ([key, value]) => {
        // Finde alle Duplikate für diesen Key
        const duplicates = await prisma.orderSpecKV.findMany({
          where: { orderId: id, key },
        });
        
        if (duplicates.length > 0) {
          // Lösche alle Duplikate für diesen Key
          await prisma.orderSpecKV.deleteMany({
            where: { orderId: id, key },
          });
        }
        
        // Erstelle einen neuen Eintrag mit dem neuen Wert
        return prisma.orderSpecKV.create({
          data: {
            orderId: id,
            key,
            value: value as string,
          },
        });
      })
    );

    return NextResponse.json(updates);
  } catch (error) {
    console.error('Error updating specs:', error);
    return NextResponse.json(
      { error: 'Failed to update specs' },
      { status: 500 }
    );
  }
}
