import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { replyToMail } from '@/lib/mail/actions';
import { touchOrderActivity } from '@/lib/order-activity';
import { parseGermanAddress } from '@/lib/shipping/parseAddress';
import { getDhlConfig, isDhlConfigComplete, createReturnLabel } from '@/lib/shipping/dhl';

interface RouteParams { params: Promise<{ id: string }> }

const requestSchema = z.object({
	name: z.string().min(1),
	street: z.string().min(1),
	houseNumber: z.string().min(1),
	postalCode: z.string().min(1),
	city: z.string().min(1),
	country: z.string().min(2).default('DE'),
	weightInGrams: z.number().int().positive().optional(),
});

export async function GET(_req: NextRequest, { params }: RouteParams) {
	try {
		const session = await auth();
		if (!session?.user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const { id } = await params;
		const order = await prisma.order.findUnique({
			where: { id },
			select: {
				returnLabelTrackingNumber: true,
				returnLabelCreatedAt: true,
				customer: {
					select: { name: true, addressLine1: true, postalCode: true, city: true, country: true, email: true, phone: true },
				},
			},
		});
		if (!order) {
			return NextResponse.json({ error: 'Auftrag nicht gefunden' }, { status: 404 });
		}

		const parsed = parseGermanAddress(order.customer.addressLine1);

		return NextResponse.json({
			customer: {
				name: order.customer.name,
				street: parsed.street,
				houseNumber: parsed.houseNumber,
				postalCode: order.customer.postalCode || '',
				city: order.customer.city || '',
				country: order.customer.country || 'DE',
				email: order.customer.email,
				phone: order.customer.phone,
			},
			existingTracking: order.returnLabelTrackingNumber,
			existingCreatedAt: order.returnLabelCreatedAt,
		});
	} catch (error) {
		console.error('Error loading return-label prefill:', error);
		return NextResponse.json({ error: 'Fehler beim Laden der Adresse' }, { status: 500 });
	}
}

export async function POST(req: NextRequest, { params }: RouteParams) {
	try {
		const session = await auth();
		if (!session?.user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const { id } = await params;
		const body = await req.json();
		const data = requestSchema.parse(body);

		const order = await prisma.order.findUnique({
			where: { id },
			include: { customer: true },
		});
		if (!order) {
			return NextResponse.json({ error: 'Auftrag nicht gefunden' }, { status: 404 });
		}

		const dhlConfig = await getDhlConfig();
		if (!isDhlConfigComplete(dhlConfig)) {
			return NextResponse.json(
				{ error: 'DHL-Zugangsdaten fehlen — bitte in den Einstellungen hinterlegen' },
				{ status: 400 }
			);
		}

		let labelResult;
		try {
			labelResult = await createReturnLabel(dhlConfig, {
				customer: {
					name: data.name,
					street: data.street,
					houseNumber: data.houseNumber,
					postalCode: data.postalCode,
					city: data.city,
					country: data.country,
					email: order.customer.email || undefined,
					phone: order.customer.phone || undefined,
				},
				weightInGrams: data.weightInGrams ?? 500,
			});
		} catch (dhlError) {
			console.error('DHL label creation failed:', dhlError);
			return NextResponse.json(
				{ error: dhlError instanceof Error ? dhlError.message : 'DHL-Label konnte nicht erstellt werden' },
				{ status: 502 }
			);
		}

		const pdfBuffer = Buffer.from(labelResult.labelPdfBase64, 'base64');

		let emailSent = false;
		let emailWarning: string | undefined;
		if (order.customer.email) {
			const account = await prisma.mailAccount.findFirst({ where: { isDefault: true } })
				?? await prisma.mailAccount.findFirst({ where: { isActive: true } });
			if (account) {
				try {
					await replyToMail({
						accountId: account.id,
						senderId: session.user.id,
						orderId: order.id,
						customerId: order.customerId,
						to: [order.customer.email],
						subject: `Rücksende-Label für deinen Auftrag ${order.title}`,
						html: `Hallo ${order.customer.name},<br><br>anbei findest du das Rücksende-Label für deinen Auftrag. Bitte das Original-Teil damit an uns zurückschicken.<br><br>Viele Grüße`,
						text: `Hallo ${order.customer.name},\n\nanbei findest du das Rücksende-Label für deinen Auftrag. Bitte das Original-Teil damit an uns zurückschicken.\n\nViele Grüße`,
						attachments: [{ filename: 'retourenlabel.pdf', content: pdfBuffer, contentType: 'application/pdf' }],
					});
					emailSent = true;
				} catch (mailError) {
					console.error('Failed to email return label:', mailError);
					emailWarning = 'Label wurde erstellt, Mailversand ist aber fehlgeschlagen';
				}
			} else {
				emailWarning = 'Label wurde erstellt, es ist aber kein aktiver Mail-Account konfiguriert';
			}
		} else {
			emailWarning = 'Label wurde erstellt, dem Kunden ist aber keine E-Mail-Adresse hinterlegt';
		}

		await prisma.order.update({
			where: { id: order.id },
			data: {
				returnLabelTrackingNumber: labelResult.trackingNumber,
				returnLabelCreatedAt: new Date(),
			},
		});
		await touchOrderActivity(order.id);

		return NextResponse.json({
			trackingNumber: labelResult.trackingNumber,
			emailSent,
			emailWarning,
			orderId: order.id,
		});
	} catch (error) {
		if (error instanceof z.ZodError) {
			return NextResponse.json({ error: 'Ungültige Adressdaten', details: error.issues }, { status: 400 });
		}
		console.error('Error creating return label:', error);
		return NextResponse.json({ error: 'Fehler beim Erstellen des Labels' }, { status: 500 });
	}
}
