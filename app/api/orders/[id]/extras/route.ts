import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';

const createSchema = z.object({ label: z.string().min(1), amountCents: z.number().int().positive() });

interface RouteParams { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const extras = await prisma.orderExtra.findMany({ where: { orderId: id }, orderBy: { createdAt: 'desc' } });
  return NextResponse.json(extras);
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const body = await req.json();
    const parsed = createSchema.parse(body);
    const { id } = await params;
    const extra = await prisma.orderExtra.create({ data: { ...parsed, orderId: id } });
    return NextResponse.json(extra, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid data', details: error.issues }, { status: 400 });
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  await prisma.orderExtra.delete({ where: { id } });
  return NextResponse.json({ success: true });
}


