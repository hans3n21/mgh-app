import { NextRequest, NextResponse } from 'next/server';
import {
  PDFDocument,
  PDFTextField,
  PDFDropdown,
  PDFCheckBox,
  PDFRadioGroup,
  PDFOptionList,
  type PDFField,
} from 'pdf-lib';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { getCategoriesForOrderType, getFieldsForCategory } from '@/lib/order-presets';

interface RouteParams { params: Promise<{ id: string }> }

const CUSTOMER_FIELDS = new Set(['name', 'email', 'phone', 'addressLine1', 'postalCode', 'city', 'country']);

// POST /api/orders/[id]/datasheet/import  (multipart: file = ausgefuelltes PDF)
// Liest die AcroForm-Felder aus und legt sie als OrderFieldSuggestions an —
// nichts wird direkt uebernommen, alles laeuft ueber den Bestaetigen-Workflow.
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: orderId } = await params;
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { customer: true, specs: true },
    });
    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const formData = await req.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file required' }, { status: 400 });
    }

    let doc: PDFDocument;
    try {
      doc = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
    } catch {
      return NextResponse.json({ error: 'Datei konnte nicht als PDF gelesen werden' }, { status: 400 });
    }

    let fields: PDFField[];
    try {
      fields = doc.getForm().getFields();
    } catch {
      fields = [];
    }
    if (fields.length === 0) {
      return NextResponse.json({ error: 'PDF enthaelt keine Formularfelder' }, { status: 400 });
    }

    // Erlaubte Spec-Keys fuer diesen Auftragstyp
    const allowedSpecKeys = new Set<string>();
    for (const cat of getCategoriesForOrderType(order.type)) {
      getFieldsForCategory(order.type, cat).forEach((k) => allowedSpecKeys.add(k));
    }

    // Aktuelle Werte, um Unveraendertes zu ueberspringen
    const currentSpecs = new Map<string, string>();
    for (const s of order.specs) {
      const prev = currentSpecs.get(s.key);
      if (!prev || s.value.length > prev.length) currentSpecs.set(s.key, s.value);
    }
    const currentCustomer: Record<string, string | null> = order.customer
      ? {
          name: order.customer.name,
          email: order.customer.email,
          phone: order.customer.phone,
          addressLine1: order.customer.addressLine1,
          postalCode: order.customer.postalCode,
          city: order.customer.city,
          country: order.customer.country,
        }
      : {};

    let created = 0;
    let unchanged = 0;
    let ignored = 0;

    for (const field of fields) {
      const name = field.getName();

      let value = '';
      if (field instanceof PDFTextField) {
        value = field.getText() || '';
      } else if (field instanceof PDFDropdown) {
        value = field.getSelected().join(', ');
      } else if (field instanceof PDFOptionList) {
        value = field.getSelected().join(', ');
      } else if (field instanceof PDFRadioGroup) {
        value = field.getSelected() || '';
      } else if (field instanceof PDFCheckBox) {
        value = field.isChecked() ? 'Ja' : '';
      }
      value = value.trim();
      if (!value) continue;

      let currentValue: string | null | undefined;
      if (name.startsWith('order.')) {
        const key = name.slice('order.'.length);
        if (!allowedSpecKeys.has(key)) { ignored++; continue; }
        currentValue = currentSpecs.get(key);
      } else if (name.startsWith('customer.')) {
        const key = name.slice('customer.'.length);
        if (!CUSTOMER_FIELDS.has(key)) { ignored++; continue; }
        currentValue = currentCustomer[key];
      } else {
        ignored++;
        continue;
      }

      if (currentValue != null && currentValue.trim() === value) {
        unchanged++;
        continue;
      }

      const existing = await prisma.orderFieldSuggestion.findFirst({
        where: { orderId, field: name, value, status: 'suggested' },
      });
      if (existing) {
        unchanged++;
        continue;
      }

      await prisma.orderFieldSuggestion.create({
        data: { orderId, field: name, value, status: 'suggested' },
      });
      created++;
    }

    return NextResponse.json({ ok: true, created, unchanged, ignored });
  } catch (error) {
    console.error('Error importing datasheet PDF:', error);
    return NextResponse.json({ error: 'Failed to import datasheet' }, { status: 500 });
  }
}
