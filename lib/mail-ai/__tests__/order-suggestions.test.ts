import { describe, expect, it } from 'vitest';
import { alreadyAnalyzed, buildSuggestionMessages, isOrderCustomerMail, mergeSuggestions, outputSchema, toSuggestionAnnotations } from '@/lib/mail-ai/order-suggestions';
import type { Annotation } from '@/lib/mail-training/contracts';

const FRESH = 'Hallo,\nich möchte jetzt doch Palisander statt Ebenholz für das Griffbrett.\nWas würden 22 Edelstahlbünde kosten?';
const FULL = `${FRESH}\n\n> Am 01.09. schrieb MGH:\n> Griffbrett aus Ebenholz wie besprochen.`;
const FIELDS = [{ key: 'fretboard_material' }, { key: 'frets' }];
const find = (field: string, value: string, intent: string, quote: string) => ({ field, value, intent, quote });

describe('toSuggestionAnnotations', () => {
  it('setzt Wert und Position genau auf die Stelle in der Mail', () => {
    const out = toSuggestionAnnotations(FULL, FRESH, [
      find('fretboard_material', 'Palisander', 'change', 'ich möchte jetzt doch Palisander statt Ebenholz'),
      find('fretboard_material', 'Ebenholz', 'rejected', 'Palisander statt Ebenholz'),
      find('frets', '22 Edelstahlbünde', 'question', 'Was würden 22 Edelstahlbünde kosten?'),
    ], FIELDS, 'gemma4:e4b@abc');
    expect(out.map(a => [a.field, a.value, a.intent, FULL.slice(a.start, a.end)])).toEqual([
      ['fretboard_material', 'Palisander', 'change', 'Palisander'],
      ['fretboard_material', 'Ebenholz', 'rejected', 'Ebenholz'],
      ['frets', '22 Edelstahlbünde', 'question', '22 Edelstahlbünde'],
    ]);
    expect(out.every(a => a.origin === 'model' && !a.reviewed && a.kind === 'order')).toBe(true);
    // "Ebenholz" steht auch im Zitat; markiert wird die Stelle im neuen Teil.
    expect(out[1].start).toBeLessThan(FRESH.length);
  });

  it('verwirft erfundene Werte, fremde Felder und Zitate, die nicht in der Mail stehen', () => {
    const out = toSuggestionAnnotations(FULL, FRESH, [
      find('fretboard_material', 'Ahorn', 'confirmed', 'ich möchte jetzt doch Palisander'),
      find('neck_wood', 'Palisander', 'confirmed', 'ich möchte jetzt doch Palisander'),
      find('fretboard_material', 'Ebenholz', 'confirmed', 'Griffbrett aus Ebenholz wie besprochen'),
    ], FIELDS, 'm');
    expect(out).toEqual([]);
  });

  it('toleriert abweichenden Leerraum im Zitat und andere Schreibung im Wert', () => {
    const out = toSuggestionAnnotations(FULL, FRESH, [find('frets', '22 edelstahlbünde', 'question', 'Was  würden 22\nEdelstahlbünde')], FIELDS, 'm');
    expect(out.map(a => a.value)).toEqual(['22 Edelstahlbünde']);
  });
});

describe('mergeSuggestions', () => {
  const a = (field: string, start: number, extra: Partial<Annotation> = {}): Annotation => ({ id: `${field}-${start}`, start, end: start + 5,
    text: 'xxxxx', kind: 'order', field, value: 'xxxxx', intent: 'unclear', masked: false, dismissed: false, origin: 'model', reviewed: false, ...extra });

  it('ersetzt ungepruefte Modellvorschlaege, laesst Gepruefte stehen', () => {
    const saved = [a('frets', 10, { reviewed: true, reason: 'correct' }), a('neck_wood', 30)];
    const merged = mergeSuggestions(saved, [a('frets', 12), a('fretboard_material', 50)]);
    expect(merged.map(x => `${x.field}@${x.start}:${x.reviewed}`)).toEqual(['frets@10:true', 'fretboard_material@50:false']);
  });
});

describe('Eingabe und Schema', () => {
  it('erlaubt nur Feldschluessel des Auftragstyps', () => {
    const schema = outputSchema(['frets']);
    expect(schema.safeParse({ findings: [find('frets', '22', 'confirmed', '22 Bünde')] }).success).toBe(true);
    expect(schema.safeParse({ findings: [find('password', 'x', 'confirmed', 'x')] }).success).toBe(false);
  });

  it('gibt aktuelle Auftragswerte mit, damit Aenderungen erkennbar sind', () => {
    const [, user] = buildSuggestionMessages({ fresh: FRESH, fields: [{ key: 'fretboard_material', label: 'Griffbrett-Material' }], current: { fretboard_material: 'Ebenholz' } });
    expect(JSON.parse(user.content).fields).toEqual([{ key: 'fretboard_material', label: 'Griffbrett-Material', current: 'Ebenholz' }]);
  });

  it('wertet nur Kundenmails aktiver Auftraege aus', () => {
    const base = { orderId: 'o1', senderId: null, fromEmail: 'kunde@example.org', account: { email: 'info@example.org' }, order: { deletedAt: null } };
    expect(isOrderCustomerMail(base)).toBe(true);
    expect(isOrderCustomerMail({ ...base, fromEmail: 'INFO@example.org' })).toBe(false);
    expect(isOrderCustomerMail({ ...base, senderId: 'u1' })).toBe(false);
    expect(isOrderCustomerMail({ ...base, orderId: null, order: null })).toBe(false);
    expect(isOrderCustomerMail({ ...base, order: { deletedAt: new Date() } })).toBe(false);
  });
});

describe('alreadyAnalyzed', () => {
  const model = (orderId: string, sourceHash: string) => ({ at: '', userId: 'system', action: 'model', orderId, sourceHash });
  it('ueberspringt eine Mail, die in diesem Stand schon ausgewertet wurde (auch von einem anderen Rechner)', () => {
    expect(alreadyAnalyzed({ sourceHash: 'h1', orderId: 'o1', history: [model('o1', 'h1')] }, 'h1', 'o1')).toBe(true);
  });
  it('wertet neu aus bei neuem Text, anderem Auftrag oder ohne Vermerk', () => {
    expect(alreadyAnalyzed({ sourceHash: 'h1', orderId: 'o1', history: [model('o1', 'h1')] }, 'h2', 'o1')).toBe(false);
    expect(alreadyAnalyzed({ sourceHash: 'h1', orderId: 'o2', history: [model('o1', 'h1')] }, 'h1', 'o2')).toBe(false);
    expect(alreadyAnalyzed({ sourceHash: 'h1', orderId: 'o1', history: [{ at: '', userId: 'u', action: 'contact' }] }, 'h1', 'o1')).toBe(false);
    expect(alreadyAnalyzed(null, 'h1', 'o1')).toBe(false);
  });
});
