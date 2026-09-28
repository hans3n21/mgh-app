import { FIELD_LABELS, SPEC_PRESETS, OrderType } from '@/lib/order-presets';
import { stripQuotedContent } from '@/lib/mail/stripQuotedContent';
import type { Candidate } from './contracts';

// Deliberately bounded pilot: literal values come from the mail, never from the model.
const WOODS = /\b(?:Ahorn|Ebenholz|Palisander|Mahagoni|Esche|Erle|Walnuss|Wenge|Maple|Ebony|Rosewood|Mahogany|Ash|Alder|Walnut)(?:holz)?\b/gi;
const WOOD_FIELDS = ['neck_wood', 'fretboard_material', 'body_material'];
const NUMERIC_FIELDS: Array<{ field: string; pattern: RegExp }> = [
  { field: 'frets', pattern: /\b\d{2}\s*(?:Edelstahl[- ]?)?(?:bünde|buende|frets)\b/gi },
  { field: 'fretboard_radius', pattern: /\b(?:Radius|Griffbrettradius)\s*(?:von|:|=)?\s*\d{1,2}(?:[.,]\d+)?\s*(?:Zoll|inch|inches|"|″)/gi },
  { field: 'fretboard_radius', pattern: /\b\d{1,2}(?:[.,]\d+)?\s*(?:Zoll|inch|inches|"|″)[- ]*(?:Radius|Griffbrettradius)\b/gi },
  { field: 'fretboard_scale', pattern: /\b(?:Mensur|scale(?: length)?)\s*(?:von|:|=)?\s*\d{2,3}(?:[.,]\d+)?\s*(?:mm|cm|Zoll|inch|inches|"|″)/gi },
];

export function prepareCandidates(input: string, orderType: string) {
  if (!Object.prototype.hasOwnProperty.call(SPEC_PRESETS, orderType)) {
    throw new Error('Unbekannter Auftragstyp.');
  }
  const { freshContent, hadQuotes } = stripQuotedContent(input.replace(/\r\n?/g, '\n'));
  const text = freshContent.trim();
  if (!text) throw new Error('Die Mail enthält keinen neuen Klartext.');
  if (text.length > 6000) throw new Error('Für den Pilotversuch bitte eine kurze Mail verwenden (maximal 6.000 Zeichen ohne Zitate).');
  const allowed = new Set(Object.values(SPEC_PRESETS[orderType as OrderType].fields).flat());
  const candidates: Candidate[] = [];
  const seen = new Set<string>();
  function add(field: string, value: string, index: number, length: number) {
    if (!allowed.has(field)) return;
    const key = `${field}:${value.toLocaleLowerCase('de')}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({
      id: `c${candidates.length}`, field, label: FIELD_LABELS[field] || field, value,
      evidence: text.slice(Math.max(0, index - 100), Math.min(text.length, index + length + 100)),
    });
  }
  for (const match of Array.from(text.matchAll(new RegExp(WOODS)))) {
    for (const field of WOOD_FIELDS) add(field, match[0], match.index!, match[0].length);
  }
  for (const { field, pattern } of NUMERIC_FIELDS) {
    for (const match of Array.from(text.matchAll(new RegExp(pattern)))) add(field, match[0], match.index!, match[0].length);
  }
  if (candidates.length > 24) throw new Error('Die Mail enthält zu viele mögliche Angaben für den Pilotversuch. Bitte eine kürzere Mail prüfen.');
  return { text, candidates, hadQuotes };
}

export function makeQuestions(candidates: Candidate[]) {
  const description = (c: Candidate) => {
    const phrases: Record<string, string> = { neck_wood: `einen Hals aus ${c.value}`,
      fretboard_material: `ein Griffbrett aus ${c.value}`, body_material: `einen Korpus aus ${c.value}`,
      frets: c.value, fretboard_radius: `einen Griffbrett-Radius von ${c.value.replace(/^.*?\s(?=\d)/, '')}`,
      fretboard_scale: `eine Mensur von ${c.value.replace(/^.*?\s(?=\d)/, '')}` };
    return phrases[c.field] || `${c.label}: ${c.value}`;
  };
  return Object.fromEntries(candidates.map(c => [c.id, {
    type: 'choice' as const,
    instructions: `Welche Aussage beschreibt die aktuelle Absicht des Kunden bezüglich „${description(c)}“?`,
    criteria: {
      confirmed: `Der Kunde möchte ${description(c)} bestellen.`,
      tentative: `Der Kunde fragt nach ${description(c)} oder überlegt noch.`,
      rejected: `Der Kunde möchte ${description(c)} nicht oder nicht mehr.`,
      unclear: `Die Mail enthält keine eindeutige Aussage über ${description(c)}.`,
    },
  }]));
}
