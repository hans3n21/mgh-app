import { z } from 'zod';
import type { ParsedData, InstrumentType } from './parseMail';

export type DatasheetType = InstrumentType;

export type NormalizedDatasheet = {
	type: DatasheetType;
	fields: Record<string, unknown>;
};

const datasheetSchema = z.object({
	type: z.enum(['guitar', 'bass', 'pickup', 'pickguard', 'neck', 'body', 'laser', 'repair']),
	fields: z.record(z.string(), z.any()),
});

const DEFAULT_TYPE_ORDER: DatasheetType[] = [
	'guitar',
	'neck',
	'body',
	'pickup',
	'pickguard',
	'bass',
	'laser',
	'repair',
];

export function mapToDatasheet(parsed: ParsedData): NormalizedDatasheet | null {
	// Decide type: prefer explicit instrumentType; else infer by presence of model/color typical of guitar
	let type: DatasheetType | undefined = parsed.instrumentType;
	if (!type) {
		if (parsed.model || parsed.color || parsed.quantity) {
			type = 'guitar';
		}
	}
	if (!type) type = DEFAULT_TYPE_ORDER[0];

	const baseFields: Record<string, unknown> = {};

	if (parsed.name) baseFields['customer_name'] = parsed.name;
	if (parsed.email) baseFields['customer_email'] = parsed.email;
	if (parsed.phone) baseFields['customer_phone'] = parsed.phone;
	if (parsed.address) baseFields['customer_address'] = parsed.address;
	if (parsed.orderNumber) baseFields['related_order_number'] = parsed.orderNumber;

	// Type-specific suggestions
	switch (type) {
		case 'guitar':
			if (parsed.model) baseFields['guitar_model'] = parsed.model;
			if (parsed.color) baseFields['finish_color'] = parsed.color;
			if (parsed.quantity) baseFields['quantity'] = parsed.quantity;
			break;
		case 'neck':
			if (parsed.model) baseFields['neck_profile'] = parsed.model;
			break;
		case 'body':
			if (parsed.color) baseFields['body_color'] = parsed.color;
			break;
		case 'pickup':
			if (parsed.model) baseFields['pickup_model'] = parsed.model;
			if (parsed.color) baseFields['cover_color'] = parsed.color;
			if (parsed.quantity) baseFields['quantity'] = parsed.quantity;
			break;
		case 'pickguard':
			if (parsed.model) baseFields['pickguard_model'] = parsed.model;
			if (parsed.color) baseFields['pickguard_color'] = parsed.color;
			if (parsed.quantity) baseFields['quantity'] = parsed.quantity;
			break;
		case 'laser':
			if (parsed.model) baseFields['engraving_motif'] = parsed.model;
			break;
		case 'repair':
			baseFields['issue_description'] = parsed.notes || parsed.model || '';
			break;
		case 'bass':
			if (parsed.model) baseFields['bass_model'] = parsed.model;
			if (parsed.color) baseFields['finish_color'] = parsed.color;
			if (parsed.quantity) baseFields['quantity'] = parsed.quantity;
			break;
	}

	if (parsed.notes) baseFields['notes'] = parsed.notes;

	const result = { type, fields: baseFields };
	const safe = datasheetSchema.safeParse(result);
	if (safe.success) return safe.data;
	return result; // Fallback: return unvalidated object; caller can handle
}

export default mapToDatasheet;


