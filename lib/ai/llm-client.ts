export type LLMCallOptions = {
  systemPrompt: string
  userPrompt: string
  provider: string
  model: string
  apiKey?: string
  maxTokens?: number
}

/**
 * Provider-agnostischer LLM-Wrapper für OpenAI und Anthropic.
 * Schlüssel-Priorität: 1. übergebener apiKey, 2. Env-Variable, 3. globale SystemSetting
 */
export async function callLLM(options: LLMCallOptions): Promise<string> {
  const { systemPrompt, userPrompt, provider, model, maxTokens = 1000 } = options

  const resolvedKey = options.apiKey?.trim() || getEnvKey(provider) || await getGlobalApiKey(provider)

  if (!resolvedKey) {
    throw new Error(
      `Kein API-Key für Provider "${provider}" konfiguriert. ` +
      `Trage einen Key in den allgemeinen Einstellungen (Einstellungen → KI) ein.`
    )
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)

  try {
    if (provider === 'anthropic') {
      return await callAnthropic({ systemPrompt, userPrompt, model, apiKey: resolvedKey, maxTokens, signal: controller.signal })
    }
    // Default: OpenAI-kompatibel
    return await callOpenAI({ systemPrompt, userPrompt, model, apiKey: resolvedKey, maxTokens, signal: controller.signal })
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('LLM-Anfrage hat das Timeout von 30 Sekunden überschritten.')
    }
    throw err
  } finally {
    clearTimeout(timeout)
  }
}

function getEnvKey(provider: string): string | undefined {
  if (provider === 'anthropic') return process.env.ANTHROPIC_API_KEY
  return process.env.OPENAI_API_KEY
}

/** Liest den global konfigurierten API-Key aus der Datenbank (SystemSetting). */
async function getGlobalApiKey(provider: string): Promise<string | undefined> {
  try {
    // Lazy import um zirkuläre Abhängigkeiten zu vermeiden
    const { prisma } = await import('@/lib/prisma')
    const [providerSetting, keySetting] = await Promise.all([
      prisma.systemSetting.findUnique({ where: { key: 'ai:provider' } }),
      prisma.systemSetting.findUnique({ where: { key: 'ai:apiKey' } }),
    ])
    const globalProvider = providerSetting?.value ?? 'openai'
    if (globalProvider === provider && keySetting?.value) {
      return keySetting.value
    }
  } catch {
    // DB nicht erreichbar → ignorieren
  }
  return undefined
}

/**
 * Gibt den globalen Provider + Modell aus den SystemSettings zurück.
 * Wird genutzt wenn AiProfile keine eigenen Overrides hat.
 */
export async function getGlobalAiDefaults(): Promise<{ provider: string; model: string }> {
  try {
    const { prisma } = await import('@/lib/prisma')
    const settings = await prisma.systemSetting.findMany({
      where: { key: { in: ['ai:provider', 'ai:model'] } },
    })
    const map = Object.fromEntries(settings.map(s => [s.key, s.value]))
    return {
      provider: map['ai:provider'] ?? 'openai',
      model: map['ai:model'] ?? 'gpt-4o-mini',
    }
  } catch {
    return { provider: 'openai', model: 'gpt-4o-mini' }
  }
}

async function callOpenAI(opts: {
  systemPrompt: string
  userPrompt: string
  model: string
  apiKey: string
  maxTokens: number
  signal: AbortSignal
}): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens,
      messages: [
        { role: 'system', content: opts.systemPrompt },
        { role: 'user', content: opts.userPrompt },
      ],
    }),
    signal: opts.signal,
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`OpenAI API Fehler (${res.status}): ${body}`)
  }

  const data = await res.json()
  const content = data?.choices?.[0]?.message?.content
  if (typeof content !== 'string') {
    throw new Error('Ungültige Antwort von OpenAI API.')
  }
  return content.trim()
}

async function callAnthropic(opts: {
  systemPrompt: string
  userPrompt: string
  model: string
  apiKey: string
  maxTokens: number
  signal: AbortSignal
}): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': opts.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens,
      system: opts.systemPrompt,
      messages: [{ role: 'user', content: opts.userPrompt }],
    }),
    signal: opts.signal,
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Anthropic API Fehler (${res.status}): ${body}`)
  }

  const data = await res.json()
  const content = data?.content?.[0]?.text
  if (typeof content !== 'string') {
    throw new Error('Ungültige Antwort von Anthropic API.')
  }
  return content.trim()
}
