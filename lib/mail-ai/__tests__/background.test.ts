import { describe, expect, it } from 'vitest';
import { isBulkSender, prioritize } from '@/lib/mail-ai/background';

const mail = (id: string, extra: Partial<{ folder: string; orderId: string | null; customerId: string | null; fromEmail: string | null }> = {}) =>
  ({ id, folder: 'INBOX', orderId: null, customerId: null, fromEmail: 'kunde@example.org', ...extra });

describe('isBulkSender', () => {
  it('erkennt automatische Absender, aber keine normalen Adressen', () => {
    for (const email of ['noreply@shop.example', 'no-reply@x.example', 'newsletter@hersteller.example', 'news@magazin.example',
      'notifications@github.example', 'mailer-daemon@mail.example', 'marketing.team@firma.example'])
      expect(isBulkSender(email)).toBe(true);
    for (const email of ['info@kunde.example', 'anna.beispiel@example.org', 'newsom@example.org', null])
      expect(isBulkSender(email)).toBe(false);
  });
});

describe('prioritize', () => {
  it('angestossene Mails zuerst, dann Auftrags-, dann Kundenmails, dann der Rest', () => {
    const mails = [mail('rest'), mail('kunde', { customerId: 'c1' }), mail('auftrag', { orderId: 'o1' }), mail('neu-zugeordnet')];
    expect(prioritize(mails, ['neu-zugeordnet']).map(m => m.id)).toEqual(['neu-zugeordnet', 'auftrag', 'kunde', 'rest']);
  });

  it('laesst gesendete Mails und Newsletter aus, ausser sie gehoeren zu Kunde oder Auftrag', () => {
    const mails = [mail('gesendet', { folder: 'Sent' }), mail('newsletter', { fromEmail: 'newsletter@x.example' }),
      mail('shop-bestellung', { fromEmail: 'noreply@shop.example', orderId: 'o2' })];
    expect(prioritize(mails, []).map(m => m.id)).toEqual(['shop-bestellung']);
  });
});
