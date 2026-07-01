import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';

interface RouteParams { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const suggestions = await prisma.orderFieldSuggestion.findMany({
      where: { orderId: id },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(suggestions);
  } catch (error) {
    console.error('Error fetching suggestions:', error);
    return NextResponse.json({ error: 'Failed to fetch suggestions' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    if (!body.field || !body.value) {
      return NextResponse.json({ error: 'field and value required' }, { status: 400 });
    }

    const existing = await prisma.orderFieldSuggestion.findFirst({
      where: { orderId: id, field: body.field, value: body.value, status: 'suggested' },
    });
    if (existing) {
      return NextResponse.json(existing);
    }

    const suggestion = await prisma.orderFieldSuggestion.create({
      data: {
        orderId: id,
        field: body.field,
        value: body.value,
        mailId: body.mailId || null,
        status: 'suggested',
      },
    });

    return NextResponse.json(suggestion, { status: 201 });
  } catch (error) {
    console.error('Error creating suggestion:', error);
    return NextResponse.json({ error: 'Failed to create suggestion' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: orderId } = await params;
    const body = await request.json();

    if (!body.suggestionId || !body.action) {
      return NextResponse.json({ error: 'suggestionId and action required' }, { status: 400 });
    }

    const suggestion = await prisma.orderFieldSuggestion.findFirst({
      where: { id: body.suggestionId, orderId },
    });

    if (!suggestion) {
      return NextResponse.json({ error: 'Suggestion not found' }, { status: 404 });
    }

    if (body.action === 'accept') {
      const field = suggestion.field;
      const value = suggestion.value;

      if (field.startsWith('customer.')) {
        const order = await prisma.order.findUnique({ where: { id: orderId }, select: { customerId: true } });
        if (order?.customerId) {
          const customerField = field.replace('customer.', '') as keyof {
            name: string; email: string; phone: string;
            addressLine1: string; postalCode: string; city: string; country: string;
          };
          await prisma.customer.update({
            where: { id: order.customerId },
            data: { [customerField]: value },
          });
        }
      } else if (field.startsWith('order.')) {
        const orderField = field.replace('order.', '');
        const existingSpec = await prisma.orderSpecKV.findFirst({
          where: { orderId, key: orderField },
        });
        if (existingSpec) {
          await prisma.orderSpecKV.update({ where: { id: existingSpec.id }, data: { value } });
        } else {
          await prisma.orderSpecKV.create({ data: { orderId, key: orderField, value } });
        }
      }

      await prisma.orderFieldSuggestion.update({
        where: { id: body.suggestionId },
        data: {
          status: 'accepted',
          acceptedBy: (session.user as { id?: string }).id || null,
          acceptedAt: new Date(),
        },
      });
    } else if (body.action === 'reject') {
      await prisma.orderFieldSuggestion.update({
        where: { id: body.suggestionId },
        data: { status: 'rejected' },
      });
    }

    const updated = await prisma.orderFieldSuggestion.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating suggestion:', error);
    return NextResponse.json({ error: 'Failed to update suggestion' }, { status: 500 });
  }
}
