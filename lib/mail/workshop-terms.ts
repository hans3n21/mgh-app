// Werkstattvokabular, das die Ortserkennung ("aus X", "from X") nicht fuer einen
// Ort halten darf. In Auftragsmails steht staendig "Korpus aus Erle" oder
// "Hals aus Ahorn"; als Adresse geschwaerzt fehlte der externen KI genau die
// Auftragsangabe, und die Holzart wurde als personenbezogen behandelt.
import { AUTOFILL_OPTIONS } from '@/lib/autofill-data';

const CORE_TERMS = [
  // Hoelzer
  'Erle', 'Esche', 'Sumpfesche', 'Ahorn', 'Riegelahorn', 'Vogelaugenahorn', 'Flammenahorn', 'Wölkchenahorn',
  'Mahagoni', 'Palisander', 'Ebenholz', 'Walnuss', 'Nussbaum', 'Wenge', 'Korina', 'Limba', 'Pappel', 'Linde',
  'Kiefer', 'Fichte', 'Zeder', 'Koa', 'Bubinga', 'Padouk', 'Padauk', 'Zebrano', 'Okoume', 'Sapele', 'Khaya',
  'Kirsche', 'Birke', 'Eiche', 'Buche', 'Ovangkol', 'Paulownia', 'Basswood', 'Alder', 'Ash', 'Maple',
  'Mahogany', 'Rosewood', 'Ebony', 'Walnut', 'Poplar', 'Richlite', 'Holz', 'Massivholz', 'Tonholz',
  // Materialien und Oberflaechen
  'Metall', 'Kunststoff', 'Aluminium', 'Alu', 'Messing', 'Chrom', 'Gold', 'Nickel', 'Edelstahl', 'Stahl',
  'Neusilber', 'Knochen', 'Graphit', 'Carbon', 'Acryl', 'Plexiglas', 'Perlmutt', 'Abalone', 'Leder',
  'Resin', 'Epoxid', 'Kupfer', 'Titan', 'Celluloid', 'Zelluloid', 'Tusq', 'Corian',
];

// Das Projekt kompiliert fuer ES5: keine \p{..}-Klassen, daher explizite Buchstabenbereiche.
const LETTER = 'A-Za-zÀ-ÖØ-öø-žß';

function termsFromAutofill(): string[] {
  return Object.values(AUTOFILL_OPTIONS).flat()
    .flatMap(value => value.split(new RegExp(`[^${LETTER}]+`)))
    .filter(word => word.length >= 3 && word[0] !== word[0].toLocaleLowerCase('de'));
}

const TERMS = new Set([...CORE_TERMS, ...termsFromAutofill()].map(t => t.toLocaleLowerCase('de')));

// Bauteil direkt vor "aus"/"from": dann folgt ein Material, kein Herkunftsort
// ("Korpus aus Paulownia", "Hals komplett aus Riegelahorn").
const PART_BEFORE = new RegExp(`(?:korpus|body|hals|neck|griffbrett|fretboard|fingerboard|decke|top|kopfplatte|headstock|pickguard|schlagbrett|sattel|nut|bünde|frets|boden|zargen|binding|inlays?|einlagen|knöpfe|deckel|furnier|mechaniken|hardware|brücke|steg|bridge|gitarre|guitar|bass|instrument|teile?|holz|material|platte|abdeckung)\\S*\\s+(?:[${LETTER}]+\\s+)?$`, 'i');

export function isWorkshopTerm(word: string): boolean {
  const lower = word.toLocaleLowerCase('de');
  return TERMS.has(lower) || /(?:holz|ahorn|esche|maple|wood)$/.test(lower);
}

/** Steht direkt vor dem Schluesselwort ("aus", "from" ...) an `keywordStart` ein Bauteil? */
export function followsInstrumentPart(text: string, keywordStart: number): boolean {
  return PART_BEFORE.test(text.slice(Math.max(0, keywordStart - 50), keywordStart));
}
