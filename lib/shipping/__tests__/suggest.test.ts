import { describe, expect, it } from 'vitest';
import { shippingZoneForCountry, suggestShipping } from '../suggest';

// Reale Einträge aus der Preisliste (Stand Prod-DB) — die Tests sichern das
// Freitext-Parsing gegen genau diese Formate ab.
const PRICE_ITEMS = [
  { category: 'Versandkosten', label: 'Porto/Verpackung Deutschland', priceText: '6,95 EUR' },
  { category: 'Versandkosten', label: 'Porto/Verpackung EU Versandzone 1', priceText: '18 EUR | versandkostenfrei ab 150 EUR Warenwert' },
  { category: 'Versandkosten', label: 'Porto/Verpackung Europa Nicht-EU Versandzone 2', priceText: '38 EUR | versandkostenfrei ab 150 EUR Warenwert' },
  { category: 'Versandkosten', label: 'Porto/Verpackung Weltweit Versandzone 3', priceText: '48 EUR | keine Freigrenze hinterlegt' },
  { category: 'Gitarrenversand', label: 'Gitarrenversand Deutschland', priceText: 'kostenlos bis 25.000 EUR Versicherungswert' },
  { category: 'Gitarrenversand', label: 'Gitarrenversand EU Versandzone 1', priceText: '60 EUR bis 3.000 EUR Versicherungswert' },
  { category: 'Gitarrenversand', label: 'Gitarrenversand Europa Nicht-EU Versandzone 2', priceText: '79 EUR bis 3.000 EUR Versicherungswert' },
  { category: 'Gitarrenversand', label: 'Gitarrenversand Weltweit Versandzone 3', priceText: '106 EUR bis 3.000 EUR Versicherungswert' },
];

describe('shippingZoneForCountry', () => {
  it('erkennt ISO-Codes und Ländernamen', () => {
    expect(shippingZoneForCountry('DE')).toBe('de');
    expect(shippingZoneForCountry('Deutschland')).toBe('de');
    expect(shippingZoneForCountry('PL')).toBe('eu1');
    expect(shippingZoneForCountry('Österreich')).toBe('eu1');
    expect(shippingZoneForCountry('SCHWEIZ')).toBe('eu2');
    expect(shippingZoneForCountry('ch')).toBe('eu2');
    expect(shippingZoneForCountry('US')).toBe('world');
    expect(shippingZoneForCountry('Japan')).toBe('world');
  });

  it('liefert null ohne Länderangabe', () => {
    expect(shippingZoneForCountry(null)).toBeNull();
    expect(shippingZoneForCountry('  ')).toBeNull();
  });
});

describe('suggestShipping', () => {
  it('Klein-Paket Deutschland: 6,95 €', () => {
    const s = suggestShipping(PRICE_ITEMS, { country: 'DE', orderType: 'PICKGUARD' });
    expect(s).toMatchObject({ cents: 695, zoneLabel: 'Deutschland' });
  });

  it('Klein-Paket EU Zone 1 (Ländername): 18 €', () => {
    const s = suggestShipping(PRICE_ITEMS, { country: 'Österreich', orderType: 'NECK', finalAmountCents: 10000 });
    expect(s).toMatchObject({ cents: 1800, zoneLabel: 'EU Zone 1' });
  });

  it('Freigrenze: ab 150 € Warenwert versandkostenfrei', () => {
    const s = suggestShipping(PRICE_ITEMS, { country: 'PL', orderType: 'PICKGUARD', finalAmountCents: 15000 });
    expect(s?.cents).toBe(0);
    expect(s?.freeReason).toContain('versandkostenfrei ab 150');
  });

  it('Nicht-EU Zone 2 (Schweiz): 38 €, unter Freigrenze', () => {
    const s = suggestShipping(PRICE_ITEMS, { country: 'SCHWEIZ', orderType: 'PICKUPS', finalAmountCents: 9900 });
    expect(s).toMatchObject({ cents: 3800, zoneLabel: 'Nicht-EU Zone 2' });
  });

  it('Gitarre Deutschland: kostenlos', () => {
    const s = suggestShipping(PRICE_ITEMS, { country: 'DE', orderType: 'GUITAR' });
    expect(s?.cents).toBe(0);
    expect(s?.freeReason).toBeTruthy();
  });

  it('Gitarre weltweit: 106 € (Freigrenze der Klein-Pakete greift NICHT)', () => {
    const s = suggestShipping(PRICE_ITEMS, { country: 'USA', orderType: 'GUITAR', finalAmountCents: 500000 });
    expect(s).toMatchObject({ cents: 10600, zoneLabel: 'Weltweit Zone 3' });
  });

  it('null ohne Land oder ohne passenden Preiseintrag', () => {
    expect(suggestShipping(PRICE_ITEMS, { country: null, orderType: 'GUITAR' })).toBeNull();
    expect(suggestShipping([], { country: 'DE', orderType: 'GUITAR' })).toBeNull();
  });
});
