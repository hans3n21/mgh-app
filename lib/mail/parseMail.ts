import { z } from 'zod';

export type InstrumentType =
	| 'guitar'
	| 'bass'
	| 'pickup'
	| 'pickguard'
	| 'neck'
	| 'body'
	| 'laser'
	| 'repair';

export type ParsedData = {
	name?: string;
	email?: string;
	phone?: string;
	address?: string;
	instrumentType?: InstrumentType;
	model?: string;
	color?: string;
	quantity?: number;
	orderNumber?: string; // e.g. ORD-2025-1234
	notes?: string;
};

const parsedDataSchema = z.object({
	name: z.string().min(1).optional(),
	email: z
		.string()
		.email()
		.optional(),
	phone: z.string().min(5).optional(),
	address: z.string().min(5).optional(),
	instrumentType: z
		.enum(['guitar', 'bass', 'pickup', 'pickguard', 'neck', 'body', 'laser', 'repair'])
		.optional(),
	model: z.string().min(1).optional(),
	color: z.string().min(1).optional(),
	quantity: z.number().int().positive().optional(),
	orderNumber: z
		.string()
		.regex(/^ORD-\d{4}-\d{3,6}$/)
		.optional(),
	notes: z.string().optional(),
});

const EMAIL_REGEX = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const ORDER_NO_REGEX = /\bORD-\d{4}-\d{3,6}\b/;
const PHONE_REGEX = /(?:(?:\+\d{1,3}[\s-]?)?(?:\(\d{1,4}\)[\s-]?)?\d(?:[\s-]?\d){6,})/; // tolerant, intl/de
const STREET_REGEX = /\b([a-zA-ZäöüÄÖÜß .'-]+(?:straße|strasse|weg|platz|allee|gasse|road|street|ave|avenue|lane|blvd)\s*\d+[a-zA-Z]?)\b/i;
const ZIP_CITY_REGEX = /\b\d{5}\b\s+([a-zA-ZäöüÄÖÜß .'-]+)/; // DE 5-digit zip + city

const LABELS = {
	name: [/^name\s*:/i],
	email: [/^(e-?mail|mail)\s*:/i],
	phone: [/^(telefon|tel\.?|phone)\s*:/i],
	address: [/^(adresse|anschrift|address)\s*:/i],
	instrument: [/^(instrument|auftragstyp|type)\s*:/i],
	model: [/^(modell|model)\s*:/i],
	color: [/^(farbe|color)\s*:/i],
	quantity: [/^(menge|anzahl|quantity|qty)\s*:/i],
	orderNumber: [/^(bestellnr\.?|bestellnummer|auftragsnummer|order(\s*no\.?|\s*number)?)\s*:/i],
};

const KEYWORDS_TO_TYPE: Array<{ re: RegExp; type: InstrumentType }> = [
	{ re: /\b(neck|hals)\b/i, type: 'neck' },
	{ re: /\b(body|korpus)\b/i, type: 'body' },
	{ re: /\b(pickup|pickup[s]?|humbucker|single\s*coil)\b/i, type: 'pickup' },
	{ re: /\b(pickguard|schlagbrett)\b/i, type: 'pickguard' },
	{ re: /\b(laser|gravur|engrave|engraving)\b/i, type: 'laser' },
	{ re: /\b(bass)\b/i, type: 'bass' },
	{ re: /\b(gitarre|guitar|tele|strat|les\s*paul|sg)\b/i, type: 'guitar' },
	{ re: /\b(repair|reparatur|service)\b/i, type: 'repair' },
];

function normalize(text: string | undefined | null): string {
	return (text || '').replace(/\r\n?/g, '\n').trim();
}

function extractLabel(line: string, patterns: RegExp[]): string | null {
	for (const p of patterns) {
		const m = line.match(p);
		if (m) {
			const value = line.slice(m[0].length).trim();
			return value || null;
		}
	}
	return null;
}

function parseContactForm(text: string): Partial<ParsedData> {
	const result: Partial<ParsedData> = {};
	const lines = text.split('\n').map((l) => l.trim());
	for (const rawLine of lines) {
		const line = rawLine.replace(/\t+/g, ' ').trim();
		if (!line.includes(':')) continue;

		const name = extractLabel(line, LABELS.name);
		if (name) result.name = name;

		const email = extractLabel(line, LABELS.email);
		if (email) result.email = email;

		const phone = extractLabel(line, LABELS.phone);
		if (phone) result.phone = phone;

		const address = extractLabel(line, LABELS.address);
		if (address) result.address = address;

		const instrument = extractLabel(line, LABELS.instrument);
		if (instrument) {
			for (const { re, type } of KEYWORDS_TO_TYPE) {
				if (re.test(instrument)) {
					result.instrumentType = type;
					break;
				}
			}
		}

		const model = extractLabel(line, LABELS.model);
		if (model) result.model = model;

		const color = extractLabel(line, LABELS.color);
		if (color) result.color = color;

		const qty = extractLabel(line, LABELS.quantity);
		if (qty) {
			const num = parseInt(qty.replace(/[^0-9]/g, ''), 10);
			if (!Number.isNaN(num) && num > 0) result.quantity = num;
		}

		const orderNo = extractLabel(line, LABELS.orderNumber);
		if (orderNo) {
			const m = orderNo.match(ORDER_NO_REGEX);
			if (m) result.orderNumber = m[0];
		}
	}
	return result;
}

function parseFreeText(text: string): Partial<ParsedData> {
	const result: Partial<ParsedData> = {};

	const email = text.match(EMAIL_REGEX)?.[0];
	if (email) result.email = email;

	const orderNo = text.match(ORDER_NO_REGEX)?.[0];
	if (orderNo) result.orderNumber = orderNo;

	const phone = text.match(PHONE_REGEX)?.[0];
	if (phone) result.phone = phone.trim();

	// Address heuristic: street line optionally combined with a following zip+city line
	const streetMatch = text.match(STREET_REGEX);
	if (streetMatch) {
		let addr = streetMatch[0];
		const after = text.slice(streetMatch.index! + streetMatch[0].length);
		const zipCity = after.match(ZIP_CITY_REGEX);
		if (zipCity) {
			addr = `${addr}\n${zipCity[0]}`;
		}
		result.address = addr;
	}

	// Instrument type via keywords
	for (const { re, type } of KEYWORDS_TO_TYPE) {
		if (re.test(text)) {
			result.instrumentType = type;
			break;
		}
	}

	// Quantity near keywords
	const qtyMatch = text.match(/\b(?:qty|quantity|anzahl|menge|stück|pcs)[\s:]*([0-9]{1,3})\b/i);
	if (qtyMatch) {
		const num = parseInt(qtyMatch[1], 10);
		if (!Number.isNaN(num) && num > 0) result.quantity = num;
	}

	// Model after keywords
	const modelMatch = text.match(/\b(?:modell|model)\s*[:\-]\s*([^\n]+)/i);
	if (modelMatch) result.model = modelMatch[1].trim();

	// Color after keywords
	const colorMatch = text.match(/\b(?:farbe|color)\s*[:\-]\s*([^\n]+)/i);
	if (colorMatch) result.color = colorMatch[1].trim();

	return result;
}

function looksLikeForm(text: string): boolean {
	const lines = text.split('\n');
	let labeled = 0;
	for (const line of lines) {
		if (/^[a-zA-ZäöüÄÖÜß\-\s]+:\s*/.test(line)) labeled++;
	}
	return labeled >= 3; // simple heuristic
}

export function parseMail(inputText: string, inputHtml?: string): ParsedData {
	const text = normalize(inputText) || normalize(inputHtml);
	if (!text) return {};

	const fromForm = looksLikeForm(text);
	const base = fromForm ? parseContactForm(text) : parseFreeText(text);

	// Fallback notes as the full text if little was parsed
	const filledKeys = Object.keys(base);
	if (filledKeys.length <= 1) {
		base.notes = text.slice(0, 2000);
	}

	// Validate but keep partials: zod parse then strip invalids
	const safe = parsedDataSchema.safeParse(base);
	if (safe.success) return safe.data;

	// Remove invalid fields and return what is valid
	const out: ParsedData = {};
	for (const k of Object.keys(base) as Array<keyof ParsedData>) {
		try {
			parsedDataSchema.pick({ [k]: true } as any).parse({ [k]: base[k] } as any);
			(out as any)[k] = base[k];
		} catch {
			// ignore invalid key
		}
	}
	return out;
}

export default parseMail;


