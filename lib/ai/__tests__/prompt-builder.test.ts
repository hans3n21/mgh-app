import type { AiProfile, EmailTemplate } from '@prisma/client'
import { describe, expect, it } from 'vitest'
import { buildPrompt } from '../prompt-builder'
import type { MatchedPriceItem } from '../price-matcher'

function profile(): AiProfile {
  return {
    businessContext: 'MGH Guitars / Dein-Pickguard',
    generatedStyleProfile: null,
    customInstructions: null,
    tone: 'FRIENDLY',
    formality: 'DU',
  } as unknown as AiProfile
}

function template(): EmailTemplate {
  return {
    key: 'pickguard-angebot-standard',
    name: 'Pickguard Angebot Standard',
    body:
      'Hallo [Name],\n\nich fasse nochmal zusammen:\nPickguard fuer [Modell/Instrument]\nMaterial/Design: [Material/Design]\n\n' +
      'diese Customfertigung kostet [passender Pickguard-Preis aus PriceItem] zzgl. [passende Versandkosten aus PriceItem] Porto/Verpackung.',
  } as unknown as EmailTemplate
}

function priceHit(label: string, priceText: string, contextNote?: string): MatchedPriceItem {
  return {
    item: {
      id: `price-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      mainCategory: label.includes('Porto') ? 'Versand' : 'Pickguards',
      category: label.includes('Porto') ? 'Versandkosten' : 'Pickguards',
      label,
      description: null,
      unit: null,
      price: null,
      min: null,
      max: null,
      priceText,
      active: true,
    },
    matchedTerms: [label],
    score: 100,
    recommendedPriceText: priceText,
    contextNote,
  }
}

describe('prompt builder', () => {
  it('makes pickguard offer prompts concrete instead of asking checklist questions', () => {
    const { systemPrompt, userPrompt } = buildPrompt({
      action: 'template_reply',
      inputText: 'Yamaha BBP35 Pickguard in Jaguar zuschneiden',
      originalMail: 'Hallo, koennt ihr mir von dem oben aufgefuehrten Bass ein Pickguard in Jaguar zuschneiden?',
      profile: profile(),
      templates: [template()],
      priceHits: [
        priceHit(
          'L Pickguard',
          '149 EUR',
          'Empfohlener Pickguard-Preis: L Pickguard, Tortoise/Pearl/Special = 149 EUR.'
        ),
        priceHit('Porto/Verpackung Deutschland', '6,95 EUR'),
        priceHit('Versandmarke Einsendung Deutschland', 'ab 69 EUR Auftragswert moeglich'),
      ],
      isPriceQuestion: true,
      customerName: '{{NAME_1}}',
      templateKey: 'pickguard-angebot-standard',
    })

    expect(systemPrompt).toContain('Festes Antwortgeruest fuer Pickguard-Angebote')
    expect(systemPrompt).toContain('Jaguar das Material/Design')
    expect(systemPrompt).toContain('149 EUR')
    expect(systemPrompt).toContain('6,95 EUR')
    expect(systemPrompt).toContain('nicht nach dem Land fragen')
    expect(systemPrompt).toContain('keine offenen Rueckfragen zu Material, Zielland oder Vorlage')
    expect(userPrompt).toContain('Beantworte folgende Kundenmail an {{NAME_1}}')
  })
})
