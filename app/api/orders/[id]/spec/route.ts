import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getPresetForOrderType, getCategoriesForOrderType, getFieldsForCategory } from '@/lib/order-presets';

interface RouteParams {
  params: { id: string };
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = params;
    const specs = await prisma.orderSpecKV.findMany({
      where: { orderId: id },
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
    const { id } = params;

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

    // Upsert specs
    const updates = await Promise.all(
      Object.entries(candidate).map(async ([key, value]) => {
        const existingSpec = await prisma.orderSpecKV.findFirst({
          where: { orderId: id, key },
        });
        if (existingSpec) {
          return prisma.orderSpecKV.update({
            where: { id: existingSpec.id },
            data: { value: value as string },
          });
        }
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
