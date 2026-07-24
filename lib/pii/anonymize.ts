import { prisma } from '@/lib/prisma';
import { extractEntities, getPlaintext, type ExtractedEntity } from '@/lib/mail/extraction';
import { tokenizePII, rehydratePII, type TokenMap } from './tokenizer';

/**
 * Laedt Entities fuer eine Mail (aus DB oder on-demand).
 * Gibt null zurueck falls keine mailId angegeben.
 */
async function loadEntities(mailId?: string | null): Promise<ExtractedEntity[] | null> {
  if (!mailId) return null;

  try {
    const extraction = await prisma.mailExtraction.findUnique({
      where: { mailId },
      select: { entities: true },
    });

    if (extraction?.entities) {
      const raw = extraction.entities as unknown as ExtractedEntity[];
      const needsReExtract = raw.length > 0 && raw[0].pii === undefined;
      if (!needsReExtract) return raw;
    }

    const mail = await prisma.mail.findUnique({
      where: { id: mailId },
      select: { text: true, html: true },
    });

    if (mail) {
      const plaintext = getPlaintext(mail.text, mail.html);
      const fresh = await extractEntities(plaintext);
      return fresh;
    }
  } catch (err) {
    console.error('Failed to load entities for PII anonymization:', err);
  }

  return null;
}

export interface AnonymizeResult {
  anonymizedText: string;
  tokenMap: TokenMap;
  hadEntities: boolean;
}

/**
 * Anonymisiert einen Text basierend auf den Entities einer Mail.
 * Falls keine mailId oder keine Entities vorhanden, wird der Originaltext zurueckgegeben.
 */
export async function anonymizeText(
  text: string,
  mailId?: string | null,
): Promise<AnonymizeResult> {
  const entities = await loadEntities(mailId) ?? await extractEntities(text);

  if (!entities || entities.length === 0) {
    return { anonymizedText: text, tokenMap: {}, hadEntities: false };
  }

  const piiEntities = entities.filter((e) => e.pii);
  if (piiEntities.length === 0) {
    return { anonymizedText: text, tokenMap: {}, hadEntities: false };
  }

  const { tokenizedText, tokenMap } = tokenizePII(text, entities);
  return { anonymizedText: tokenizedText, tokenMap, hadEntities: true };
}

/**
 * Setzt PII-Platzhalter in einem KI-Antworttext zurueck.
 */
export function deanonymizeText(text: string, tokenMap: TokenMap): string {
  if (!text || Object.keys(tokenMap).length === 0) return text;
  return rehydratePII(text, tokenMap);
}
