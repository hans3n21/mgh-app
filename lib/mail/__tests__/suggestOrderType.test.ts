import { describe, it, expect } from 'vitest';
import { suggestOrderTypes } from '../suggestOrderType';

function makeMail(subject: string, text = '', parsedData?: any) {
  return { subject, text, html: '', parsedData, attachments: [] as any[] } as const;
}

describe('suggestOrderTypes', () => {
  it('detects neck from subject keywords', () => {
    const s = suggestOrderTypes(makeMail('Hals Reparatur – Headstock gebrochen'));
    expect(s[0].key).toBeTypeOf('string');
    const keys = s.map(x => x.key);
    expect(keys).toContain('NECK');
    expect(keys).toContain('REPAIR');
  });

  it('detects pickguard', () => {
    const s = suggestOrderTypes(makeMail('Pickguard Anfrage Jazzmaster', 'Ich brauche ein neues Schlagbrett'));
    expect(s[0].key).toBeDefined();
    expect(s.map(x=>x.key)).toContain('PICKGUARD');
  });

  it('respects parsed instrumentType', () => {
    const s = suggestOrderTypes(makeMail('Bitte Angebot', '', { instrumentType: 'pickup' }));
    expect(s[0].key).toBe('PICKUPS');
  });

  it('falls back to GUITAR', () => {
    const s = suggestOrderTypes(makeMail('Hallo'));
    expect(s[0].key).toBe('GUITAR');
  });
});


