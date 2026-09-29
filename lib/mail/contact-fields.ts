// Kontaktfelder aus der Mail (ohne Serverabhaengigkeiten, auch fuer die Oberflaeche).
export const CONTACT_FIELDS = ['phone', 'addressLine1', 'postalCode', 'city'] as const;
export type ContactField = typeof CONTACT_FIELDS[number];
export type MailContact = Partial<Record<ContactField, string>>;
export const CONTACT_LABELS: Record<ContactField, string> = { phone: 'Telefon', addressLine1: 'Straße', postalCode: 'PLZ', city: 'Ort' };
