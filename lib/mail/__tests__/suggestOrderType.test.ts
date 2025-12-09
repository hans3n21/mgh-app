import { describe, it, expect } from 'vitest';
import { suggestOrderTypes } from '../suggestOrderType';

function makeMail(subject: string, text = '', parsedData?: any) {
  return { subject, text, html: '', attachments: [] as any[] } as const;
}

describe('suggestOrderTypes', () => {
  it('detects neck from subject keywords', () => {
    const mail = makeMail('Hals Reparatur – Headstock gebrochen');
    const s = suggestOrderTypes(mail, {});
    expect(s[0].key).toBeTypeOf('string');
    const keys = s.map(x => x.key);
    expect(keys).toContain('NECK');
    expect(keys).toContain('REPAIR');
  });

  it('detects pickguard', () => {
    const mail = makeMail('Pickguard Anfrage Jazzmaster', 'Ich brauche ein neues Schlagbrett');
    const s = suggestOrderTypes(mail, {});
    expect(s[0].key).toBeDefined();
    expect(s.map(x=>x.key)).toContain('PICKGUARD');
  });

  it('respects parsed instrumentType', () => {
    const mail = makeMail('Bitte Angebot', '');
    const s = suggestOrderTypes(mail, { instrumentType: 'pickup' });
    expect(s[0].key).toBe('PICKUPS');
  });

  it('falls back to GUITAR', () => {
    const mail = makeMail('Hallo');
    const s = suggestOrderTypes(mail, {});
    expect(s[0].key).toBe('GUITAR');
  });
});


