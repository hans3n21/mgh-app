import { prisma } from '@/lib/prisma';

export type EntityType =
  | 'email'
  | 'phone'
  | 'iban'
  | 'address'
  | 'postalCode'
  | 'name'
  | 'orderNumber'
  | 'customerNumber'
  | 'instrumentType';

export type EntitySource = 'regex' | 'db' | 'ml' | 'manual';

const PII_TYPES = new Set<EntityType>([
  'email', 'phone', 'iban', 'address', 'postalCode', 'name', 'customerNumber',
]);

export interface ExtractedEntity {
  type: EntityType;
  text: string;
  start: number;
  end: number;
  confidence: number;
  source: EntitySource;
  pii: boolean;
}

const PATTERNS: Array<{ type: EntityType; regex: RegExp; confidence: number }> = [
  { type: 'email', regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, confidence: 0.95 },
  { type: 'orderNumber', regex: /\b(?:ORD|ANG|INV|REC)-\d{4}-\d{3,6}\b/g, confidence: 0.99 },
  { type: 'iban', regex: /\b[A-Z]{2}\d{2}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{0,2}\b/g, confidence: 0.9 },
  { type: 'phone', regex: /(?:\+\d{1,3}[\s-]?)(?:\(\d{1,4}\)[\s-]?)?\d(?:[\s-]?\d){6,14}/g, confidence: 0.8 },
  { type: 'phone', regex: /\b0\d{1,4}[\s/-]?\d{3,10}\b/g, confidence: 0.75 },

  // Addresses – DE/AT/CH/NL
  { type: 'address', regex: /\b[A-ZÄÖÜa-zäöüß .'-]+(?:straße|strasse|str\.|weg|platz|allee|gasse|ring|damm|ufer|straat|laan|gracht|kade|plein)\s*\d+[a-zA-Z]?\b/gi, confidence: 0.8 },
  // Addresses – EN (number-first: "123 Main Street")
  { type: 'address', regex: /\b\d+\s+[A-Za-z .'-]+(?:street|st\.|road|rd\.|avenue|ave\.|lane|ln\.|drive|dr\.|boulevard|blvd\.|way|place|court|ct\.|terrace|crescent|close|square)\b/gi, confidence: 0.75 },
  // Addresses – FR ("12 rue de la Paix")
  { type: 'address', regex: /\b\d+\s*,?\s*(?:rue|avenue|boulevard|allée|chemin|impasse|passage)\s+[A-ZÀ-Ž][a-zà-ž .'-]+/gi, confidence: 0.75 },
  // Addresses – IT ("Via Roma 15")
  { type: 'address', regex: /\b(?:via|viale|piazza|corso|largo)\s+[A-ZÀ-Ž][a-zà-ž .'-]+(?:\s*\d+)?/gi, confidence: 0.75 },
  // Addresses – ES ("Calle Mayor 5")
  { type: 'address', regex: /\b(?:calle|avenida|paseo|plaza|camino)\s+[A-ZÀ-Ž][a-zà-ž .'-]+(?:\s*\d+)?/gi, confidence: 0.75 },
  // Addresses – SE/DK/NO ("Drottninggatan 5")
  { type: 'address', regex: /\b[A-ZÀ-Ž][a-zà-ž]+(?:gatan|vägen|gata|vej|veien|gate|plass|torget|vei)\s*\d+[a-zA-Z]?\b/gi, confidence: 0.75 },

  // PLZ – 5-stellig (DE, FR, ES, IT)
  { type: 'postalCode', regex: /\b\d{5}\s+[A-ZÀ-Ž][a-zà-ž]+\b/g, confidence: 0.8 },
  // PLZ – NL ("1234 AB")
  { type: 'postalCode', regex: /\b\d{4}\s?[A-Z]{2}\b/g, confidence: 0.8 },
  // PLZ – UK ("SW1A 1AA", "EC2R 8AH", "M1 1AA")
  { type: 'postalCode', regex: /\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b/g, confidence: 0.8 },
  // PLZ – PL ("00-950 Warszawa")
  { type: 'postalCode', regex: /\b\d{2}-\d{3}\s+[A-ZÀ-Ž][a-zà-ž]+\b/g, confidence: 0.8 },
  // PLZ – PT ("1000-001 Lisboa")
  { type: 'postalCode', regex: /(?<![-\w])\d{4}-\d{3}\s+[A-ZÀ-Ž][a-zà-žß]+\b/g, confidence: 0.75 },
  // PLZ – SE ("123 45")
  { type: 'postalCode', regex: /\b\d{3}\s\d{2}\s+[A-ZÀ-Ž][a-zà-ž]+\b/g, confidence: 0.75 },
  // PLZ – US ZIP+4 ("90210-1234")
  { type: 'postalCode', regex: /(?<![-\w])\d{5}-\d{4}\b/g, confidence: 0.8 },
  // PLZ – CA ("K1A 0B1")
  { type: 'postalCode', regex: /\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b/g, confidence: 0.8 },

  { type: 'customerNumber', regex: /\b\d{3,8}-[A-Z]{2,5}\b/g, confidence: 0.85 },
];

const INSTRUMENT_PATTERNS: Array<{ regex: RegExp; label: string }> = [
  { regex: /\b(?:neck|hals)\b/gi, label: 'Hals' },
  { regex: /\b(?:body|korpus)\b/gi, label: 'Body' },
  { regex: /\b(?:pickups?|humbucker|single\s*coil)\b/gi, label: 'Pickups' },
  { regex: /\b(?:pickguard|schlagbrett)\b/gi, label: 'Pickguard' },
  { regex: /\b(?:laser|gravur|engrav(?:e|ing))\b/gi, label: 'Gravur' },
  { regex: /\b(?:bass)\b/gi, label: 'Bass' },
  { regex: /\b(?:gitarre|guitar|tele(?:caster)?|strat(?:ocaster)?|les\s*paul|sg)\b/gi, label: 'Gitarre' },
  { regex: /\b(?:repair|reparatur|service)\b/gi, label: 'Reparatur' },
];

function normalize(text: string | undefined | null): string {
  return (text || '')
    .replace(/\r\n?/g, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function deduplicate(entities: ExtractedEntity[]): ExtractedEntity[] {
  const result: ExtractedEntity[] = [];
  const sorted = [...entities].sort((a, b) => a.start - b.start || b.confidence - a.confidence);

  for (const entity of sorted) {
    const overlaps = result.some(
      (existing) => entity.start < existing.end && entity.end > existing.start
    );
    if (!overlaps) {
      result.push(entity);
    }
  }
  return result;
}

function isWordBoundary(text: string, start: number, end: number): boolean {
  const before = start > 0 ? text[start - 1] : ' ';
  const after = end < text.length ? text[end] : ' ';
  return /[\s.,;:!?()"\-]/.test(before) && /[\s.,;:!?()"\-]/.test(after);
}

function runRegexScan(text: string): ExtractedEntity[] {
  const entities: ExtractedEntity[] = [];

  for (const { type, regex, confidence } of PATTERNS) {
    const re = new RegExp(regex.source, regex.flags);
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      const matchedText = match[0].trim().replace(/[.,;:!?]+$/, '');
      if (type === 'phone') {
        const digitCount = matchedText.replace(/\D/g, '').length;
        if (digitCount < 7 || digitCount > 15) continue;
      }
      entities.push({
        type,
        text: matchedText,
        start: match.index,
        end: match.index + match[0].length,
        confidence,
        source: 'regex',
        pii: PII_TYPES.has(type),
      });
    }
  }

  for (const { regex, label } of INSTRUMENT_PATTERNS) {
    const re = new RegExp(regex.source, regex.flags);
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      entities.push({
        type: 'instrumentType',
        text: label,
        start: match.index,
        end: match.index + match[0].length,
        confidence: 0.7,
        source: 'regex',
        pii: false,
      });
      break;
    }
  }

  return entities;
}

function findAllOccurrences(
  text: string,
  lowerText: string,
  needle: string,
  type: EntityType,
  confidence: number,
): ExtractedEntity[] {
  const results: ExtractedEntity[] = [];
  const lowerNeedle = needle.toLowerCase();
  let searchFrom = 0;
  while (searchFrom < lowerText.length) {
    const idx = lowerText.indexOf(lowerNeedle, searchFrom);
    if (idx === -1) break;
    const end = idx + needle.length;
    if (isWordBoundary(text, idx, end)) {
      results.push({
        type,
        text: text.slice(idx, end),
        start: idx,
        end,
        confidence,
        source: 'db',
        pii: true,
      });
    }
    searchFrom = idx + 1;
  }
  return results;
}

async function runDbMatch(text: string): Promise<ExtractedEntity[]> {
  const entities: ExtractedEntity[] = [];
  const lowerText = text.toLowerCase();

  try {
    const customers = await prisma.customer.findMany({
      select: { name: true, email: true, phone: true },
      take: 500,
    });

    for (const cust of customers) {
      if (cust.name && cust.name.length >= 3) {
        entities.push(...findAllOccurrences(text, lowerText, cust.name, 'name', 0.95));

        const parts = cust.name.split(/\s+/).filter(p => p.length >= 3);
        if (parts.length > 1) {
          for (const part of parts) {
            entities.push(...findAllOccurrences(text, lowerText, part, 'name', 0.85));
          }
        }
      }
      if (cust.email && cust.email.length >= 5) {
        entities.push(...findAllOccurrences(text, lowerText, cust.email, 'email', 0.98));
      }
    }
  } catch {
    // DB nicht verfuegbar – nur Regex
  }

  return entities;
}

const CAP_NAME = '[A-ZÀ-Ž][a-zà-žß]+';
const NAME_GROUP = `(${CAP_NAME}(?:[ ]+${CAP_NAME}){0,2})`;

const CONTEXT_NAME_PATTERNS: RegExp[] = [
  // DE – Anrede (gleiche Zeile)
  new RegExp(`(?:Herr|Frau)[ ]+${NAME_GROUP}`, 'g'),
  new RegExp(`z\\.?\\s*(?:Hd|HD)\\.?\\s*(?:(?:Herr|Frau)[ ]+)?${NAME_GROUP}`, 'g'),
  new RegExp(`(?:Hallo|Hi|Hey)[ ]+(${CAP_NAME})`, 'g'),
  // DE – Grußformel (darf Zeilenumbruch enthalten)
  new RegExp(`(?:Grüße|Gruß|Gruss|Viele\\s+Grüße|Liebe\\s+Grüße|Mit\\s+freundlichen\\s+Grüßen)[,\\n]\\s*(${CAP_NAME})`, 'gi'),
  // EN – salutation (same line)
  new RegExp(`(?:Mr\\.?|Mrs\\.?|Ms\\.?|Miss|Dr\\.?)[ ]+${NAME_GROUP}`, 'g'),
  new RegExp(`(?:Dear|Attn\\.?|Attention:?)[ ]+${NAME_GROUP}`, 'gi'),
  // EN – closing (may cross line)
  new RegExp(`(?:Regards|Best\\s+regards|Kind\\s+regards|Sincerely|Yours\\s+truly|Best\\s+wishes|Cheers)[,\\n]\\s*(${CAP_NAME})`, 'gi'),
  // FR
  new RegExp(`(?:Monsieur|Madame|Mme\\.?|M\\.?)[ ]+${NAME_GROUP}`, 'g'),
  new RegExp(`(?:Cordialement|Bien\\s+cordialement|Salutations)[,\\n]\\s*(${CAP_NAME})`, 'gi'),
  // ES
  new RegExp(`(?:Señor|Señora|Sr\\.?|Sra\\.?|Estimado|Estimada)[ ]+${NAME_GROUP}`, 'gi'),
  new RegExp(`(?:Saludos|Atentamente|Cordialmente)[,\\n]\\s*(${CAP_NAME})`, 'gi'),
  // IT
  new RegExp(`(?:Signor|Signora|Sig\\.?|Sig\\.ra)[ ]+${NAME_GROUP}`, 'g'),
  new RegExp(`(?:Cordiali\\s+saluti|Distinti\\s+saluti)[,\\n]\\s*(${CAP_NAME})`, 'gi'),
  // NL
  new RegExp(`(?:Geachte|Heer|Mevrouw)[ ]+${NAME_GROUP}`, 'g'),
  new RegExp(`(?:Met\\s+vriendelijke\\s+groet|Groeten)[,\\n]\\s*(${CAP_NAME})`, 'gi'),
  // SE/DK/NO
  new RegExp(`(?:Herr|Fru|Hälsningar|Vänliga\\s+hälsningar)[,\\n]\\s*(${CAP_NAME})`, 'gi'),
];

function runContextNameScan(text: string): ExtractedEntity[] {
  const entities: ExtractedEntity[] = [];
  for (const pattern of CONTEXT_NAME_PATTERNS) {
    const re = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      const name = match[1];
      const nameStart = match[0].lastIndexOf(name);
      const absoluteStart = match.index + nameStart;
      entities.push({
        type: 'name',
        text: name,
        start: absoluteStart,
        end: absoluteStart + name.length,
        confidence: 0.8,
        source: 'regex',
        pii: true,
      });
    }
  }
  return entities;
}

const CONTEXT_CITY_PATTERNS: RegExp[] = [
  /\baus\s+([A-ZÀ-Ž][a-zà-žß]{2,})\b/g,
  /\bfrom\s+([A-ZÀ-Ž][a-zà-žß]{2,})\b/g,
  /\bde\s+([A-ZÀ-Ž][a-zà-žß]{2,})\b/g,
  /\bda\s+([A-ZÀ-Ž][a-zà-žß]{2,})\b/g,
  /\buit\s+([A-ZÀ-Ž][a-zà-žß]{2,})\b/g,
  /\bfrån\s+([A-ZÀ-Ž][a-zà-žß]{2,})\b/g,
];

function runContextCityScan(text: string): ExtractedEntity[] {
  const entities: ExtractedEntity[] = [];
  for (const pattern of CONTEXT_CITY_PATTERNS) {
    const re = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      const city = match[1];
      const cityStart = match.index + match[0].indexOf(city);
      entities.push({
        type: 'address',
        text: city,
        start: cityStart,
        end: cityStart + city.length,
        confidence: 0.7,
        source: 'regex',
        pii: true,
      });
    }
  }
  return entities;
}

export async function extractEntities(
  inputText: string,
  inputHtml?: string | null,
): Promise<ExtractedEntity[]> {
  const text = normalize(inputText) || normalize(inputHtml);
  if (!text || text.length < 5) return [];

  const regexEntities = runRegexScan(text);
  const dbEntities = await runDbMatch(text);
  const contextNames = runContextNameScan(text);
  const contextCities = runContextCityScan(text);

  return deduplicate([...dbEntities, ...contextNames, ...contextCities, ...regexEntities]);
}

export async function extractAndStore(mailId: string, text?: string | null, html?: string | null): Promise<ExtractedEntity[]> {
  const entities = await extractEntities(text || '', html);

  await prisma.mailExtraction.upsert({
    where: { mailId },
    create: { mailId, entities: entities as unknown as import('@prisma/client').Prisma.InputJsonValue },
    update: { entities: entities as unknown as import('@prisma/client').Prisma.InputJsonValue },
  });

  return entities;
}

export function getPlaintext(text?: string | null, html?: string | null): string {
  return normalize(text) || normalize(html);
}

export function isPiiEntity(entity: ExtractedEntity): boolean {
  return PII_TYPES.has(entity.type);
}
