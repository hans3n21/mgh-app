import type { AiProfile, EmailTemplate } from '@prisma/client'
import type { MatchedEntry } from './keyword-matcher'
import { formatPriceItem, type MatchedPriceItem } from './price-matcher'
import type { CompanyDataEntry } from './post-processor'
import { buildCompanyDataPromptHint } from './post-processor'

export type PromptAction = 'rewrite' | 'translate' | 'summarize' | 'cleanup' | 'template_reply'

/** Legacy-Felder aus MailAccountProfile (Fallback wenn AiProfile leer) */
export type MailAccountProfileLegacy = {
  aiSystemPrompt?: string | null
  backgroundInfo?: string | null
}

export type PromptInput = {
  action: PromptAction
  inputText: string
  profile: AiProfile
  mailAccountProfile?: MailAccountProfileLegacy
  companyData?: CompanyDataEntry[]
  templates?: EmailTemplate[]
  knowledgeHits?: MatchedEntry[]
  priceHits?: MatchedPriceItem[]
  isPriceQuestion?: boolean
  targetLanguage?: string
  customerName?: string
  originalMail?: string
  templateKey?: string
}

const TONE_LABELS: Record<string, string> = {
  PROFESSIONAL: 'professionell und sachlich',
  FRIENDLY: 'freundlich und warm',
  CASUAL: 'locker und entspannt',
  SHORT: 'kurz und prägnant',
  EMPATHIC: 'einfühlsam und verständnisvoll',
}

const FORMALITY_LABELS: Record<string, string> = {
  DU: 'Duze den Kunden (Du/Dein/Dich).',
  SIE: 'Sieze den Kunden (Sie/Ihr/Ihnen).',
  AUTO: 'Passe die Anrede an den Kontext der Nachricht an.',
}

/**
 * Baut den kompletten Prompt für eine AI-Aktion zusammen.
 */
export function buildPrompt(input: PromptInput): {
  systemPrompt: string
  userPrompt: string
} {
  const { action, inputText, profile, mailAccountProfile, companyData, templates, knowledgeHits, priceHits, isPriceQuestion, targetLanguage, customerName, originalMail, templateKey } = input
  const promptContext = [
    inputText,
    originalMail,
    templateKey,
    ...(priceHits ?? []).map((hit) => `${hit.item.label} ${hit.item.category} ${hit.item.mainCategory ?? ''}`),
    ...(knowledgeHits ?? []).map((hit) => `${hit.entry.title} ${hit.entry.category ?? ''}`),
  ].join(' ').toLowerCase()
  const isPickguardContext = promptContext.includes('pickguard') || promptContext.includes('schlagbrett')

  const parts: string[] = []

  // 1. Rolle + Business Context (AiProfile gewinnt, Legacy als Fallback)
  const businessCtx = profile.businessContext?.trim() || mailAccountProfile?.backgroundInfo?.trim()
  if (businessCtx) {
    parts.push(`Du bist ein E-Mail-Assistent für: ${businessCtx}`)
  } else {
    parts.push('Du bist ein E-Mail-Assistent.')
  }

  // 2. Stil-Profil (AiProfile gewinnt, Fallback auf tone/formality)
  if (profile.generatedStyleProfile?.trim()) {
    parts.push(`\nSchreibstil:\n${profile.generatedStyleProfile.trim()}`)
  } else {
    const tonLabel = TONE_LABELS[profile.tone] ?? 'professionell'
    const formalLabel = FORMALITY_LABELS[profile.formality] ?? ''
    parts.push(`\nTon: ${tonLabel}. ${formalLabel}`)
  }

  // 3. Custom Instructions (AiProfile gewinnt, Legacy aiSystemPrompt als Fallback)
  const customInstructions = profile.customInstructions?.trim() || mailAccountProfile?.aiSystemPrompt?.trim()
  if (customInstructions) {
    parts.push(`\nBesondere Anweisungen:\n${customInstructions}`)
  }

  // 4. Preis-Kontext aus PriceItem
  if (priceHits && priceHits.length > 0) {
    const priceText = priceHits
      .map((hit, i) => {
        const categoryPath = [hit.item.mainCategory, hit.item.category].filter(Boolean).join(' / ')
        const description = hit.item.description?.trim() ? ` - ${hit.item.description.trim()}` : ''
        const price = hit.recommendedPriceText ?? formatPriceItem(hit.item)
        const note = hit.contextNote ? `\n   Hinweis: ${hit.contextNote}` : ''
        return `${i + 1}. ${hit.item.label}${categoryPath ? ` (${categoryPath})` : ''}: ${price}${description}${note}`
      })
      .join('\n')

    parts.push(
      `\nAktuelle Preislisten-Eintraege aus PriceItem:\n${priceText}\n` +
      'Verwende fuer konkrete Preise ausschliesslich diese aktiven PriceItem-Eintraege. ' +
      'Leite Preise nicht aus Hintergrundwissen, alten Prompt-Texten oder KnowledgeEntry ab. ' +
      'Wenn die passende Position oder wichtige Details fehlen, frage nach statt einen Preis zu raten.'
    )
  } else if (isPriceQuestion) {
    parts.push(
      '\nEs soll ein Preis- oder Angebotskontext beruecksichtigt werden, aber es wurde keine passende aktive PriceItem-Position gefunden. ' +
      'Nenne keinen geratenen Preis und leite keinen Preis aus KnowledgeEntry ab. Frage nach den fehlenden Details oder verweise auf eine individuelle Pruefung.'
    )
  }

  // 5. Wissens-Kontext
  if (knowledgeHits && knowledgeHits.length > 0) {
    const knowledgeText = knowledgeHits
      .map((hit, i) => `${i + 1}. ${hit.entry.title}:\n${hit.entry.content}`)
      .join('\n\n')
    const knowledgeLabel = isPriceQuestion
      ? 'Nutze folgende Regeln und Ablaeufe wenn relevant, aber nicht als Preisquelle'
      : 'Nutze folgende Informationen wenn relevant'
    parts.push(`\n${knowledgeLabel}:\n${knowledgeText}`)
  }

  if (action === 'template_reply' && isPickguardContext) {
    parts.push(
      '\nFestes Antwortgeruest fuer Pickguard-Angebote:\n' +
      '1. Anrede.\n' +
      '2. Ein kurzer Satz "Ich fasse nochmal zusammen:" mit Modell/Teilwunsch und erkennbarem Material oder Design. Wenn der Kunde "in Jaguar" schreibt, ist Jaguar das Material/Design, nicht automatisch das Instrumentenmodell.\n' +
      '3. Preiszeile: Nenne den passenden Pickguard-Preis aus PriceItem und genau einen passenden Versandkosten-PriceItem. Wenn kein Zielland genannt ist, verwende Deutschland als Standard und formuliere "zzgl. 6,95 EUR Porto/Verpackung (innerhalb Deutschlands)", sofern dieser PriceItem vorhanden ist. EU/Nicht-EU/Weltweit nur nennen, wenn die Kundenmail ein entsprechendes Zielland oder Ausland erkennen laesst. Wenn kein Land genannt ist, nicht nach dem Land fragen und nicht alle Versandzonen aufzaehlen.\n' +
      '4. Standardablauf: altes/defektes Teil einsenden, mit Maschinen abtasten, Schablone erstellen, gewuenschtes Material befestigen, neues Pickguard 1:1 fraesen. Wenn keine Vorlage erwaehnt ist, erklaere diesen Ablauf als naechsten Schritt statt nach einer Vorlage als nummerierte Rueckfrage zu fragen.\n' +
      '5. Versandmarke: Wenn ein Versandmarken-PriceItem vorhanden ist und Deutschland als Versandkontext gilt, als Service anbieten und um Versandadresse bitten, falls der Kunde die Versandmarke moechte. Bei Ausland keine deutsche Versandmarke anbieten.\n' +
      '6. Bitte um Begleitschreiben mit allen Eckdaten in der Lieferung.\n' +
      '7. Kurzer Gruss und rechtlicher Hinweis zu Customfertigungen.\n' +
      'Nicht tun: keine nummerierte Rueckfragenliste, keine offenen Rueckfragen zu Material, Zielland oder Vorlage, wenn die Antwort als Angebot mit Standardablauf geschrieben werden kann. Kein "damit wir ein Angebot erstellen koennen", wenn Preis/Teilwunsch schon ausreichend aus Kontext und PriceItem hervorgehen. Keine Versandkosten ausdenken und keine unpassenden Versandzonen nennen. ' +
      'Wenn der Kunde Formulierungen wie "in Jaguar" nutzt, behandle das als gewuenschtes Material/Design, nicht automatisch als Gitarrenmodell.'
    )
  }

  // 6. Few-Shot Vorlagen
  if (templates && templates.length > 0) {
    const exampleTemplates = templates.slice(0, 3)
    const examplesText = exampleTemplates
      .map((t, i) => `Beispiel ${i + 1} (${t.name}):\n${t.body}`)
      .join('\n\n---\n\n')
    parts.push(`\nOrientiere dich am Stil dieser Beispiel-Mails. Vorlagen sind keine starre Checkliste; uebernimm Rueckfragen nur, wenn sie fuer diese konkrete Kundenmail notwendig sind:\n${examplesText}`)
  }

  // Signatur-Hinweis (Legacy AiProfile-Feld, Fallback wenn keine CompanyData-Signatur)
  const hasSignatureInCompanyData = companyData?.some(e => e.key.startsWith('signatur'))
  if (!hasSignatureInCompanyData && profile.signatureName?.trim()) {
    parts.push(`\nDie Grußformel soll mit "${profile.signatureName}" enden.`)
  }

  // 6. CompanyData: öffentliche Werte einbetten + Platzhalter-Hinweis für alle
  if (companyData && companyData.length > 0) {
    const { placeholderHint, publicValues } = buildCompanyDataPromptHint(companyData)

    if (Object.keys(publicValues).length > 0) {
      const publicText = Object.entries(publicValues)
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n')
      parts.push(`\nFirmendaten (öffentlich):\n${publicText}`)
    }

    if (placeholderHint) {
      parts.push(`\n${placeholderHint}`)
    }
  }

  parts.push('\nAntworte nur mit dem fertigen Mail-Text, ohne Erklärungen oder Metadaten.')

  const systemPrompt = parts.join('')

  // User Prompt je nach Action
  let userPrompt: string
  switch (action) {
    case 'rewrite':
      userPrompt = `Formuliere folgenden Text um:\n\n${inputText}`
      break
    case 'translate':
      userPrompt = `Übersetze folgenden Text ins ${targetLanguage ?? 'Englisch'}, behalte den Ton bei:\n\n${inputText}`
      break
    case 'summarize':
      userPrompt = `Fasse folgenden Text in 2-4 Sätzen zusammen:\n\n${inputText}`
      break
    case 'cleanup':
      userPrompt = `Mach aus diesem eingesprochenen oder stichpunktartigen Text eine saubere, versandfertige Mail:\n\n${inputText}`
      break
    case 'template_reply': {
      const customerLabel = customerName ? ` an ${customerName}` : ''
      const templateLabel = templateKey ? ` Nutze die Vorlage "${templateKey}" als Basis.` : ''
      const mailSection = originalMail
        ? `\n\nKundenmail:\n${originalMail}`
        : `\n\nZu beantwortende Anfrage:\n${inputText}`
      userPrompt = `Beantworte folgende Kundenmail${customerLabel}.${templateLabel}${mailSection}`
      break
    }
    default:
      userPrompt = inputText
  }

  return { systemPrompt, userPrompt }
}

/**
 * Grobe Token-Schätzung (chars / 4).
 */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4)
}
