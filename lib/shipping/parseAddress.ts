export interface ParsedAddress {
	street: string;
	houseNumber: string;
	raw: string;
}

/**
 * Best-effort split of a German address line into street + house number.
 * DHL's shipping API needs these as separate fields; Customer.addressLine1
 * is free text. Always returns something usable (falls back to the whole
 * string as street) so a form can show an editable value instead of failing —
 * staff review/correct the result before a label is actually created.
 */
export function parseGermanAddress(addressLine1: string | null | undefined): ParsedAddress {
	const raw = (addressLine1 || '').trim();
	if (!raw) {
		return { street: '', houseNumber: '', raw };
	}

	// Trailing house number: digits, optional letter suffix, optional range/addition like "12-14" or "12/2".
	const match = raw.match(/^(.*?)[\s,]+(\d+\s*[a-zA-Z]?(?:[-\/]\d+\s*[a-zA-Z]?)?)$/);
	if (match) {
		return { street: match[1].trim(), houseNumber: match[2].trim(), raw };
	}

	return { street: raw, houseNumber: '', raw };
}
