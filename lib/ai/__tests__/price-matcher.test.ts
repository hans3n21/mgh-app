import { describe, expect, it } from 'vitest'
import {
  formatPriceItem,
  isPickguardInquiry,
  isPriceLikeKnowledgeEntry,
  isPriceQuestion,
  matchPickguardOfferPrice,
  matchPriceItems,
  type PricePromptItem,
} from '../price-matcher'

function item(overrides: Partial<PricePromptItem>): PricePromptItem {
  return {
    id: hasOverride(overrides, 'id') ? overrides.id! : 'price-test',
    mainCategory: hasOverride(overrides, 'mainCategory') ? overrides.mainCategory! : 'Pickguards',
    category: hasOverride(overrides, 'category') ? overrides.category! : 'Pickguards',
    label: hasOverride(overrides, 'label') ? overrides.label! : 'L Pickguard',
    description: hasOverride(overrides, 'description') ? overrides.description! : 'Bsp.: Stratocaster, Jaguar, Telecaster Standard',
    unit: hasOverride(overrides, 'unit') ? overrides.unit! : null,
    price: hasOverride(overrides, 'price') ? overrides.price! : null,
    min: hasOverride(overrides, 'min') ? overrides.min! : null,
    max: hasOverride(overrides, 'max') ? overrides.max! : null,
    priceText: hasOverride(overrides, 'priceText') ? overrides.priceText! : 'Standard 89 EUR | Sparkle 95 EUR | Tortoise/Pearl/Special 129 EUR',
    active: hasOverride(overrides, 'active') ? overrides.active! : true,
  }
}

function hasOverride<T extends keyof PricePromptItem>(overrides: Partial<PricePromptItem>, key: T) {
  return Object.prototype.hasOwnProperty.call(overrides, key)
}

describe('price matcher', () => {
  it('detects price questions', () => {
    expect(isPriceQuestion('Was kostet ein Pickguard?')).toBe(true)
    expect(isPriceQuestion('Bitte ein Angebot fuer ein Schlagbrett')).toBe(true)
    expect(isPriceQuestion('Wie laeuft eine Einsendung ab?')).toBe(false)
  })

  it('detects pickguard inquiries without explicit price wording', () => {
    expect(isPickguardInquiry('Koennt ihr ein Pickguard fuer einen Yamaha BBP35 zuschneiden?')).toBe(true)
    expect(isPickguardInquiry('Ich brauche ein neues Schlagbrett fuer meinen Bass.')).toBe(true)
    expect(isPickguardInquiry('Wie laeuft eine Einsendung fuer einen Hals ab?')).toBe(false)
  })

  it('matches active PriceItems for pickguard questions', () => {
    const hits = matchPriceItems('Was kostet ein Sparkle Pickguard fuer eine Stratocaster?', [
      item({ label: 'L Pickguard' }),
      item({ label: 'XL Pickguard', description: 'Bsp.: Jazzmaster, Flying V 67er' }),
      item({ label: 'Trussrodcover', category: 'Trussrodcover', description: 'Unbedruckt / Bedruckt', priceText: 'Unbedruckt 5 EUR | Bedruckt 20 EUR' }),
      item({ label: 'Inaktiver Preis', active: false }),
    ])

    expect(hits[0].item.label).toBe('L Pickguard')
    expect(hits.map((hit) => hit.item.label)).not.toContain('XL Pickguard')
    expect(hits.map((hit) => hit.item.label)).not.toContain('Inaktiver Preis')
  })

  it('recommends the concrete pickguard offer price for Yamaha BBP35 in Jaguar', () => {
    const hit = matchPickguardOfferPrice('Yamaha BBP35 Pickguard in Jaguar zuschneiden', [
      item({ label: 'L Pickguard', priceText: 'Standard 89 EUR | Sparkle 110 EUR | Tortoise/Pearl/Special 149 EUR' }),
      item({ label: 'XL Pickguard', priceText: 'Standard 149 EUR | Sparkle 169 EUR | Tortoise/Pearl/Special 189 EUR' }),
    ])

    expect(hit?.item.label).toBe('L Pickguard')
    expect(hit?.recommendedPriceText).toBe('149 EUR')
    expect(hit?.contextNote).toContain('Empfohlener Pickguard-Preis')
  })

  it('recommends sparkle prices from the matched pickguard size', () => {
    const hit = matchPickguardOfferPrice('Sparkle Pickguard fuer eine Stratocaster', [
      item({ label: 'L Pickguard', priceText: 'Standard 89 EUR | Sparkle 110 EUR | Tortoise/Pearl/Special 149 EUR' }),
    ])

    expect(hit?.item.label).toBe('L Pickguard')
    expect(hit?.recommendedPriceText).toBe('110 EUR')
  })

  it('does not match product prices for pure shipping cost questions', () => {
    const hits = matchPriceItems('Warum kostet der Versand so viel, koennt ihr ein kleines Teil nicht als Brief verschicken?', [
      item({ label: 'L Pickguard' }),
      item({
        label: 'Body shaped',
        category: 'Bodies',
        mainCategory: 'Guitar Parts',
        description: 'Solid Body ohne Top',
        priceText: '180-220 EUR',
      }),
    ])

    expect(hits).toEqual([])
  })

  it('formats fixed and text prices', () => {
    expect(formatPriceItem(item({ priceText: 'ab 5 EUR' }))).toBe('ab 5 EUR')
    expect(formatPriceItem(item({ priceText: null, price: 15, unit: 'EUR' }))).toBe('15 EUR')
  })

  it('identifies price-list KnowledgeEntry rows', () => {
    expect(
      isPriceLikeKnowledgeEntry({
        title: 'Preise fuer Standard Pickguard',
        category: 'preise',
        keywords: ['Pickguard', 'Preis'],
      })
    ).toBe(true)

    expect(
      isPriceLikeKnowledgeEntry({
        title: 'Ablauf Custom Pickguard',
        category: 'ablauf',
        keywords: ['Einsendung', 'Schablone'],
      })
    ).toBe(false)
  })
})
