// Mailwerte auf die Auswahllisten des Datenblatts abbilden (lib/autofill-data.ts).
// Der woertliche Mailwert bleibt Beleg in der Markierung; ins Datenblatt gehoert
// der Listenwert: "Strat" -> "Stratocaster", "Chrom" -> "Chrome",
// "9,5 Zoll" -> '9.5" (241 mm)', "3-Tone Sunburst" -> "Burst (Farbe in Notizen)" + Notiz.
//
// Zwei Stufen:
//   1. matchSpecOption: feste Regeln ohne Modell, schnell und in Transaktionen nutzbar
//   2. buildOptionMatchMessages / parseOptionMatch: Modellstufe fuer den Rest
//      ("single-cut", "érable", Farben -> Lackart). Der Modellaufruf gehoert in die
//      Hintergrundauswertung, nicht in decideSuggestion.
// Gemessen im Harness (services/ai-harness, 29.09.2026): bei richtigen Funden 36/36.
import { AUTOFILL_OPTIONS } from '@/lib/autofill-data';
import { FIELD_LABELS, SPEC_PRESETS, type OrderType } from '@/lib/order-presets';

export type MatchHow = 'exakt' | 'Regel' | 'Zahl' | 'Modell' | 'frei' | 'mehrdeutig' | 'offen';
/** rest: Inhalt des Mailwerts, den die Option nicht abdeckt ("zweiteilig" bei "Esche, zweiteilig"). */
export type OptionMatch = { option: string | null; how: MatchHow; rest?: string };

// Woerter, die neben der Option nichts Eigenes aussagen ("22 Medium-Jumbo-Bünde", "648 mm").
const FILLER = new Set(['mit', 'aus', 'in', 'und', 'im', 'am', 'der', 'die', 'das', 'ein', 'eine', 'einem', 'einer', 'bitte', 'gern', 'gerne',
  'the', 'with', 'and', 'a', 'an', 'of', 'bünde', 'bunde', 'bund', 'frets', 'fret', 'zoll', 'inch', 'inches', 'mm', 'holz', 'wood',
  'korpus', 'body', 'hals', 'neck', 'griffbrett', 'fretboard', 'hardware', 'farbe', 'color', 'colour', 'lackierung', 'finish']);

/** Was vom Mailwert uebrig bleibt, wenn man die Woerter der Option und Fuellwoerter abzieht. */
function restAfter(value: string, option: string, field: string): string | undefined {
  // Woerter der Option, des Feldnamens und der Feldbeschriftung sagen nichts Neues ("keine Inlays" -> Keine).
  const used = norm(option).split(' ').concat(numbers(option), norm(field.replace(/_/g, ' ')).split(' '), norm(FIELD_LABELS[field] || '').split(' '));
  const rest = norm(value).split(' ').filter(w => w && used.indexOf(w) < 0 && !FILLER.has(w) && numbers(w).every(n => used.indexOf(n) >= 0));
  return rest.join(' ').length >= 3 ? rest.join(' ') : undefined;
}

const norm = (s: string) => s.toLocaleLowerCase('de').replace(/ß/g, 'ss').replace(/[-_/().,"'“”]+/g, ' ').replace(/\s+/g, ' ').trim();
const numbers = (s: string): string[] => s.replace(/(\d),(\d)/g, '$1.$2').match(/\d+(\.\d+)?/g) || [];
const NUMERIC_FIELDS = ['fretboard_scale', 'fretboard_radius', 'frets', 'string_count', 'body_thickness', 'body_top_thickness', 'strings'];
const SPECIAL = /compound|multi/;

/**
 * Feste Regeln. option = Listenwert oder null.
 * how: 'frei' = Feld ohne Liste, 'mehrdeutig' = mehrere Listenwerte passen (nicht raten),
 * 'offen' = Regeln finden nichts, Modellstufe oder Freitext.
 */
export function matchSpecOption(field: string, value: string): OptionMatch {
  const options = AUTOFILL_OPTIONS[field];
  if (!options) return { option: null, how: 'frei' };
  const v = norm(value);
  if (!v) return { option: null, how: 'offen' };
  const exact = options.find(o => norm(o) === v);
  if (exact) return { option: exact, how: 'exakt' };
  // Wortanfang einer Option: "Strat" -> "Stratocaster", "Chrom" -> "Chrome" (kuerzeste gewinnt).
  if (v.length >= 4) {
    const starts = options.filter(o => norm(o).indexOf(v) === 0).sort((a, b) => a.length - b.length);
    if (starts.length) return { option: starts[0], how: 'Regel' };
  }
  // Option steckt als ganze Woerter im Wert: "22 Medium-Jumbo-Bünde" -> "22 Medium Jumbo" (laengste gewinnt).
  // Was die Option nicht abdeckt, geht als rest mit ("Mahagoni mit Riegelahorndecke" -> rest "riegelahorndecke").
  const inside = options.filter(o => norm(o).length >= 4 && (' ' + v + ' ').indexOf(' ' + norm(o) + ' ') >= 0).sort((a, b) => b.length - a.length);
  if (inside.length) {
    const rest = restAfter(value, inside[0], field);
    return rest ? { option: inside[0], how: 'Regel', rest } : { option: inside[0], how: 'Regel' };
  }
  // Zahlen: "648 mm" -> '648 mm / 25.5" (Fender)'. Compound/Multi-Scale nur, wenn genannt.
  if (NUMERIC_FIELDS.indexOf(field) >= 0) {
    const nums = numbers(value);
    if (nums.length) {
      const hits = options.filter(o => nums.every(n => numbers(o).indexOf(n) >= 0) && (!SPECIAL.test(norm(o)) || SPECIAL.test(v)));
      if (hits.length === 1) {
        const rest = restAfter(value, hits[0], field);
        return rest ? { option: hits[0], how: 'Zahl', rest } : { option: hits[0], how: 'Zahl' };
      }
      if (hits.length > 1) return { option: null, how: 'mehrdeutig' };
    }
  }
  return { option: null, how: 'offen' };
}

/** "keine Inlays", "kein Binding": in Listen mit "Keine"/"Nein" ist die Ablehnung ein echter Wert. */
export function emptyOptionFor(field: string): string | null {
  const options = AUTOFILL_OPTIONS[field] || [];
  return options.find(o => o === 'Keine' || o === 'Nein') || null;
}

/** Listenwerte, bei denen die Einzelheit (z. B. die Farbe) in die Notizen gehoert. */
export const isNoteOption = (option: string) => /Farbe in Notizen|siehe Notizen|^Custom/.test(option);

/** Notizfeld der Kategorie, in der das Feld steht (body_notes, neck_notes, notes …). */
export function notesFieldFor(orderType: string, field: string): string | null {
  const preset = SPEC_PRESETS[orderType as OrderType];
  if (!preset) return null;
  for (const cat of preset.categories) {
    const fields = preset.fields[cat];
    // Nur die Bereichsnotizen; "headstock_logo_notes" gehoert zum Logo, nicht zur Hardware-Farbe.
    if (fields.indexOf(field) >= 0) return fields.filter(f => /^(body_|neck_)?notes$/.test(f))[0] || null;
  }
  return null;
}

// ---------- Modellstufe ----------

export type OptionMatchItem = { field: string; value: string };

export const OPTION_MATCH_SCHEMA = {
  type: 'object',
  properties: { items: { type: 'array', items: { type: 'object', properties: {
    field: { type: 'string' }, option: { type: ['string', 'null'] }, note: { type: ['string', 'null'] } }, required: ['field', 'option', 'note'] } } },
  required: ['items'],
} as const;

export const OPTION_MATCH_PROMPT = `Du ordnest Angaben aus Kundenmails einer Gitarrenwerkstatt den Auswahllisten des Auftragsdatenblatts zu.
Für jedes Feld: wähle genau eine Option aus "options", wenn sie dieselbe Sache meint (auch über Sprachen hinweg: maple/érable = Ahorn, rosewood = Palisander, ebony = Ebenholz, mahogany = Mahagoni, flamed maple = Riegelahorn, roasted/torréfié = Roasted Maple, single-cut = Les Paul).
Finish-Felder beschreiben die Art der Lackierung, nicht die Farbe: Burst-Farben -> "Burst (Farbe in Notizen)", deckende Farben wie Olympic White -> "Deckend lackiert"; die Farbe selbst kommt dann in "note".
Passt die Farbe/Lackierung zum Korpus ("passend zum Korpus", "matching") -> "Matching Headstock" beim Kopfplatten-Finish.
Lässt die Angabe mehrere Optionen offen (z. B. "22 Bünde" ohne Größe, "Locking-Mechaniken" ohne Anordnung), option null. Ohne passende Option ebenfalls null. Nichts erfinden.
note nur für Details, die in keiner Option stecken (z. B. die Farbe), sonst null.`;

/** Nachrichten fuer den Modellaufruf; nur Felder mit Auswahlliste. */
export function buildOptionMatchMessages(items: OptionMatchItem[]) {
  const payload = items.filter(i => AUTOFILL_OPTIONS[i.field])
    .map(i => ({ field: i.field, label: FIELD_LABELS[i.field] || i.field, value: i.value, options: AUTOFILL_OPTIONS[i.field] }));
  return [{ role: 'system' as const, content: OPTION_MATCH_PROMPT }, { role: 'user' as const, content: JSON.stringify(payload) }];
}

/**
 * Modellantwort pruefen: nur echte Listenwerte. "Custom" nur, wenn der Kunde selbst
 * etwas Individuelles will; sonst wird es zum Auffangbecken fuer falsch zugeordnete
 * Angaben (Harness: "gold hardware" landete als Tonabnehmer-Fraesungen = Custom).
 */
export function parseOptionMatch(content: string, items: OptionMatchItem[]): Record<string, { option: string | null; note: string | null }> {
  const out: Record<string, { option: string | null; note: string | null }> = {};
  let parsed: { items?: { field?: unknown; option?: unknown; note?: unknown }[] };
  try { parsed = JSON.parse(content); } catch { return out; }
  for (const it of parsed.items || []) {
    const field = typeof it.field === 'string' ? it.field : '';
    const item = items.find(i => i.field === field);
    if (!item) continue;
    const opts = AUTOFILL_OPTIONS[field] || [];
    const option = typeof it.option === 'string' && opts.indexOf(it.option) >= 0 ? it.option : null;
    const custom = !!option && /^custom/i.test(option) && !/custom|individuell|eigen|sonder/i.test(item.value);
    out[field] = { option: custom ? null : option, note: typeof it.note === 'string' && it.note.trim() ? it.note.trim() : null };
  }
  return out;
}

/**
 * Was beim Uebernehmen ins Datenblatt geschrieben wird. Fuer writeOrderSpec:
 * Listenwert, wenn eindeutig bekannt (vorab gespeicherte Modellzuordnung oder Regel),
 * sonst der Mailwert als Freitext. note: Einzelheit fuer das Notizfeld (notesFieldFor).
 */
export function specValueFor(field: string, mailValue: string, intent: string, stored?: { option: string | null; note?: string | null } | null)
  : { value: string; option: string | null; note: string | null; how: MatchHow } {
  if (intent === 'rejected') {
    const empty = emptyOptionFor(field);
    return { value: empty || mailValue, option: empty, note: null, how: empty ? 'Regel' : 'frei' };
  }
  const rule = matchSpecOption(field, mailValue);
  // Rest oder Notiz-Option: den ganzen Mailwert als Notiz behalten, damit nichts verloren geht.
  if (rule.option) return { value: rule.option, option: rule.option, note: isNoteOption(rule.option) || rule.rest ? mailValue : null, how: rule.how };
  if (stored && stored.option) return { value: stored.option, option: stored.option, note: stored.note || (isNoteOption(stored.option) ? mailValue : null), how: 'Modell' };
  return { value: mailValue, option: null, note: null, how: rule.how === 'offen' ? 'frei' : rule.how };
}
