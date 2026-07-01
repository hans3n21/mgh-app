import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { matchKnowledgeEntries } from '@/lib/ai/keyword-matcher'
import { loadKnowledgeForPrompt } from '@/lib/ai/knowledge-context'
import {
  isPickguardInquiry,
  isPriceLikeKnowledgeEntry,
  isPriceQuestion,
  matchPickguardOfferPrice,
  matchPriceItems,
  type MatchedPriceItem,
  type PricePromptItem,
} from '@/lib/ai/price-matcher'
import { buildPrompt, estimateTokenCount } from '@/lib/ai/prompt-builder'
import { callLLM, getGlobalAiDefaults } from '@/lib/ai/llm-client'
import { anonymizeText, deanonymizeText } from '@/lib/pii/anonymize'
import { injectCompanyData } from '@/lib/ai/post-processor'
import type { PromptAction } from '@/lib/ai/prompt-builder'

// Einfaches In-Memory Rate Limiting: max 20 Calls pro Minute pro User
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT = 20
const RATE_WINDOW_MS = 60_000

function normalizePriceContext(value: string | null | undefined) {
  return (value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
}

function priceItemText(item: PricePromptItem) {
  return normalizePriceContext(
    [item.mainCategory, item.category, item.label, item.description, item.priceText]
      .filter(Boolean)
      .join(' ')
  )
}

function isPickguardSizePriceItem(item: PricePromptItem) {
  return /^(xl|l|m|s)\s+pickguard$/.test(normalizePriceContext(item.label))
}

function addContextPriceHit(
  hits: MatchedPriceItem[],
  items: PricePromptItem[],
  predicate: (text: string) => boolean,
  matchedTerm: string
) {
  const existingIds = new Set(hits.map((hit) => hit.item.id))
  const item = items.find((candidate) => candidate.active && predicate(priceItemText(candidate)))
  if (!item || existingIds.has(item.id)) return hits
  return [...hits, { item, matchedTerms: [matchedTerm], score: 1 }]
}

function hasAnyNormalizedTerm(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term))
}

function getShippingZoneForText(text: string) {
  const normalized = normalizePriceContext(text)

  if (
    hasAnyNormalizedTerm(normalized, [
      'weltweit',
      'worldwide',
      'usa',
      'kanada',
      'canada',
      'australien',
      'australia',
      'neuseeland',
      'new zealand',
      'japan',
      'china',
      'overseas',
      'international',
    ])
  ) {
    return 'worldwide' as const
  }

  if (
    hasAnyNormalizedTerm(normalized, [
      'schweiz',
      'switzerland',
      'norwegen',
      'norway',
      'uk',
      'united kingdom',
      'grossbritannien',
      'england',
      'liechtenstein',
      'nicht eu',
      'non eu',
    ])
  ) {
    return 'europe-non-eu' as const
  }

  if (
    hasAnyNormalizedTerm(normalized, [
      'eu ',
      'eu-',
      'european union',
      'oesterreich',
      'osterreich',
      'austria',
      'frankreich',
      'france',
      'belgien',
      'belgium',
      'niederlande',
      'netherlands',
      'daenemark',
      'denmark',
      'italien',
      'italy',
      'spanien',
      'spain',
      'polen',
      'poland',
      'schweden',
      'sweden',
      'finnland',
      'finland',
      'irland',
      'ireland',
      'portugal',
      'tschechien',
      'czech',
      'slowakei',
      'slovakia',
      'slowenien',
      'slovenia',
      'ungarn',
      'hungary',
      'rumaenien',
      'romania',
      'bulgarien',
      'bulgaria',
      'kroatien',
      'croatia',
      'griechenland',
      'greece',
      'luxemburg',
      'luxembourg',
      'estland',
      'estonia',
      'lettland',
      'latvia',
      'litauen',
      'lithuania',
      'malta',
      'zypern',
      'cyprus',
    ])
  ) {
    return 'eu' as const
  }

  return 'germany' as const
}

function addPickguardOfferPriceContext(hits: MatchedPriceItem[], items: PricePromptItem[], lookupText: string) {
  let enriched = hits
  const shippingZone = getShippingZoneForText(lookupText)

  enriched = addContextPriceHit(
    enriched,
    items,
    (text) => {
      if (!text.includes('porto')) return false
      if (shippingZone === 'worldwide') return text.includes('weltweit')
      if (shippingZone === 'europe-non-eu') return text.includes('nicht eu')
      if (shippingZone === 'eu') return text.includes('eu') && text.includes('versandzone 1')
      return text.includes('deutschland')
    },
    `porto-${shippingZone}`
  )

  if (shippingZone === 'germany') {
    enriched = addContextPriceHit(
      enriched,
      items,
      (text) => text.includes('versandmarke') && text.includes('deutschland'),
      'versandmarke-deutschland'
    )
  }

  return enriched
}

function checkRateLimit(userId: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(userId)

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return true
  }

  if (entry.count >= RATE_LIMIT) {
    return false
  }

  entry.count++
  return true
}

const VALID_ACTIONS: PromptAction[] = ['rewrite', 'translate', 'summarize', 'cleanup', 'template_reply']

const PREVIEW_INPUT =
  'Sehr geehrte Damen und Herren, ich möchte mich nach dem Status meiner Bestellung #12345 erkundigen. ' +
  'Können Sie mir sagen wann die Lieferung erfolgt? Mit freundlichen Grüßen, Thomas Müller'

function addPromptToken(tokenMap: Record<string, string>, label: string, value?: string) {
  const trimmed = value?.trim()
  if (!trimmed) return undefined

  let index = 1
  let placeholder = `{{${label}_${index}}}`
  while (tokenMap[placeholder]) {
    index += 1
    placeholder = `{{${label}_${index}}}`
  }

  tokenMap[placeholder] = trimmed
  return placeholder
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
  }

  if (!checkRateLimit(session.user.id)) {
    return NextResponse.json(
      { error: 'Rate-Limit überschritten. Bitte warte eine Minute.' },
      { status: 429 }
    )
  }

  let body: {
    mailAccountId?: string
    action?: string
    inputText?: string
    targetLanguage?: string
    templateKey?: string
    customerName?: string
    originalMail?: string
    mailId?: string          // für PII-Anonymisierung
    isPreview?: boolean
  }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger Request-Body' }, { status: 400 })
  }

  const { mailAccountId, targetLanguage, templateKey, customerName, originalMail, mailId, isPreview } = body
  let { action, inputText } = body

  if (!mailAccountId) {
    return NextResponse.json({ error: 'mailAccountId fehlt' }, { status: 400 })
  }

  // Preview-Modus: festen Text + action überschreiben
  if (isPreview) {
    inputText = PREVIEW_INPUT
    action = 'template_reply'
  }

  if (!inputText?.trim()) {
    return NextResponse.json({ error: 'inputText fehlt oder leer' }, { status: 400 })
  }

  if (!action || !VALID_ACTIONS.includes(action as PromptAction)) {
    return NextResponse.json(
      { error: `Ungültige action. Erlaubt: ${VALID_ACTIONS.join(', ')}` },
      { status: 400 }
    )
  }

  const lookupText = `${inputText} ${originalMail ?? ''} ${templateKey ?? ''}`
  const hasExplicitPriceQuestion = isPriceQuestion(lookupText)
  const shouldPreparePickguardOffer =
    action === 'template_reply' &&
    isPickguardInquiry(lookupText) &&
    !/absage|ablehn|leider\s+nicht/i.test(templateKey ?? '')
  const shouldLookupPrices = !isPreview && (hasExplicitPriceQuestion || shouldPreparePickguardOffer)

  const priceItemsPromise: Promise<PricePromptItem[]> = shouldLookupPrices
    ? prisma.priceItem.findMany({
        where: { active: true },
        orderBy: [
          { mainCategory: 'asc' },
          { category: 'asc' },
          { label: 'asc' },
        ],
        select: {
          id: true,
          mainCategory: true,
          category: true,
          label: true,
          description: true,
          unit: true,
          price: true,
          min: true,
          max: true,
          priceText: true,
          active: true,
        },
      })
    : Promise.resolve([])

  // Daten laden
  const [aiProfile, mailAccountProfile, emailTemplates, knowledgeEntries, companyData, priceItems] = await Promise.all([
    prisma.aiProfile.findUnique({ where: { mailAccountId } }),
    prisma.mailAccountProfile.findUnique({
      where: { mailAccountId },
      select: { aiSystemPrompt: true, backgroundInfo: true },
    }),
    prisma.emailTemplate.findMany({
      where: { mailAccountId, isActive: true },
      orderBy: { sortOrder: 'asc' },
    }),
    loadKnowledgeForPrompt(prisma, mailAccountId),
    prisma.companyData.findMany({
      where: { mailAccountId },
      orderBy: { sortOrder: 'asc' },
      select: { key: true, value: true, isSecret: true },
    }),
    priceItemsPromise,
  ])

  if (!aiProfile) {
    return NextResponse.json(
      { error: 'Kein AI-Profil für dieses Postfach konfiguriert' },
      { status: 404 }
    )
  }

  // Keyword-Matching (außer im Preview-Modus)
  const rawKnowledgeHits = isPreview
    ? []
    : matchKnowledgeEntries(lookupText, knowledgeEntries)

  let priceHits = shouldLookupPrices
    ? matchPriceItems(lookupText, priceItems)
    : []

  if (shouldPreparePickguardOffer) {
    const pickguardRecommendation = matchPickguardOfferPrice(lookupText, priceItems)
    if (pickguardRecommendation) {
      priceHits = [
        pickguardRecommendation,
        ...priceHits.filter((hit) => !isPickguardSizePriceItem(hit.item)),
      ]
    }
    priceHits = addPickguardOfferPriceContext(priceHits, priceItems, lookupText)
  }

  const knowledgeHits = shouldLookupPrices
    ? rawKnowledgeHits.filter((hit) => !isPriceLikeKnowledgeEntry(hit.entry))
    : rawKnowledgeHits

  // Template-Auswahl für Few-Shot
  let selectedTemplates = emailTemplates
  if (action === 'template_reply' && templateKey) {
    const primary = emailTemplates.find(t => t.key === templateKey)
    selectedTemplates = primary ? [primary] : emailTemplates.slice(0, 1)
  } else {
    selectedTemplates = emailTemplates.slice(0, 3)
  }

  // ── PII-Anonymisierung ───────────────────────────────────────────────
  // Ersetze echte Namen/E-Mails/Adressen durch Platzhalter ({{NAME_1}} etc.)
  // bevor der Text an den externen LLM gesendet wird.
  const effectiveMailId = isPreview ? null : (mailId ?? null)

  const [anonymizedInput, anonymizedOriginal] = await Promise.all([
    anonymizeText(inputText, effectiveMailId),
    originalMail ? anonymizeText(originalMail, effectiveMailId) : Promise.resolve(null),
  ])

  // Merged TokenMap aus beiden Texten (damit Rehydrierung vollständig ist)
  const mergedTokenMap = {
    ...anonymizedInput.tokenMap,
    ...(anonymizedOriginal?.tokenMap ?? {}),
  }
  const anonymizedCustomerName = addPromptToken(mergedTokenMap, 'NAME', customerName)

  const { systemPrompt, userPrompt } = buildPrompt({
    action: action as PromptAction,
    inputText: anonymizedInput.anonymizedText,
    profile: aiProfile,
    mailAccountProfile: mailAccountProfile ?? undefined,
    companyData: companyData ?? [],
    templates: selectedTemplates,
    knowledgeHits,
    priceHits,
    isPriceQuestion: shouldLookupPrices,
    targetLanguage,
    customerName: anonymizedCustomerName,
    originalMail: anonymizedOriginal?.anonymizedText,
    templateKey,
  })

  const maxTokens = isPreview ? 300 : 1200

  try {
    const globalDefaults = await getGlobalAiDefaults()

    const rawResult = await callLLM({
      systemPrompt,
      userPrompt,
      provider: aiProfile.preferredProvider || globalDefaults.provider,
      model: aiProfile.preferredModel || globalDefaults.model,
      apiKey: aiProfile.apiKey ?? undefined,
      maxTokens,
    })

    // ── CompanyData-Injektion ─────────────────────────────────────────
    // Firmendaten-Platzhalter ({firmen_key}) durch echte Werte ersetzen —
    // passiert lokal, echte Daten verlassen niemals die App
    const injected = injectCompanyData(rawResult, companyData ?? [])

    // ── Rehydrierung ──────────────────────────────────────────────────
    // PII-Platzhalter in der KI-Antwort wieder durch Originaldaten ersetzen
    const result = deanonymizeText(injected, mergedTokenMap)

    const tokensUsed = estimateTokenCount(systemPrompt + userPrompt + rawResult)

    return NextResponse.json({
      result,
      tokensUsed,
      knowledgeHits: knowledgeHits.map(h => h.entry.title),
      priceHits: priceHits.map(h => h.item.label),
      piiAnonymized: Object.keys(mergedTokenMap).length > 0,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unbekannter Fehler'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
