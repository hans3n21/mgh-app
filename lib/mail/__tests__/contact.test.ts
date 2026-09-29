import { describe, expect, it } from 'vitest';
import { contactFromEntities } from '../contact';
import type { ExtractedEntity } from '../extraction';

const e = (type: ExtractedEntity['type'], text: string, extra: Partial<ExtractedEntity> = {}): ExtractedEntity =>
  ({ type, text, start: 0, end: text.length, confidence: 0.9, source: 'regex', pii: true, ...extra });

describe('contactFromEntities', () => {
  it('liest Telefon, Strasse, PLZ und Ort aus eindeutigen Funden', () => {
    expect(contactFromEntities([e('name', 'Max Probe'), e('phone', '0151 9876543'), e('address', 'Beispielweg 7'), e('postalCode', '54321 Testhausen')]))
      .toEqual({ phone: '0151 9876543', addressLine1: 'Beispielweg 7', postalCode: '54321', city: 'Testhausen' });
  });

  it('zaehlt denselben Fund aus Regeln und Dienst einmal, verschachtelte Adressen als die kuerzere', () => {
    expect(contactFromEntities([e('phone', '0151 9876543'), e('phone', '0151-9876543', { source: 'ml' }),
      e('address', 'Beispielweg 7'), e('address', 'Beispielweg 7, 54321 Testhausen', { source: 'ml' })]))
      .toEqual({ phone: '0151 9876543', addressLine1: 'Beispielweg 7' });
  });

  it('laesst mehrdeutige Angaben leer, z. B. Kunden- und Shopadresse im Kontaktformular', () => {
    expect(contactFromEntities([e('address', 'Beispielweg 7'), e('address', 'Werkstattstraße 1'), e('phone', '0151 1111111'), e('phone', '030 2222222')]))
      .toEqual({});
  });

  it('respektiert verworfene Funde, auch wenn die Regeln sie erneut finden', () => {
    expect(contactFromEntities([e('address', 'Esche', { pii: false, dismissed: true, source: 'manual' }), e('address', 'Esche'), e('address', 'Beispielweg 7')]))
      .toEqual({ addressLine1: 'Beispielweg 7' });
  });
});
