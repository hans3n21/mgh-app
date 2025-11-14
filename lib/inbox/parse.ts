export type DraftType = 'Hals' | 'Body' | 'Pickguard' | 'Pickups' | 'Rep.';

export type ParsedDraft = Partial<{
	scale_length_mm: string; // e.g., 648 mm
	fretboard_radius_inch: string; // e.g., 16"
	fretboard_material: string; // Ebenholz/Palisander/Ahorn
	pickup_config: string; // HSS/SSS/HSH/HH
}>;

function extractPlainText(htmlOrText: string): string {
	if (typeof window === 'undefined') return htmlOrText;
	const div = document.createElement('div');
	div.innerHTML = htmlOrText;
	return (div.textContent || div.innerText || '').trim();
}

export function parseFields(type: DraftType, mail: { html?: string; text?: string; subject?: string }): { fields: ParsedDraft; source: 'regex' } {
	const plain = extractPlainText(`${mail.html || ''}\n${mail.text || ''}`);
	const fields: ParsedDraft = {};

	// Mensur (scale length): 648 mm, 650mm, 635 mm
	const mensur = plain.match(/\b(\d{3,4})\s*mm\b/i);
	if (mensur) fields.scale_length_mm = `${mensur[1]} mm`;

	// Griffbrett Holz
	const woods = ['Ebenholz', 'Palisander', 'Ahorn', 'Maple', 'Rosewood', 'Ebony'];
	const foundWood = woods.find((w) => new RegExp(`\\b${w}\\b`, 'i').test(plain));
	if (foundWood) {
		fields.fretboard_material = /ebony|ebenholz/i.test(foundWood)
			? 'Ebenholz'
			: /rosewood|palisander/i.test(foundWood)
			? 'Palisander'
			: 'Ahorn';
	}

	// Radius: 9.5", 12", 7.25" oder in mm mit Wort Radius in Nähe
	const radiusInch = plain.match(/\b(\d{1,2}(?:\.\d)?)\s*(?:"|''|inch|zoll)\b/i);
	if (radiusInch) fields.fretboard_radius_inch = `${radiusInch[1]}"`;
	else {
		const radiusMm = plain.match(/\b(\d{2,3})\s*mm\b.{0,20}radius/i);
		if (radiusMm) fields.fretboard_radius_inch = `${radiusMm[1]} mm`;
	}

	// Pickguard-Spezifisch: HSS/SSS/HSH/HH
	if (type === 'Pickguard') {
		const conf = plain.match(/\b(HSS|SSS|HSH|HH)\b/i);
		if (conf) fields.pickup_config = conf[1].toUpperCase();
	}

	return { fields, source: 'regex' };
}


