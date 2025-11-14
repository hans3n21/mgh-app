export type SuggestedType = 'Hals' | 'Body' | 'Pickguard' | null;

export function suggestType(body: string, subject: string): { type: SuggestedType; assignee?: string } {
	const hay = `${subject}\n${body}`.toLowerCase();
	if (/(pickguard|schlagbrett)/i.test(hay)) {
		return { type: 'Pickguard', assignee: 'Pickguard-Team' };
	}
	if (/(hals|neck|mensur|griffbrett|radius|bünde|bund)/i.test(hay)) {
		return { type: 'Hals', assignee: 'Neck-Team' };
	}
	if (/(body|korpus|fräsung|pickup rout|kontur)/i.test(hay)) {
		return { type: 'Body', assignee: 'Body-Team' };
	}
	return { type: null };
}

export type ParsedField = { key: string; label: string; value: string; source: 'regex' };

function extractPlainText(htmlOrText: string): string {
	const div = document.createElement('div');
	div.innerHTML = htmlOrText;
	return (div.textContent || div.innerText || '').trim();
}

export function parseFields(type: SuggestedType, mail: { html?: string; text?: string; subject?: string }): ParsedField[] {
	const plain = extractPlainText(`${mail.html || ''}\n${mail.text || ''}`);
	const fields: ParsedField[] = [];

	// Mensur (scale length): e.g., 648 mm, 650mm
	const mensurMatch = plain.match(/(\d{3,4})\s*mm\b/i);
	if (mensurMatch) {
		fields.push({ key: 'mensur', label: 'Mensur', value: `${mensurMatch[1]} mm`, source: 'regex' });
	}

	// Griffbrett (fingerboard): Ebenholz, Palisander, Ahorn
	const woods = ['Ebenholz', 'Palisander', 'Ahorn', 'Maple', 'Rosewood', 'Ebony'];
	const foundWood = woods.find((w) => new RegExp(`\\b${w}\\b`, 'i').test(plain));
	if (foundWood) {
		const normalized = /ebony|ebenholz/i.test(foundWood) ? 'Ebenholz' : /rosewood|palisander/i.test(foundWood) ? 'Palisander' : 'Ahorn';
		fields.push({ key: 'griffbrett', label: 'Griffbrett', value: normalized, source: 'regex' });
	}

	// Radius: 9.5", 12", 7.25", 305 mm
	const radiusInch = plain.match(/(\d{1,2}(?:\.\d)?)\s*(?:"|''|inch|zoll)\b/i);
	if (radiusInch) {
		fields.push({ key: 'radius', label: 'Radius', value: `${radiusInch[1]}"`, source: 'regex' });
	} else {
		const radiusMm = plain.match(/(\d{2,3})\s*mm\b.*radius/i);
		if (radiusMm) {
			fields.push({ key: 'radius', label: 'Radius', value: `${radiusMm[1]} mm`, source: 'regex' });
		}
	}

	// Typ-induzierte Extrafelder
	if (type === 'Pickguard') {
		// z.B. "HSS", "SSS"
		const conf = plain.match(/\b(HSS|SSS|HSH|HH)\b/i);
		if (conf) fields.push({ key: 'pickup_config', label: 'Pickup-Konfiguration', value: conf[1].toUpperCase(), source: 'regex' });
	}

	return fields;
}


