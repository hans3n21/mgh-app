import type { KnowledgeEntry } from '@prisma/client'

export type PricePromptItem = {
  id: string
  mainCategory: string | null
  category: string
  label: string
  description: string | null
  unit: string | null
  price: number | null
  min: number | null
  max: number | null
  priceText: string | null
  active: boolean
}

export type MatchedPriceItem = {
  item: PricePromptItem
  matchedTerms: string[]
  score: number
  recommendedPriceText?: string
  contextNote?: string
}

type PickguardSize = 'XL' | 'L' | 'M' | 'S'

type PickguardMaterialTier = 'standard' | 'sparkle' | 'special'

const PRICE_INTENT_TERMS = [
  'preis',
  'preise',
  'preisliste',
  'kostet',
  'kosten',
  'angebot',
  'kostenvoranschlag',
  'euro',
  'eur',
  'quote',
  'price',
  'pricing',
  'cost',
]

const PRICE_KNOWLEDGE_CATEGORIES = new Set(['preis', 'preise', 'pricing'])

const STOP_WORDS = new Set([
  'aber',
  'alles',
  'bitte',
  'brief',
  'briefversand',
  'das',
  'der',
  'die',
  'ein',
  'eine',
  'einen',
  'einer',
  'fuer',
  'habe',
  'ich',
  'ist',
  'kann',
  'klein',
  'kleine',
  'kleines',
  'koennen',
  'mal',
  'mit',
  'nach',
  'oder',
  'teil',
  'teile',
  'und',
  'versand',
  'versandkosten',
  'verschicken',
  'was',
  'wie',
  'zu',
])

const PICKGUARD_TERMS = new Set(['pickguard', 'pickguards', 'schlagbrett', 'schlagbretter'])

const PICKGUARD_SIZE_TERMS: Array<{ size: PickguardSize; terms: string[] }> = [
  {
    size: 'XL',
    terms: [
      'xl pickguard',
      'tele deluxe',
      'precision bass',
      'p bass',
      'p-bass',
      'jazzmaster',
      'flying v 67',
      'flying v 67er',
    ],
  },
  {
    size: 'L',
    terms: [
      'l pickguard',
      'yamaha bbp35',
      'yamaha bbp 35',
      'bbp35',
      'bbp 35',
      'stratocaster',
      'strat',
      'telecaster',
      'telecaster standard',
      'jazz bass',
      'duo sonic',
      'melody maker',
    ],
  },
  {
    size: 'M',
    terms: ['m pickguard', 'firebird', 'sg klein', 'explorer', 'flying v 58', 'flying v 58er'],
  },
  {
    size: 'S',
    terms: ['s pickguard', 'les paul', 'es 335', '335', 'gretsch'],
  },
]

export function isPriceQuestion(inputText: string): boolean {
  const normalized = normalizeForPriceMatching(inputText)
  if (inputText.includes('€')) return true
  return PRICE_INTENT_TERMS.some((term) => hasWord(normalized, term))
}

export function isPickguardInquiry(inputText: string): boolean {
  const normalized = normalizeForPriceMatching(inputText)
  const tokens = tokenize(normalized)
  return hasAnyPickguardTerm(expandInputTokens(tokens, normalized))
}

export function matchPriceItems(inputText: string, items: PricePromptItem[], limit = 8): MatchedPriceItem[] {
  const normalizedInput = normalizeForPriceMatching(inputText)
  const inputTokens = expandInputTokens(tokenize(normalizedInput), normalizedInput)

  const scored = items
    .filter((item) => item.active)
    .map((item) => scorePriceItem(item, normalizedInput, inputTokens))
    .filter((hit): hit is MatchedPriceItem => hit !== null)
    .sort((a, b) => b.score - a.score || a.item.label.localeCompare(b.item.label))

  const topScore = scored[0]?.score ?? 0
  const minScore = topScore >= 6 ? topScore - 3 : topScore >= 4 ? 4 : 1

  return scored
    .filter((hit) => hit.score >= minScore)
    .slice(0, limit)
}

export function matchPickguardOfferPrice(inputText: string, items: PricePromptItem[]): MatchedPriceItem | null {
  const normalizedInput = normalizeForPriceMatching(inputText)
  const size = inferPickguardSize(normalizedInput)
  if (!size) return null

  const item = items.find((candidate) => {
    if (!candidate.active) return false
    return normalizeForPriceMatching(candidate.label) === `${size.toLowerCase()} pickguard`
  })
  if (!item) return null

  const tier = inferPickguardMaterialTier(normalizedInput)
  if (!tier) {
    return {
      item,
      matchedTerms: [size],
      score: 50,
      contextNote:
        `Pickguard-Groesse erkannt: ${size} Pickguard. Material/Preisvariante ist nicht eindeutig; verwende keine erfundene Einzelpreiszeile.`,
    }
  }

  const recommendedPriceText = extractPickguardTierPrice(item.priceText, tier)
  if (!recommendedPriceText) {
    return {
      item,
      matchedTerms: [size, tier],
      score: 50,
      contextNote:
        `Pickguard-Groesse ${size} und Materialgruppe ${tier} erkannt, aber kein eindeutiger Preis im PriceItem gefunden.`,
    }
  }

  return {
    item,
    matchedTerms: [size, tier],
    score: 100,
    recommendedPriceText,
    contextNote:
      `Empfohlener Pickguard-Preis: ${size} Pickguard, ${formatPickguardTierLabel(tier)} = ${recommendedPriceText}. ` +
      'Nutze diesen Einzelpreis in der Angebotsmail und liste nicht die ganze Pickguard-Preistabelle auf.',
  }
}

export function isPriceLikeKnowledgeEntry(
  entry: Pick<KnowledgeEntry, 'title' | 'category' | 'keywords'>
): boolean {
  const category = normalizeForPriceMatching(entry.category ?? '')
  if (PRICE_KNOWLEDGE_CATEGORIES.has(category)) return true

  const title = normalizeForPriceMatching(entry.title)
  if (hasWord(title, 'preis') || hasWord(title, 'preise') || hasWord(title, 'preisliste')) {
    return true
  }

  return entry.keywords.some((keyword) => {
    const normalized = normalizeForPriceMatching(keyword)
    return hasWord(normalized, 'preis') || hasWord(normalized, 'preise') || hasWord(normalized, 'kosten')
  })
}

export function formatPriceItem(item: PricePromptItem): string {
  if (item.priceText?.trim()) return item.priceText.trim()

  const unit = item.unit?.trim() || 'EUR'
  if (item.min !== null && item.max !== null) return `${item.min}-${item.max} ${unit}`
  if (item.min !== null) return `ab ${item.min} ${unit}`
  if (item.max !== null) return `bis ${item.max} ${unit}`
  if (item.price !== null) return `${item.price} ${unit}`

  return 'Preis auf Anfrage'
}

function scorePriceItem(
  item: PricePromptItem,
  normalizedInput: string,
  inputTokens: Set<string>
): MatchedPriceItem | null {
  const itemParts = [
    item.mainCategory,
    item.category,
    item.label,
    item.description,
    item.priceText,
  ].filter(Boolean)

  const normalizedItem = normalizeForPriceMatching(itemParts.join(' '))
  const matchedTerms = new Set<string>()
  let score = 0

  const normalizedLabel = normalizeForPriceMatching(item.label)
  if (normalizedLabel && normalizedInput.includes(normalizedLabel)) {
    score += 8
    matchedTerms.add(item.label)
  }

  const normalizedCategory = normalizeForPriceMatching(item.category)
  if (normalizedCategory && normalizedInput.includes(normalizedCategory)) {
    score += 4
    matchedTerms.add(item.category)
  }

  if (item.mainCategory) {
    const normalizedMainCategory = normalizeForPriceMatching(item.mainCategory)
    if (normalizedMainCategory && normalizedInput.includes(normalizedMainCategory)) {
      score += 3
      matchedTerms.add(item.mainCategory)
    }
  }

  for (const token of Array.from(inputTokens)) {
    if (STOP_WORDS.has(token) || PRICE_INTENT_TERMS.includes(token)) continue
    if (hasWord(normalizedItem, token)) {
      score += token.length > 4 ? 2 : 1
      matchedTerms.add(token)
    }

    if (item.description && hasWord(normalizeForPriceMatching(item.description), token)) {
      score += token.length > 4 ? 2 : 1
    }
  }

  score += scorePickguardSize(item, normalizedInput, matchedTerms)

  const isPickguardCategory =
    normalizeForPriceMatching(item.mainCategory ?? '') === 'pickguards' ||
    normalizeForPriceMatching(item.category).includes('pickguard') ||
    normalizeForPriceMatching(item.label).includes('pickguard')

  if (isPickguardCategory && hasAnyPickguardTerm(inputTokens)) {
    score += 2
    matchedTerms.add('pickguard')
  }

  if (score === 0) return null
  return { item, matchedTerms: Array.from(matchedTerms), score }
}

function scorePickguardSize(item: PricePromptItem, normalizedInput: string, matchedTerms: Set<string>) {
  const label = normalizeForPriceMatching(item.label)
  const size = label.match(/^(xl|l|m|s)\s+pickguard$/)?.[1]
  if (!size) return 0

  if (hasWord(normalizedInput, size)) {
    matchedTerms.add(`${size.toUpperCase()} Pickguard`)
    return 8
  }

  return 0
}

function inferPickguardSize(normalizedInput: string): PickguardSize | null {
  const jaguarAsMaterial = isJaguarMaterialContext(normalizedInput)

  for (const candidate of PICKGUARD_SIZE_TERMS) {
    for (const term of candidate.terms) {
      if (hasWord(normalizedInput, term)) return candidate.size
    }
  }

  if (!jaguarAsMaterial && hasWord(normalizedInput, 'jaguar')) return 'L'

  return null
}

// Deckt die auf dein-pickguard.de/materialien gelisteten Materialnamen ab (Stand
// 2026-07-07). Tortoise/Pearl/Special sind auf der Website drei separate Kategorien,
// landen in der Preisliste (PriceItem.priceText) aber alle im selben Tarif -- daher
// hier als eine Gruppe behandelt statt einzeln unterschieden.
function inferPickguardMaterialTier(normalizedInput: string): PickguardMaterialTier | null {
  if (hasWord(normalizedInput, 'sparkle') || hasWord(normalizedInput, 'sparkles')) return 'sparkle'

  if (
    hasWord(normalizedInput, 'tortoise') ||
    hasWord(normalizedInput, 'pearl') ||
    hasWord(normalizedInput, 'special') ||
    hasWord(normalizedInput, 'marble') ||
    hasWord(normalizedInput, 'tiger') ||
    hasWord(normalizedInput, 'mantacore') ||
    hasWord(normalizedInput, 'psychedelic') ||
    hasWord(normalizedInput, 'leopard') ||
    hasWord(normalizedInput, 'koi') ||
    normalizedInput.includes('alu brushed') ||
    isJaguarMaterialContext(normalizedInput)
  ) {
    return 'special'
  }

  if (
    hasWord(normalizedInput, 'standard') ||
    hasWord(normalizedInput, 'schwarz') ||
    hasWord(normalizedInput, 'black') ||
    hasWord(normalizedInput, 'weiss') ||
    hasWord(normalizedInput, 'white') ||
    hasWord(normalizedInput, 'creme') ||
    hasWord(normalizedInput, 'mint') ||
    hasWord(normalizedInput, 'transparent') ||
    normalizedInput.includes('3 lagig') ||
    normalizedInput.includes('3 ply')
  ) {
    return 'standard'
  }

  return null
}

function isJaguarMaterialContext(normalizedInput: string) {
  return /(^|\s)(in|material|farbe|design|optik|dekor|look)\s+jaguar(\s|$)/.test(normalizedInput)
}

function extractPickguardTierPrice(priceText: string | null, tier: PickguardMaterialTier) {
  if (!priceText) return null

  const part = priceText
    .split('|')
    .map((value) => value.trim())
    .find((value) => {
      const normalized = normalizeForPriceMatching(value)
      if (tier === 'special') {
        return hasWord(normalized, 'tortoise') || hasWord(normalized, 'pearl') || hasWord(normalized, 'special')
      }
      return hasWord(normalized, tier)
    })

  if (!part) return null

  const amount = part.match(/(\d+(?:[,.]\d{1,2})?)\s*(?:eur|euro|€|â‚¬)/i)?.[1]
  return amount ? `${amount.replace('.', ',')} EUR` : part
}

function formatPickguardTierLabel(tier: PickguardMaterialTier) {
  if (tier === 'sparkle') return 'Sparkle'
  if (tier === 'special') return 'Tortoise/Pearl/Special'
  return 'Standard'
}

function hasAnyPickguardTerm(tokens: Set<string>) {
  return Array.from(PICKGUARD_TERMS).some((term) => tokens.has(term))
}

function expandInputTokens(tokens: Set<string>, normalizedInput: string) {
  const expanded = new Set(tokens)

  if (tokens.has('schlagbrett') || tokens.has('schlagbretter')) expanded.add('pickguard')
  if (tokens.has('trussrod') || normalizedInput.includes('truss rod')) expanded.add('trussrodcover')
  if (tokens.has('tremolodeckel')) expanded.add('backplate')
  if (tokens.has('pickuprahmen')) expanded.add('rahmen')

  return expanded
}

function tokenize(normalizedText: string) {
  return new Set(
    normalizedText
      .split(/\s+/)
      .map((word) => word.trim())
      .filter((word) => word.length >= 2)
  )
}

function hasWord(normalizedText: string, word: string) {
  return new RegExp(`(^|\\s)${escapeRegex(normalizeForPriceMatching(word))}(\\s|$)`).test(normalizedText)
}

function normalizeForPriceMatching(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/€/g, ' euro ')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
