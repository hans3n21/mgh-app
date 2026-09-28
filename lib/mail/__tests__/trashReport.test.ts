import { describe, expect, it } from 'vitest';
import { addressDomain, classifyTrashMail, type TrashClassifierContext, type TrashMailMeta } from '../trashReport';

const ctx: TrashClassifierContext = {
	customerAddresses: new Set(['kunde@web.de']),
	ownAddresses: new Set(['info@mgh.de']),
	contactAddresses: new Set(['lieferant@holz.de', 'info@mgh.de']),
};

const mail = (overrides: Partial<TrashMailMeta>): TrashMailMeta => ({
	fromEmail: 'fremd@irgendwo.de',
	toEmail: 'info@mgh.de',
	replyToEmail: null,
	orderId: null,
	customerId: null,
	...overrides,
});

describe('classifyTrashMail', () => {
	it('behaelt zugeordnete Mails, auch von no-reply-Absendern', () => {
		expect(classifyTrashMail(mail({ orderId: 'o1', fromEmail: 'noreply@shop.de' }), ctx)).toBe('zugeordnet');
		expect(classifyTrashMail(mail({ customerId: 'c1' }), ctx)).toBe('zugeordnet');
	});

	it('erkennt Kundenadressen in Absender, Empfaenger und Reply-To (ohne Gross/Klein)', () => {
		expect(classifyTrashMail(mail({ fromEmail: 'Kunde@Web.de' }), ctx)).toBe('kunde');
		expect(classifyTrashMail(mail({ fromEmail: 'info@mgh.de', toEmail: 'kunde@web.de' }), ctx)).toBe('kunde');
		expect(classifyTrashMail(mail({ fromEmail: 'formular@mgh.de', replyToEmail: 'kunde@web.de' }), ctx)).toBe('kunde');
	});

	it('erkennt bekannte Kontakte, aber nicht die eigene Adresse als Kontakt', () => {
		expect(classifyTrashMail(mail({ fromEmail: 'lieferant@holz.de' }), ctx)).toBe('kontakt');
		// toEmail ist die eigene Adresse und steht in contactAddresses - darf allein nicht reichen
		expect(classifyTrashMail(mail({ fromEmail: 'fremd@irgendwo.de' }), ctx)).toBe('unklar');
	});

	it('markiert Mails aus eigenen Postfaechern zur Pruefung', () => {
		expect(classifyTrashMail(mail({ fromEmail: 'info@mgh.de', toEmail: 'fremd@irgendwo.de' }), ctx)).toBe('eigene');
	});

	it('erkennt automatische Absender', () => {
		for (const from of ['noreply@paypal.de', 'no-reply@dhl.de', 'do-not-reply@x.com', 'mailer-daemon@mx.de', 'notifications@github.com', 'bounce+123@mail.de']) {
			expect(classifyTrashMail(mail({ fromEmail: from }), ctx), from).toBe('automatisch');
		}
	});

	it('erkennt Newsletter am Absender oder an der Versand-Subdomain', () => {
		for (const from of ['newsletter@thomann.de', 'news@shop.de', 'marketing@firma.com', 'hallo@news.firma.de', 'team@em.brand.com']) {
			expect(classifyTrashMail(mail({ fromEmail: from }), ctx), from).toBe('newsletter');
		}
	});

	it('laesst normale Absender als unklar stehen', () => {
		for (const from of ['info@firma.de', 'service@shop.de', 'max.newsom@web.de', 'person@mail.de', 'anna@gmail.com']) {
			expect(classifyTrashMail(mail({ fromEmail: from }), ctx), from).toBe('unklar');
		}
	});

	it('kommt ohne Absender aus', () => {
		expect(classifyTrashMail(mail({ fromEmail: null, toEmail: null }), ctx)).toBe('unklar');
	});
});

describe('addressDomain', () => {
	it('liefert die Domain klein geschrieben', () => {
		expect(addressDomain(' Max@Example.DE ')).toBe('example.de');
		expect(addressDomain('kein-at')).toBeNull();
		expect(addressDomain(null)).toBeNull();
	});
});
