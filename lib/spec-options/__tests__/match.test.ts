import { describe, expect, it } from 'vitest';
import { buildOptionMatchMessages, emptyOptionFor, matchSpecOption, notesFieldFor, parseOptionMatch, specValueFor } from '../match';

describe('matchSpecOption', () => {
  it.each([
    ['body_shape', 'Strat', 'Stratocaster'],
    ['body_shape', 'Telecaster', 'Telecaster'],
    ['hardware_color', 'Chrom', 'Chrome'],
    ['hardware_color', 'gold', 'Gold'],
    ['frets', '22 Medium-Jumbo-Bünde', '22 Medium Jumbo'],
    ['fretboard_radius', '9,5 Zoll', '9.5" (241 mm)'],
    ['fretboard_scale', '648 mm', '648 mm / 25.5" (Fender)'],
    ['fretboard_scale', '24.75 inch', '628 mm / 24.75" (Gibson)'],
    ['fretboard_material', 'Palisander', 'Palisander'],
    ['inlays', 'keine Inlays', 'Keine'],
  ])('%s: "%s" -> %s', (field, value, option) => {
    expect(matchSpecOption(field, value).option).toBe(option);
  });

  it('raet nicht bei mehreren passenden Werten', () => {
    expect(matchSpecOption('frets', '22 Bünde')).toEqual({ option: null, how: 'mehrdeutig' });
  });

  it('nimmt Compound-Radius nur, wenn er genannt ist', () => {
    expect(matchSpecOption('fretboard_radius', 'Compound 9,5-14 Zoll').option).toBe('Compound 9.5"-14"');
  });

  it('gibt nicht abgedeckten Inhalt als rest weiter, Fuellwoerter nicht', () => {
    expect(matchSpecOption('body_material', 'Esche, zweiteilig')).toEqual({ option: 'Esche', how: 'Regel', rest: 'zweiteilig' });
    expect(matchSpecOption('body_material', 'Mahagoni mit Riegelahorndecke')).toEqual({ option: 'Mahagoni', how: 'Regel', rest: 'riegelahorndecke' });
    expect(matchSpecOption('frets', '22 Medium-Jumbo-Bünde').rest).toBeUndefined();
    expect(matchSpecOption('fretboard_scale', '648 mm').rest).toBeUndefined();
    expect(matchSpecOption('inlays', 'keine Inlays')).toEqual({ option: 'Keine', how: 'Regel' });
    expect(specValueFor('body_material', 'Esche, zweiteilig', 'confirmed')).toMatchObject({ value: 'Esche', note: 'Esche, zweiteilig' });
    expect(specValueFor('body_shape', 'Strat', 'confirmed').note).toBeNull();
  });

  it('laesst Felder ohne Liste frei und Unbekanntes offen', () => {
    expect(matchSpecOption('pickups', 'SSS')).toEqual({ option: null, how: 'frei' });
    expect(matchSpecOption('fretboard_material', 'ebony')).toEqual({ option: null, how: 'offen' });
  });
});

describe('Ablehnungen und Notizen', () => {
  it('bildet Ablehnungen auf Keine/Nein ab', () => {
    expect(emptyOptionFor('inlays')).toBe('Keine');
    expect(emptyOptionFor('neck_binding')).toBe('Nein');
    expect(emptyOptionFor('fretboard_material')).toBeNull();
    expect(specValueFor('neck_binding', 'Binding', 'rejected').value).toBe('Nein');
  });

  it('findet das Notizfeld der Kategorie', () => {
    expect(notesFieldFor('GUITAR', 'body_material')).toBe('body_notes');
    expect(notesFieldFor('GUITAR', 'neck_wood')).toBe('neck_notes');
    expect(notesFieldFor('GUITAR', 'hardware_color')).toBe('notes');
  });
});

describe('Modellstufe', () => {
  const items = [{ field: 'finish_body', value: '3-Tone Sunburst' }, { field: 'pickups_routes', value: 'gold hardware' }, { field: 'pickups', value: 'SSS' }];

  it('schickt nur Felder mit Auswahlliste', () => {
    const payload = JSON.parse(buildOptionMatchMessages(items)[1].content);
    expect(payload.map((p: { field: string }) => p.field)).toEqual(['finish_body', 'pickups_routes']);
  });

  it('laesst nur echte Listenwerte zu und sperrt Custom als Auffangbecken', () => {
    const content = JSON.stringify({ items: [
      { field: 'finish_body', option: 'Burst (Farbe in Notizen)', note: '3-Tone Sunburst' },
      { field: 'pickups_routes', option: 'Custom', note: null },
      { field: 'hardware_color', option: 'Gold', note: null },
    ] });
    const parsed = parseOptionMatch(content, items);
    expect(parsed.finish_body).toEqual({ option: 'Burst (Farbe in Notizen)', note: '3-Tone Sunburst' });
    expect(parsed.pickups_routes.option).toBeNull();
    expect(parsed.hardware_color).toBeUndefined();
  });

  it('uebersteht ungueltige Antworten', () => {
    expect(parseOptionMatch('kein json', items)).toEqual({});
  });
});

describe('specValueFor', () => {
  it('bevorzugt die Regel, dann die gespeicherte Modellzuordnung, sonst Freitext', () => {
    expect(specValueFor('body_shape', 'Strat', 'confirmed').value).toBe('Stratocaster');
    expect(specValueFor('fretboard_material', 'ebony', 'confirmed', { option: 'Ebenholz' })).toMatchObject({ value: 'Ebenholz', how: 'Modell' });
    expect(specValueFor('fretboard_material', 'ebony', 'confirmed')).toMatchObject({ value: 'ebony', option: null, how: 'frei' });
  });

  it('legt die Farbe bei Burst in die Notiz', () => {
    expect(specValueFor('finish_body', '3-Tone Sunburst', 'confirmed', { option: 'Burst (Farbe in Notizen)', note: null }))
      .toMatchObject({ value: 'Burst (Farbe in Notizen)', note: '3-Tone Sunburst' });
  });
});
