import { createHash } from 'crypto'
import type { KnowledgePromptEntry, MatchedEntry } from './keyword-matcher'

/**
 * Semantisches Wissens-Matching über Embeddings.
 *
 * Ergänzt das Keyword-Matching: Kunden formulieren selten mit den Keywords der
 * Einträge ("wann kommt mein Zeug?" matcht kein "lieferzeit"). Embeddings
 * matchen Bedeutung statt Wortlaut.
 *
 * Bewusst OHNE pgvector: Bei der Größenordnung dieser Wissensbasis (~20–100
 * Einträge) ist Cosine-Similarity in Node schneller als ein DB-Roundtrip.
 * Embeddings werden pro Eintrag in KnowledgeEmbedding gecacht und lazy
 * aktualisiert, wenn sich der Inhalt ändert (contentHash).
 *
 * PII: Der Query-Text MUSS bereits anonymisiert sein, bevor er hier ankommt —
 * er geht an die OpenAI-Embeddings-API.
 */

const EMBEDDING_MODEL = 'text-embedding-3-small'
const MAX_QUERY_CHARS = 8_000
const MAX_ENTRY_CHARS = 8_000
const SIMILARITY_THRESHOLD = 0.25
const DEFAULT_TOP_K = 3

function contentHash(entry: KnowledgePromptEntry): string {
	return createHash('sha256')
		.update(`${entry.title}\n${entry.keywords.join(',')}\n${entry.content}`)
		.digest('hex')
}

function entryEmbeddingInput(entry: KnowledgePromptEntry): string {
	return `${entry.title}\n${entry.keywords.join(', ')}\n${entry.content}`.slice(0, MAX_ENTRY_CHARS)
}

function cosineSimilarity(a: number[], b: number[]): number {
	let dot = 0
	let normA = 0
	let normB = 0
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i]
		normA += a[i] * a[i]
		normB += b[i] * b[i]
	}
	const denom = Math.sqrt(normA) * Math.sqrt(normB)
	return denom === 0 ? 0 : dot / denom
}

async function resolveOpenAiKey(): Promise<string | null> {
	if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY
	try {
		const { prisma } = await import('@/lib/prisma')
		const [providerSetting, keySetting] = await Promise.all([
			prisma.systemSetting.findUnique({ where: { key: 'ai:provider' } }),
			prisma.systemSetting.findUnique({ where: { key: 'ai:apiKey' } }),
		])
		// Embeddings laufen nur über OpenAI; der globale Key passt nur, wenn der
		// globale Provider OpenAI ist.
		if ((providerSetting?.value ?? 'openai') === 'openai' && keySetting?.value) {
			return keySetting.value
		}
	} catch {
		// DB nicht erreichbar → kein semantisches Matching
	}
	return null
}

async function embedTexts(texts: string[], apiKey: string): Promise<number[][]> {
	const controller = new AbortController()
	const timeout = setTimeout(() => controller.abort(), 15_000)
	try {
		const res = await fetch('https://api.openai.com/v1/embeddings', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${apiKey}`,
			},
			body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
			signal: controller.signal,
		})
		if (!res.ok) {
			const body = await res.text().catch(() => '')
			throw new Error(`Embeddings API Fehler (${res.status}): ${body.slice(0, 200)}`)
		}
		const data = await res.json()
		const rows = Array.isArray(data?.data) ? data.data : []
		return rows.map((row: { embedding: number[] }) => row.embedding)
	} finally {
		clearTimeout(timeout)
	}
}

/**
 * Liefert die Embeddings aller Einträge — aus dem Cache, fehlende/veraltete
 * werden in einem Batch nachberechnet und gecacht.
 */
async function loadEntryEmbeddings(
	entries: KnowledgePromptEntry[],
	apiKey: string
): Promise<Map<string, number[]>> {
	const { prisma } = await import('@/lib/prisma')
	const hashes = new Map(entries.map((e) => [e.id, contentHash(e)]))

	const cached = await prisma.knowledgeEmbedding.findMany({
		where: { entryId: { in: entries.map((e) => e.id) } },
	})
	const result = new Map<string, number[]>()
	const stale: KnowledgePromptEntry[] = []

	for (const entry of entries) {
		const hit = cached.find((c) => c.entryId === entry.id)
		if (hit && hit.contentHash === hashes.get(entry.id) && Array.isArray(hit.embedding)) {
			result.set(entry.id, hit.embedding as number[])
		} else {
			stale.push(entry)
		}
	}

	if (stale.length > 0) {
		const embeddings = await embedTexts(stale.map(entryEmbeddingInput), apiKey)
		await Promise.all(stale.map((entry, i) => {
			const embedding = embeddings[i]
			if (!embedding) return Promise.resolve(null)
			result.set(entry.id, embedding)
			return prisma.knowledgeEmbedding.upsert({
				where: { entryId: entry.id },
				update: { contentHash: hashes.get(entry.id)!, embedding },
				create: { entryId: entry.id, contentHash: hashes.get(entry.id)!, embedding },
			})
		}))
	}

	return result
}

/**
 * Semantische Treffer für einen (bereits anonymisierten!) Text.
 * Fällt bei jedem Fehler leise auf [] zurück — Keyword-Matching bleibt dann
 * die einzige Quelle, die KI-Antwort funktioniert weiter.
 */
export async function semanticMatchKnowledge(
	anonymizedQuery: string,
	entries: KnowledgePromptEntry[],
	topK: number = DEFAULT_TOP_K
): Promise<MatchedEntry[]> {
	const query = anonymizedQuery.trim().slice(0, MAX_QUERY_CHARS)
	if (!query || entries.length === 0) return []

	try {
		const apiKey = await resolveOpenAiKey()
		if (!apiKey) return []

		const active = entries.filter((e) => e.isActive)
		if (active.length === 0) return []

		const [entryEmbeddings, [queryEmbedding]] = await Promise.all([
			loadEntryEmbeddings(active, apiKey),
			embedTexts([query], apiKey),
		])
		if (!queryEmbedding) return []

		return active
			.map((entry) => {
				const embedding = entryEmbeddings.get(entry.id)
				const score = embedding ? cosineSimilarity(queryEmbedding, embedding) : 0
				return { entry, score }
			})
			.filter((item) => item.score >= SIMILARITY_THRESHOLD)
			.sort((a, b) => b.score - a.score)
			.slice(0, topK)
			.map((item) => ({
				entry: item.entry,
				matchedKeywords: [`semantisch (${item.score.toFixed(2)})`],
				matchCount: 1,
			}))
	} catch (error) {
		console.warn('[semantic-matcher] Fallback auf Keyword-Matching:', error instanceof Error ? error.message : error)
		return []
	}
}

/**
 * Keyword- und Semantik-Treffer zusammenführen: Keyword-Treffer zuerst
 * (präziser bei Fachbegriffen), semantische füllen auf, Duplikate raus.
 */
export function mergeKnowledgeHits(
	keywordHits: MatchedEntry[],
	semanticHits: MatchedEntry[],
	cap: number = 5
): MatchedEntry[] {
	const seen = new Set(keywordHits.map((h) => h.entry.id))
	const merged = [...keywordHits]
	for (const hit of semanticHits) {
		if (merged.length >= cap) break
		if (seen.has(hit.entry.id)) continue
		seen.add(hit.entry.id)
		merged.push(hit)
	}
	return merged.slice(0, cap)
}
