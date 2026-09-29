import { describe, expect, it } from 'vitest';
import { guessOrderType } from '../rules';

describe('guessOrderType', () => {
  it('erkennt ganze Gitarren an Hals und Korpus oder am Modellnamen', () => {
    expect(guessOrderType('Korpus aus Esche, Hals aus Ahorn mit 21 Bünden.', 'Anfrage')).toBe('GUITAR');
    expect(guessOrderType('Hätte gern eine Tele mit Ahorngriffbrett.', '')).toBe('GUITAR');
    expect(guessOrderType('', 'Custom Stratocaster')).toBe('GUITAR');
  });

  it('bleibt bei Einzelteilen', () => {
    expect(guessOrderType('Ich brauche einen neuen Hals, Mensur 648 mm.', '')).toBe('NECK');
    expect(guessOrderType('Nur den Korpus bitte, mit Fräsung für HH.', '')).toBe('BODY');
    expect(guessOrderType('Zwei Humbucker für mein Projekt.', '')).toBe('PICKUPS');
  });

  it('Pickguard und Reparatur haben Vorrang', () => {
    expect(guessOrderType('Pickguard für meine Tele', '')).toBe('PICKGUARD');
    expect(guessOrderType('Der Hals meiner Strat ist abgebrochen.', '')).toBe('REPAIR');
  });

  it('fällt ohne Hinweis auf Gitarre zurück und lässt sich nicht von ähnlichen Wörtern täuschen', () => {
    expect(guessOrderType('Wann kann ich vorbeikommen?', '')).toBe('GUITAR');
    expect(guessOrderType('Telefon: 0151 123456, somebody told me', '')).toBe('GUITAR');
    expect(guessOrderType('Unsere Strategie für den Shop', '')).toBe('GUITAR');
  });
});
