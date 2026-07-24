import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getPresetForOrderType, getCategoriesForOrderType, getFieldsForCategory } from '@/lib/order-presets';
import { touchOrderActivity } from '@/lib/order-activity';

const KEY_ALIASES: Record<string, string> = {
  korpus_finish: 'body_surface_treatment',
  body_finish: 'body_surface_treatment',
  body_ginish: 'body_surface_treatment',
  body_finish_type: 'body_surface_treatment',
  has_top: 'body_has_top',
  top_enabled: 'body_has_top',
  decke: 'body_has_top',
};

function normalizeIncomingSpecs(input: Record<string, string>, hasTop: boolean): Record<string, string> {
  const out: Record<string, string> = {};

  for (const [rawKey, rawValue] of Object.entries(input)) {
    const key = KEY_ALIASES[rawKey] ?? rawKey;
    const value = String(rawValue ?? '');
    const existing = out[key] ?? '';
    // Bei Doppelwerten längeren/nicht-leeren Wert bevorzugen.
    out[key] = value.trim().length >= existing.trim().length ? value : existing;
  }

  // Mit Top ist das Finish in Top/Korpus aufgeteilt: Gesamt-Finish nicht mehr synchronisieren.
  if (!hasTop) {
    // Body Finish und Korpus-Finish als semantisch gleich behandeln:
    // wenn einer fehlt, den vorhandenen übernehmen.
    const finishBody = (out.finish_body ?? '').trim();
    const bodyFinish = (out.body_surface_treatment ?? '').trim();
    if (finishBody && !bodyFinish) out.body_surface_treatment = out.finish_body;
    if (bodyFinish && !finishBody) out.finish_body = out.body_surface_treatment;
  }

  return out;
}

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
    const rawCandidate = Object.fromEntries(
      Object.entries(body as Record<string, unknown>)
        .filter(([, v]) => typeof v === 'string') as [string, string][]
    );

    // Fetch order type
    const order = await prisma.order.findUnique({ where: { id }, select: { type: true } });
    if (!order) {
      return NextResponse.json({ error: 'Order nicht gefunden' }, { status: 404 });
    }

    // Top-Status ermitteln (aus dieser Anfrage oder dem gespeicherten Stand),
    // um zu entscheiden, ob das Gesamt-Finish noch synchronisiert werden soll.
    const existingTopSpecs = await prisma.orderSpecKV.findMany({
      where: { orderId: id, key: { in: ['body_has_top', 'body_top'] } },
      select: { key: true, value: true },
    });
    const isTruthy = (v?: string) => ['ja', 'true', '1', 'yes'].includes((v || '').trim().toLowerCase());
    const hasTopValue = (key: string) =>
      key in rawCandidate ? rawCandidate[key] : existingTopSpecs.find((s) => s.key === key)?.value;
    const hasTop = isTruthy(hasTopValue('body_has_top')) || Boolean((hasTopValue('body_top') || '').trim());
    const candidate = normalizeIncomingSpecs(rawCandidate, hasTop);

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

    await touchOrderActivity(id);
    return NextResponse.json(updates);
  } catch (error) {
    console.error('Error updating specs:', error);
    return NextResponse.json(
      { error: 'Failed to update specs' },
      { status: 500 }
    );
  }
}
