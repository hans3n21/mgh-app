import { prisma } from '@/lib/prisma';
import { dismissedTexts, extractEntities, isPiiEntity, type ExtractedEntity } from '@/lib/mail/extraction';
import { detectPii } from '@/lib/mail-ai/client';
import { tokenizePII, rehydratePII, type TokenMap } from './tokenizer';

/**
 * Gespeicherte Entities einer Mail inkl. manueller Markierungen und Verwerfungen.
 * Sie wurden beim Sync nur auf dem neuen Mailteil (ohne Zitat) erkannt; ihre
 * Positionen passen deshalb nicht zum Text, der tatsaechlich gesendet wird.
 */
async function loadStoredEntities(mailId?: string | null): Promise<ExtractedEntity[]> {
  if (!mailId) return [];
  try {
    const extraction = await prisma.mailExtraction.findUnique({
      where: { mailId },
      select: { entities: true },
    });
    const raw = extraction?.entities;
    return Array.isArray(raw) ? (raw as unknown as ExtractedEntity[]).filter(e => e && typeof e.text === 'string') : [];
  } catch (err) {
    console.error('Failed to load entities for PII anonymization:', err);
    return [];
  }
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// ES5-Ziel: explizite Buchstabenbereiche statt \p{L}.
const isWordChar = (ch: string | undefined) => !!ch && /[0-9A-Za-zÀ-ÖØ-öø-žß]/.test(ch);
const SOURCE_RANK: Record<string, number> = { manual: 3, db: 2, ml: 1, regex: 0 };

/**
 * Sucht jede bekannte Personenangabe im uebergebenen Text (alle Vorkommen, auch
 * im zitierten Verlauf) und liefert Entities mit Positionen genau in diesem Text.
 * Ueberlappende Treffer werden zusammengefasst, damit kein Namensteil stehen bleibt.
 * Von Menschen verworfene Texte werden nicht geschwaerzt.
 */
export function locatePiiEntities(text: string, entities: ExtractedEntity[]): ExtractedEntity[] {
  const suppressed = dismissedTexts(entities);
  const wanted = new Map<string, ExtractedEntity>();
  for (const e of entities) {
    if (e.dismissed || !(e.pii ?? isPiiEntity(e))) continue;
    const needle = e.text.replace(/\s+/g, ' ').trim();
    const key = needle.toLocaleLowerCase('de');
    if (needle.length < 2 || suppressed.has(key)) continue;
    const prev = wanted.get(key);
    if (!prev || (SOURCE_RANK[e.source] ?? 0) > (SOURCE_RANK[prev.source] ?? 0)) wanted.set(key, { ...e, text: needle });
  }

  const spans: ExtractedEntity[] = [];
  wanted.forEach(e => {
    const pattern = new RegExp(e.text.split(' ').map(escapeRegExp).join('\\s+'), 'gi');
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      if (!isWordChar(text[start - 1]) && !isWordChar(text[end])) spans.push({ ...e, text: m[0], start, end, pii: true });
    }
  });

  spans.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
  const merged: ExtractedEntity[] = [];
  for (const span of spans) {
    const last = merged[merged.length - 1];
    if (last && span.start < last.end) {
      if (span.end > last.end) {
        last.end = span.end;
        last.text = text.slice(last.start, last.end);
      }
      continue;
    }
    merged.push({ ...span });
  }
  return merged;
}

export interface AnonymizeResult {
  anonymizedText: string;
  tokenMap: TokenMap;
  hadEntities: boolean;
}

/**
 * Anonymisiert genau den Text, der an einen externen Dienst geht.
 * Gespeicherte Entities der Mail (inkl. manueller Korrekturen) plus eine frische
 * Erkennung auf diesem Text: so ist auch zitierter Verlauf und neu getippter Text
 * abgedeckt, den die Sync-Erkennung nie gesehen hat.
 */
export async function anonymizeText(
  text: string,
  mailId?: string | null,
): Promise<AnonymizeResult> {
  // Drei Quellen: gespeicherte Funde der Mail, Regeln und (falls aktiviert) das
  // lokale Modell, jeweils auf genau diesem Text. Ohne Dienst bleibt es bei den Regeln.
  const [stored, fresh, model] = await Promise.all([loadStoredEntities(mailId), extractEntities(text), detectPii(text)]);
  const located = locatePiiEntities(text, [...stored, ...fresh, ...model]);

  if (located.length === 0) {
    return { anonymizedText: text, tokenMap: {}, hadEntities: false };
  }

  const { tokenizedText, tokenMap } = tokenizePII(text, located);
  return { anonymizedText: tokenizedText, tokenMap, hadEntities: true };
}

/**
 * Setzt PII-Platzhalter in einem KI-Antworttext zurueck.
 */
export function deanonymizeText(text: string, tokenMap: TokenMap): string {
  if (!text || Object.keys(tokenMap).length === 0) return text;
  return rehydratePII(text, tokenMap);
}
