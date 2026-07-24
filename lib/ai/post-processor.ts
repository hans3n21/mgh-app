/**
 * Post-Processing nach dem LLM-Call.
 * Ersetzt Firmendaten-Platzhalter ({firmen_key}) durch echte Werte aus CompanyData.
 * Diese Funktion arbeitet rein lokal — die echten Daten verlassen niemals die App.
 */

export type CompanyDataEntry = {
  key: string
  value: string
  isSecret: boolean
}

/**
 * Ersetzt Platzhalter im Format {firmen_key} oder {company_key} im KI-Output
 * durch die entsprechenden Werte aus CompanyData.
 *
 * Nicht gefundene Platzhalter bleiben stehen, damit der User erkennt was fehlt.
 */
export function injectCompanyData(
  aiOutput: string,
  companyData: CompanyDataEntry[]
): string {
  if (!aiOutput || companyData.length === 0) return aiOutput

  let result = aiOutput

  for (const entry of companyData) {
    if (!entry.key?.trim() || !entry.value?.trim()) continue

    const normalizedKey = entry.key.trim().toLowerCase()

    // Beide Formate matchen: {firmen_key} und {company_key}
    const patterns = [
      `{firmen_${normalizedKey}}`,
      `{company_${normalizedKey}}`,
      `{${normalizedKey}}`,
    ]

    for (const pattern of patterns) {
      const escaped = pattern.replace(/[{}]/g, '\\$&')
      result = result.replace(new RegExp(escaped, 'gi'), entry.value)
    }
  }

  return result
}

/**
 * Gibt die Liste der verfügbaren Platzhalter-Keys zurück,
 * die in den System-Prompt eingefügt werden können
 * (nur Keys, keine Werte — damit die KI weiß was verfügbar ist).
 *
 * isSecret=false Einträge werden zusätzlich mit ihrem Wert geliefert
 * (öffentliche Infos wie Firmenname, Website).
 */
export function buildCompanyDataPromptHint(
  companyData: CompanyDataEntry[]
): { placeholderHint: string; publicValues: Record<string, string> } {
  if (companyData.length === 0) {
    return { placeholderHint: '', publicValues: {} }
  }

  const keys = companyData.map(e => `{firmen_${e.key.toLowerCase()}}`)
  const placeholderHint =
    `Dir stehen folgende Firmendaten-Platzhalter zur Verfügung, nutze sie wo passend: ` +
    keys.join(', ')

  const publicValues: Record<string, string> = {}
  for (const entry of companyData) {
    if (!entry.isSecret && entry.value?.trim()) {
      publicValues[entry.key.toLowerCase()] = entry.value
    }
  }

  return { placeholderHint, publicValues }
}
