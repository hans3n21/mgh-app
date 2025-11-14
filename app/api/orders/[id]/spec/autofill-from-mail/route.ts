import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { buildSuggestions } from '@/lib/mail/buildSuggestions';
import { getCategoriesForOrderType, getFieldsForCategory } from '@/lib/order-presets';

const BodySchema = z.object({
	mailId: z.string().min(1),
	strategy: z.enum(['emptyOnly', 'overwrite']).default('emptyOnly'),
	extra: z.record(z.string(), z.any()).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	try {
		const { id: orderId } = await params;
		console.log('🔄 autofill-from-mail: Starting for orderId:', orderId);
		
		const bodyRaw = await req.json().catch(() => ({}));
		const body = BodySchema.parse(bodyRaw);
		console.log('📝 autofill-from-mail: Parsed body:', body);

		const order = await prisma.order.findUnique({ where: { id: orderId }, select: { id: true, type: true } });
		if (!order) {
			console.log('❌ autofill-from-mail: Order not found:', orderId);
			return NextResponse.json({ error: 'Order not found' }, { status: 404 });
		}
		console.log('📋 autofill-from-mail: Found order:', order);

		const mail = await prisma.mail.findUnique({ where: { id: body.mailId }, select: { id: true, subject: true, date: true, parsedData: true } });
		if (!mail) {
			console.log('❌ autofill-from-mail: Mail not found:', body.mailId);
			return NextResponse.json({ error: 'Mail not found' }, { status: 404 });
		}
		console.log('📧 autofill-from-mail: Found mail:', { id: mail.id, subject: mail.subject, date: mail.date, parsedDataKeys: Object.keys(mail.parsedData as any || {}) });

		// aktuelles KV laden - entferne Duplikate: behalte den "besten" Wert pro Key
		const existing = await prisma.orderSpecKV.findMany({ where: { orderId }, select: { key: true, value: true, id: true } });
		const uniqueSpecsMap = new Map<string, typeof existing[0]>();
		for (const spec of existing) {
			const existingSpec = uniqueSpecsMap.get(spec.key);
			if (!existingSpec) {
				uniqueSpecsMap.set(spec.key, spec);
			} else {
				const existingLength = existingSpec.value.length;
				const currentLength = spec.value.length;
				if (currentLength > existingLength) {
					uniqueSpecsMap.set(spec.key, spec);
				} else if (currentLength === existingLength && spec.id > existingSpec.id) {
					uniqueSpecsMap.set(spec.key, spec);
				}
			}
		}
		const kv: Record<string, string> = Object.fromEntries(Array.from(uniqueSpecsMap.values()).map((e) => [e.key, e.value]));
		console.log('💾 autofill-from-mail: Existing KV pairs:', Object.keys(kv).length);

		const suggestions = buildSuggestions({ id: mail.id, subject: mail.subject, date: mail.date, parsedData: mail.parsedData as any }, order.type);
		console.log('💡 autofill-from-mail: Generated suggestions:', suggestions.length, suggestions);
		
		const updates: Record<string, string> = {};
		for (const s of suggestions) {
			const current = kv[s.field];
			if (body.strategy === 'overwrite' || current == null || String(current).trim() === '') {
				updates[s.field] = String(s.value);
			}
		}
		console.log('🔄 autofill-from-mail: Updates from suggestions:', updates);

		// extra aus Body hinzufügen
		if (body.extra && typeof body.extra === 'object') {
			for (const [k, v] of Object.entries(body.extra)) {
				if (typeof v === 'string') updates[k] = v;
			}
		}
		console.log('➕ autofill-from-mail: Final updates with extras:', updates);

		// nur erlaubte Keys pro OrderType durchlassen
		const categories = getCategoriesForOrderType(order.type as any);
		const allowed = new Set<string>();
		for (const cat of categories) getFieldsForCategory(order.type as any, cat).forEach((k) => allowed.add(k));
		console.log('✅ autofill-from-mail: Allowed fields:', Array.from(allowed));
 
 		const filteredEntries = Object.entries(updates).filter(([k]) => allowed.has(k));
		console.log('🎯 autofill-from-mail: Filtered entries to save:', filteredEntries);

 		await Promise.all(
 			filteredEntries.map(async ([key, value]) => {
 				const existingSpec = await prisma.orderSpecKV.findFirst({ where: { orderId, key } });
 				if (existingSpec) {
					console.log(`🔄 Updating spec ${key}: "${existingSpec.value}" → "${value}"`);
 					await prisma.orderSpecKV.update({ where: { id: existingSpec.id }, data: { value: value as string } });
 				} else {
					console.log(`➕ Creating spec ${key}: "${value}"`);
 					await prisma.orderSpecKV.create({ data: { orderId, key, value: value as string } });
 				}
 			})
 		);

		console.log('✅ autofill-from-mail: Successfully completed');
 		return NextResponse.json({ ok: true });
 	} catch (err) {
 		if (err instanceof z.ZodError) {
			console.error('❌ autofill-from-mail: Validation error:', err.issues);
			return NextResponse.json({ error: 'Invalid body', details: err.issues }, { status: 400 });
		}
		console.error('❌ autofill-from-mail error:', err);
 		return NextResponse.json({ error: 'Server error' }, { status: 500 });
 	}
}


