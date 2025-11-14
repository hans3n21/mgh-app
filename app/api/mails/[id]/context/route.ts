import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { suggestOrderTypes } from '@/lib/mail/suggestOrderType';
import { buildSuggestions } from '@/lib/mail/buildSuggestions';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const mail = await prisma.mail.findUnique({
    where: { id },
    include: { attachments: true },
  });
  if (!mail) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Kunde anhand Mailadresse bestimmen
  let customerId: string | null = null;
  if (mail.fromEmail) {
    const customer = await prisma.customer.findFirst({ where: { email: mail.fromEmail } });
    if (customer) customerId = customer.id;
  }

  // Offene Aufträge dieses Kunden
  let candidates: Array<{ id: string; title: string; status: string; createdAt: Date }>;
  if (customerId) {
    candidates = await prisma.order.findMany({
      where: { customerId, status: { not: 'complete' } },
      select: { id: true, title: true, status: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  } else {
    candidates = [];
  }

  const defaultOrderId = candidates[0]?.id || null;
  const suggestedOrderTypes = suggestOrderTypes({
    subject: mail.subject,
    text: mail.text as any,
    html: mail.html as any,
    parsedData: mail.parsedData as any,
    attachments: mail.attachments.map(a => ({ filename: a.filename, mimeType: a.mimeType }))
  });

  const topType = suggestedOrderTypes[0]?.key;
  const specSuggestions = buildSuggestions({ id: mail.id, subject: mail.subject, date: mail.date, parsedData: mail.parsedData as any }, topType);

  // Parsed Contact Daten (für Reply/Anlage)
  const parsed = (mail.parsedData as any) || {};
  const parsedContact = {
    name: (parsed.name as string | undefined) ?? (mail.fromName || undefined),
    email: (parsed.email as string | undefined) ?? (mail.fromEmail || undefined),
    phone: (parsed.phone as string | undefined) ?? undefined,
    address: (parsed.address as string | undefined) ?? undefined,
  };

  return NextResponse.json({
    mail: { id: mail.id, subject: mail.subject, date: mail.date, fromEmail: mail.fromEmail, fromName: mail.fromName },
    defaultOrderId,
    orderCandidates: candidates,
    suggestedOrderTypes,
    specSuggestions,
    parsedContact,
  });
}


