import type { AiProfile, EmailTemplate } from '@prisma/client'
import { callLLM, getGlobalAiDefaults } from './llm-client'

const TONE_LABELS: Record<string, string> = {
  PROFESSIONAL: 'professionell und sachlich',
  FRIENDLY: 'freundlich und warm',
  CASUAL: 'locker und entspannt',
  SHORT: 'kurz und prägnant',
  EMPATHIC: 'einfühlsam und verständnisvoll',
}

/**
 * Analysiert den Schreibstil aller aktiven Vorlagen eines Postfachs
 * und gibt ein kompaktes Stil-Profil als Text zurück.
 * Wird einmalig aufgerufen wenn Vorlagen geändert werden.
 */
export async function analyzeStyle(
  templates: EmailTemplate[],
  profile: AiProfile
): Promise<string> {
  const activeTemplates = templates.filter(t => t.isActive)

  if (activeTemplates.length === 0) {
    throw new Error('Keine aktiven Vorlagen für die Stil-Analyse vorhanden.')
  }

  const examplesText = activeTemplates
    .map((t, i) => `Vorlage ${i + 1} – ${t.name}:\n${t.body}`)
    .join('\n\n---\n\n')

  const tonLabel = TONE_LABELS[profile.tone] ?? 'professionell'

  const systemPrompt =
    'Du bist ein Schreibstil-Analyst. Antworte ausschließlich auf Deutsch.'

  const userPrompt =
    `Analysiere den Schreibstil dieser E-Mail-Vorlagen und beschreibe ihn in 5-8 prägnanten Sätzen.\n` +
    `Achte auf: Anrede (Du/Sie), Tonalität, typische Formulierungen, Satzlänge, Formalitätsgrad, Grußformeln, besondere Sprachmerkmale.\n` +
    `Der gewünschte Grundton ist: ${tonLabel}\n\n` +
    `${examplesText}`

  // Globale Defaults als Fallback wenn AiProfile keine eigenen Werte hat
  const defaults = await getGlobalAiDefaults()

  return callLLM({
    systemPrompt,
    userPrompt,
    provider: profile.preferredProvider || defaults.provider,
    model: profile.preferredModel || defaults.model,
    apiKey: profile.apiKey ?? undefined,
    maxTokens: 400,
  })
}
