// Versandkosten-Vorschlag aus der Preisliste (mainCategory "Versand").
// Die Zonenpreise pflegt das Team als Freitext ("18 EUR | versandkostenfrei ab
// 150 EUR Warenwert") — hier werden sie geparst und über das Kundenland auf
// die passende Versandzone gemappt. Liefert bewusst null statt einer Schätzung,
// wenn etwas nicht eindeutig ist: dann bleibt das Feld reine Handeingabe.

export type ShippingZone = 'de' | 'eu1' | 'eu2' | 'world';

export type ShippingPriceItemLike = {
  category?: string | null;
  label?: string | null;
  priceText?: string | null;
};

export type ShippingSuggestion = {
  cents: number;
  zoneLabel: string;
  /** Label des getroffenen Preislisten-Eintrags (für Tooltip/Nachvollziehbarkeit) */
  source: string;
  /** Gesetzt, wenn wegen Freigrenze oder "kostenlos" 0 € vorgeschlagen wird */
  freeReason?: string;
};

const ZONE_LABEL: Record<ShippingZone, string> = {
  de: 'Deutschland',
  eu1: 'EU Zone 1',
  eu2: 'Nicht-EU Zone 2',
  world: 'Weltweit Zone 3',
};

// ISO-Codes und gebräuchliche deutsche/englische Namen, normalisiert
// (Großschreibung, ohne Umlaute) — die Kundendaten enthalten beides
// ("DE", "PL", "SCHWEIZ", "Österreich").
const DE_TERMS = new Set(['DE', 'DEU', 'DEUTSCHLAND', 'GERMANY']);

const EU_TERMS = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'GR', 'HU', 'IE',
  'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
  'OSTERREICH', 'AUSTRIA', 'BELGIEN', 'BULGARIEN', 'KROATIEN', 'ZYPERN',
  'TSCHECHIEN', 'DANEMARK', 'ESTLAND', 'FINNLAND', 'FRANKREICH', 'GRIECHENLAND',
  'UNGARN', 'IRLAND', 'ITALIEN', 'LETTLAND', 'LITAUEN', 'LUXEMBURG', 'MALTA',
  'NIEDERLANDE', 'HOLLAND', 'POLEN', 'PORTUGAL', 'RUMANIEN', 'SLOWAKEI',
  'SLOWENIEN', 'SPANIEN', 'SCHWEDEN',
]);

const EU2_TERMS = new Set([
  'CH', 'CHE', 'GB', 'UK', 'NO', 'LI', 'IS', 'RS', 'BA', 'ME', 'MK', 'AL', 'UA', 'MD',
  'SCHWEIZ', 'SWITZERLAND', 'NORWEGEN', 'NORWAY', 'GROSSBRITANNIEN', 'ENGLAND',
  'UNITED KINGDOM', 'ISLAND', 'LIECHTENSTEIN', 'SERBIEN', 'BOSNIEN', 'MONTENEGRO',
  'NORDMAZEDONIEN', 'ALBANIEN', 'UKRAINE', 'MOLDAU',
]);

function normalizeCountry(raw: string): string {
  return raw
    .trim()
    .replace(/ß/g, 'ss')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export function shippingZoneForCountry(countryRaw: string | null | undefined): ShippingZone | null {
  if (!countryRaw || !countryRaw.trim()) return null;
  const country = normalizeCountry(countryRaw);
  if (DE_TERMS.has(country)) return 'de';
  if (EU_TERMS.has(country)) return 'eu1';
  if (EU2_TERMS.has(country)) return 'eu2';
  return 'world';
}

/** Erste Zahl vor "EUR" im Freitext, z. B. "6,95 EUR" oder "18 EUR | …" */
function parseEurCents(priceText: string): number | null {
  if (/kostenlos/i.test(priceText)) return 0;
  const match = priceText.match(/(\d+(?:[.,]\d{1,2})?)\s*EUR/i);
  if (!match) return null;
  const value = Number.parseFloat(match[1].replace(',', '.'));
  return Number.isFinite(value) ? Math.round(value * 100) : null;
}

/** "versandkostenfrei ab 150 EUR Warenwert" → 15000 Cent, sonst null */
function parseFreeThresholdCents(priceText: string): number | null {
  const match = priceText.match(/versandkostenfrei ab\s+(\d+(?:[.,]\d{1,2})?)\s*EUR/i);
  if (!match) return null;
  const value = Number.parseFloat(match[1].replace(',', '.'));
  return Number.isFinite(value) ? Math.round(value * 100) : null;
}

/** Zonen-Erkennung über das Eintrags-Label ("… Deutschland", "… Versandzone 2") */
function zoneOfPriceItem(label: string): ShippingZone | null {
  if (/versandzone\s*1/i.test(label)) return 'eu1';
  if (/versandzone\s*2/i.test(label)) return 'eu2';
  if (/versandzone\s*3/i.test(label)) return 'world';
  if (/deutschland/i.test(label)) return 'de';
  return null;
}

export function suggestShipping(
  priceItems: ShippingPriceItemLike[],
  opts: { country?: string | null; orderType?: string | null; finalAmountCents?: number | null }
): ShippingSuggestion | null {
  const zone = shippingZoneForCountry(opts.country);
  if (!zone) return null;

  // Komplette Gitarren reisen im Gitarrenkarton, alles andere als Klein-Paket.
  const wantedCategory = opts.orderType === 'GUITAR' ? 'Gitarrenversand' : 'Versandkosten';

  const item = priceItems.find(
    (p) =>
      (p.category ?? '') === wantedCategory &&
      p.priceText &&
      zoneOfPriceItem(p.label ?? '') === zone
  );
  if (!item || !item.priceText) return null;

  const cents = parseEurCents(item.priceText);
  if (cents == null) return null;

  const suggestion: ShippingSuggestion = {
    cents,
    zoneLabel: ZONE_LABEL[zone],
    source: item.label ?? wantedCategory,
  };

  if (cents === 0) {
    suggestion.freeReason = 'laut Preisliste kostenlos';
    return suggestion;
  }

  const threshold = parseFreeThresholdCents(item.priceText);
  if (
    threshold != null &&
    opts.finalAmountCents != null &&
    opts.finalAmountCents >= threshold
  ) {
    return {
      ...suggestion,
      cents: 0,
      freeReason: `versandkostenfrei ab ${(threshold / 100).toLocaleString('de-DE')} € Warenwert`,
    };
  }

  return suggestion;
}
