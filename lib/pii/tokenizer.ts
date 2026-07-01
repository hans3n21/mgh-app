import type { ExtractedEntity } from '@/lib/mail/extraction';

export interface TokenMap {
  [placeholder: string]: string;
}

export interface TokenizeResult {
  tokenizedText: string;
  tokenMap: TokenMap;
}

const TYPE_LABELS: Record<string, string> = {
  email: 'EMAIL',
  phone: 'PHONE',
  iban: 'IBAN',
  address: 'ADDRESS',
  postalCode: 'POSTALCODE',
  name: 'NAME',
  customerNumber: 'CUSTOMERNR',
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Ersetzt PII-Entities im Text durch Platzhalter wie {{NAME_1}}, {{EMAIL_1}}.
 * Gleicher Text bekommt denselben Token (z.B. 2x "Max Mustermann" → beide {{NAME_1}}).
 */
export function tokenizePII(
  text: string,
  entities: ExtractedEntity[],
  excludeIndices?: Set<number>,
): TokenizeResult {
  const tokenMap: TokenMap = {};
  const counters: Record<string, number> = {};
  const textToPlaceholder: Record<string, string> = {};

  const piiEntities = entities
    .map((e, i) => ({ entity: e, originalIndex: i }))
    .filter(({ entity, originalIndex }) => {
      if (!entity.pii) return false;
      if (excludeIndices?.has(originalIndex)) return false;
      return true;
    })
    .sort((a, b) => b.entity.start - a.entity.start);

  let result = text;

  for (const { entity } of piiEntities) {
    const label = TYPE_LABELS[entity.type] || entity.type.toUpperCase();
    const normalizedText = entity.text.trim().toLowerCase();
    const lookupKey = `${label}::${normalizedText}`;

    let placeholder = textToPlaceholder[lookupKey];
    if (!placeholder) {
      counters[label] = (counters[label] || 0) + 1;
      placeholder = `{{${label}_${counters[label]}}}`;
      textToPlaceholder[lookupKey] = placeholder;
      tokenMap[placeholder] = entity.text;
    }

    if (result.slice(entity.start, entity.end) === entity.text) {
      const before = result.slice(0, entity.start);
      const after = result.slice(entity.end);
      result = before + placeholder + after;
    } else if (entity.text.trim()) {
      result = result.replace(new RegExp(escapeRegExp(entity.text), 'g'), placeholder);
    }
  }

  return { tokenizedText: result, tokenMap };
}

/**
 * Setzt Originalwerte fuer Platzhalter in einem KI-Antworttext wieder ein.
 */
export function rehydratePII(text: string, tokenMap: TokenMap): string {
  let result = text;
  for (const [placeholder, original] of Object.entries(tokenMap)) {
    const escaped = placeholder.replace(/[{}]/g, '\\$&');
    result = result.replace(new RegExp(escaped, 'g'), original);
  }
  return result;
}
