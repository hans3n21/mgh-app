import type { Mail } from '@prisma/client';
import type { ParsedData } from './parseMail';
import { getPresetForOrderType } from '@/lib/order-presets';

export type SpecSuggestion = {
  field: string;
  value: string;
  sourceMailId: string;
  sourceLabel: string;
  confidence: number; // 0..1
};

// Aliase/Tags je Mail-key → Preset-Feld(er). In einem echten System
// könnten diese aus dem Preset kommen. Hier schlicht gehalten.
const MAIL_KEY_ALIASES: Record<string, string[]> = {
  color: ['farbe', 'finish_body', 'pg_color_finish', 'body_color'],
  model: ['body_shape', 'headstock_type', 'pg_model', 'pickup_model', 'engraving_motif'],
  instrumentType: ['objekt'],
  notes: ['notes', 'repair_description'],
};

function score(key: string, value: unknown): number {
  if (value == null) return 0;
  const v = String(value).trim();
  if (!v) return 0;
  // simple heuristic: longer values get slightly less, exact label-like get more
  let s = 0.7;
  if (/^tele|^strat|les\s*paul|sg|prs/i.test(v)) s += 0.15;
  if (/sunburst|nitro|poly|schwarz|weiß|rot|blau|grün|natural/i.test(v)) s += 0.1;
  return Math.min(1, s);
}

export function buildSuggestions(mail: Pick<Mail, 'id' | 'subject' | 'date'>, parsedData: ParsedData, orderTypeKey: string | undefined): SpecSuggestion[] {
  const pd = parsedData || {};
  const preset = getPresetForOrderType(orderTypeKey || 'GUITAR');
  const label = `${mail.subject || 'Mail'} · ${mail.date ? new Date(mail.date).toLocaleDateString() : ''}`.trim();
  const out: SpecSuggestion[] = [];
  for (const [pKey, value] of Object.entries(pd)) {
    if (value == null) continue;
    const candidates = MAIL_KEY_ALIASES[pKey];
    if (!candidates || candidates.length === 0) continue;
    // wähle erstes Feld, das im Preset vorkommt
    const presetFields = new Set(Object.values(preset.fields).flat());
    const target = candidates.find((f) => presetFields.has(f));
    if (!target) continue;
    const valStr = String(value);
    // Confidence: default 0.9, bei einfachen Fuzzy/BestMatch 0.7
    const fuzzy = /(sunburst|nitro|poly|schwarz|weiß|rot|blau|grün|natural|tele|strat|les\s*paul|sg)/i;
    const conf = fuzzy.test(valStr) ? 0.9 : 0.7;
    out.push({ field: target, value: valStr, sourceMailId: mail.id, sourceLabel: label, confidence: conf });
  }
  return out;
}

export default buildSuggestions;


