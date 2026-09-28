// Einordnung der Papierkorb-Mails fuer den Probelauf (scripts/mail-trash-report.ts).
//
// Reine Vorschau: hier wird nichts geloescht. Die Kategorien sollen zeigen,
// wie viel Papierkorb sich gefahrlos ausduennen liesse und wie viel eine
// genauere Pruefung (von Hand oder per KI) braucht. Grundsatz: im Zweifel
// behalten. Deshalb greifen die Behalten-Regeln vor den Loesch-Regeln.
//
// Nur Kopfdaten (Absender, Empfaenger, Zuordnung) - der Mailtext liegt auf dem
// NAS ausgelagert und waere fuer 30.000 Mails viel zu langsam zu lesen.

export type TrashCategory =
	| 'zugeordnet'
	| 'kunde'
	| 'kontakt'
	| 'eigene'
	| 'automatisch'
	| 'newsletter'
	| 'unklar';

export const TRASH_CATEGORY_INFO: Record<TrashCategory, { label: string; verdict: 'behalten' | 'loeschkandidat' | 'pruefen' }> = {
	zugeordnet:  { label: 'Auftrag oder Kunde zugeordnet', verdict: 'behalten' },
	kunde:       { label: 'Adresse eines Kunden', verdict: 'behalten' },
	kontakt:     { label: 'Bekannter Kontakt (angeschrieben oder schon mal zugeordnet)', verdict: 'behalten' },
	eigene:      { label: 'Von einem eigenen Postfach gesendet', verdict: 'pruefen' },
	automatisch: { label: 'Automatische Absender (no-reply, System, Zustellfehler)', verdict: 'loeschkandidat' },
	newsletter:  { label: 'Newsletter / Werbung', verdict: 'loeschkandidat' },
	unklar:      { label: 'Unklar (braucht genauere Pruefung)', verdict: 'pruefen' },
};

export const TRASH_CATEGORY_ORDER: TrashCategory[] = [
	'zugeordnet', 'kunde', 'kontakt', 'eigene', 'automatisch', 'newsletter', 'unklar',
];

export type TrashMailMeta = {
	fromEmail: string | null;
	toEmail: string | null;
	replyToEmail: string | null;
	orderId: string | null;
	customerId: string | null;
};

export type TrashClassifierContext = {
	/** Kundenadressen (email + additionalEmails), klein geschrieben. */
	customerAddresses: ReadonlySet<string>;
	/** Adressen der eigenen Mail-Konten, klein geschrieben. */
	ownAddresses: ReadonlySet<string>;
	/** Adressen, die schon einmal angeschrieben oder einem Auftrag/Kunden zugeordnet wurden. */
	contactAddresses: ReadonlySet<string>;
};

// Lokaler Teil der Absenderadresse. Bewusst eng gefasst: "info@" oder
// "service@" schreiben auch echte Kunden und Lieferanten.
const AUTOMATED_LOCAL_PART = /^(no-?reply|do-?not-?reply|donotreply|noreply|mailer-daemon|postmaster|bounces?|notifications?|notify|alerts?|system|automated|auto-?confirm)([+._-]|$)/;
const NEWSLETTER_LOCAL_PART = /^(newsletter|news|marketing|mailing|promo(tion)?s?|angebote?|werbung|kampagne|campaign|deals?|offers?)([+._-]|$)/;
// Typische Versand-Subdomains von Newsletter-Diensten: news.firma.de, em.firma.de, ...
const NEWSLETTER_DOMAIN = /^(news|newsletter|mailing|email|e-?mail|em|marketing)\.[^.]+\.[a-z]{2,}$/;

export function normalizeAddress(value: string | null | undefined): string | null {
	const trimmed = (value || '').trim().toLowerCase();
	return trimmed.includes('@') ? trimmed : null;
}

export function addressDomain(value: string | null | undefined): string | null {
	const address = normalizeAddress(value);
	return address ? address.slice(address.lastIndexOf('@') + 1) : null;
}

export function classifyTrashMail(mail: TrashMailMeta, ctx: TrashClassifierContext): TrashCategory {
	if (mail.orderId || mail.customerId) return 'zugeordnet';

	const from = normalizeAddress(mail.fromEmail);
	const addresses = [from, normalizeAddress(mail.toEmail), normalizeAddress(mail.replyToEmail)]
		.filter((address): address is string => !!address);

	if (addresses.some((address) => ctx.customerAddresses.has(address))) return 'kunde';
	if (addresses.some((address) => !ctx.ownAddresses.has(address) && ctx.contactAddresses.has(address))) return 'kontakt';
	if (from && ctx.ownAddresses.has(from)) return 'eigene';

	if (from) {
		const localPart = from.slice(0, from.lastIndexOf('@'));
		const domain = from.slice(from.lastIndexOf('@') + 1);
		if (AUTOMATED_LOCAL_PART.test(localPart)) return 'automatisch';
		if (NEWSLETTER_LOCAL_PART.test(localPart) || NEWSLETTER_DOMAIN.test(domain)) return 'newsletter';
	}
	return 'unklar';
}
