'use client'

import { useMemo, useState } from 'react'

export type GlobalKnowledgeDto = {
  id: string
  title: string
  keywords: string[]
  content: string
  category: string | null
  status: 'draft' | 'review' | 'approved' | 'archived' | string
  kiFreigabe: boolean
  isActive: boolean
  sourcePath: string | null
  sortOrder: number
  createdBy: string | null
  updatedBy: string | null
  createdAt: string | Date
  updatedAt: string | Date
}

type DraftEntry = {
  title: string
  keywordsRaw: string
  content: string
  category: string
  status: 'draft' | 'review' | 'approved' | 'archived'
  kiFreigabe: boolean
  isActive: boolean
}

type Props = {
  initialEntries: GlobalKnowledgeDto[]
  migrationReady: boolean
  canApprove: boolean
}

const STATUS_OPTIONS = [
  { value: '', label: 'Alle Status' },
  { value: 'draft', label: 'Entwurf' },
  { value: 'review', label: 'Review' },
  { value: 'approved', label: 'Freigegeben' },
  { value: 'archived', label: 'Archiviert' },
]

const EMPTY_DRAFT: DraftEntry = {
  title: '',
  keywordsRaw: '',
  content: '',
  category: '',
  status: 'review',
  kiFreigabe: false,
  isActive: false,
}

function toDraft(entry: GlobalKnowledgeDto): DraftEntry {
  return {
    title: entry.title,
    keywordsRaw: entry.keywords.join(', '),
    content: entry.content,
    category: entry.category ?? '',
    status: normalizeStatus(entry.status),
    kiFreigabe: entry.kiFreigabe,
    isActive: entry.isActive,
  }
}

function normalizeStatus(status: string): DraftEntry['status'] {
  if (status === 'draft' || status === 'approved' || status === 'archived') return status
  return 'review'
}

function parseKeywords(raw: string) {
  return Array.from(
    new Set(
      raw
        .split(',')
        .map((keyword) => keyword.trim().toLowerCase())
        .filter(Boolean)
    )
  )
}

function statusLabel(status: string) {
  return STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status
}

function formatDate(value: string | Date) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function KnowledgeClient({ initialEntries, migrationReady, canApprove }: Props) {
  const [entries, setEntries] = useState(initialEntries)
  const [selectedId, setSelectedId] = useState(initialEntries[0]?.id ?? 'new')
  const [draft, setDraft] = useState<DraftEntry>(
    initialEntries[0] ? toDraft(initialEntries[0]) : EMPTY_DRAFT
  )
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const filteredEntries = useMemo(() => {
    const normalizedQuery = query.toLowerCase().trim()
    return entries.filter((entry) => {
      const matchesStatus = !statusFilter || entry.status === statusFilter
      const haystack = [
        entry.title,
        entry.content,
        entry.category ?? '',
        entry.keywords.join(' '),
      ].join(' ').toLowerCase()
      const matchesQuery = !normalizedQuery || haystack.includes(normalizedQuery)
      return matchesStatus && matchesQuery
    })
  }, [entries, query, statusFilter])

  const selectedEntry = entries.find((entry) => entry.id === selectedId) ?? null
  const activeCount = entries.filter((entry) => entry.isActive && entry.status === 'approved' && entry.kiFreigabe).length
  const reviewCount = entries.filter((entry) => entry.status === 'review').length

  function selectEntry(entry: GlobalKnowledgeDto) {
    setSelectedId(entry.id)
    setDraft(toDraft(entry))
    setMessage('')
  }

  function startNewEntry() {
    setSelectedId('new')
    setDraft(EMPTY_DRAFT)
    setMessage('')
  }

  function patchDraft(patch: Partial<DraftEntry>) {
    setDraft((current) => {
      const next = { ...current, ...patch }
      if (patch.status && patch.status !== 'approved') next.isActive = false
      if (patch.kiFreigabe === false) next.isActive = false
      return next
    })
  }

  async function reloadEntries() {
    const res = await fetch('/api/knowledge')
    if (!res.ok) return
    const updated = await res.json()
    setEntries(updated)
  }

  async function saveEntry() {
    if (!draft.title.trim() || !draft.content.trim()) {
      setMessage('Titel und Inhalt sind Pflichtfelder.')
      return
    }

    setSaving(true)
    setMessage('')

    const payload = {
      title: draft.title,
      keywords: parseKeywords(draft.keywordsRaw),
      content: draft.content,
      category: draft.category || null,
      status: draft.status,
      kiFreigabe: draft.kiFreigabe,
      isActive: draft.isActive,
    }

    try {
      const isNew = selectedId === 'new'
      const res = await fetch(isNew ? '/api/knowledge' : `/api/knowledge/${selectedId}`, {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Speichern fehlgeschlagen')

      await reloadEntries()
      setSelectedId(data.id)
      setDraft(toDraft(data))
      setMessage('Gespeichert.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Speichern fehlgeschlagen')
    } finally {
      setSaving(false)
    }
  }

  async function archiveEntry() {
    if (!selectedEntry) return
    setSaving(true)
    setMessage('')

    try {
      const res = await fetch(`/api/knowledge/${selectedEntry.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'archived', isActive: false }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Archivieren fehlgeschlagen')
      await reloadEntries()
      setSelectedId(data.id)
      setDraft(toDraft(data))
      setMessage('Archiviert.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Archivieren fehlgeschlagen')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4 pb-16 sm:pb-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Wissensbasis</h1>
          <p className="mt-1 text-sm text-slate-400">
            Globales Firmenwissen fuer KI-Antworten, Suche und interne Pflege.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-slate-300">
          <span className="rounded border border-slate-700 bg-slate-900 px-2.5 py-1">{entries.length} Eintraege</span>
          <span className="rounded border border-emerald-800/70 bg-emerald-950/30 px-2.5 py-1">{activeCount} KI-aktiv</span>
          <span className="rounded border border-amber-800/70 bg-amber-950/30 px-2.5 py-1">{reviewCount} Review</span>
        </div>
      </div>

      {!migrationReady && (
        <div className="rounded border border-amber-700/60 bg-amber-950/30 p-3 text-sm text-amber-100">
          Die globale Wissensbasis ist vorbereitet, aber die Datenbankmigration wurde noch nicht angewendet.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(280px,380px)_1fr]">
        <section className="rounded-lg border border-slate-800 bg-slate-900/60">
          <div className="border-b border-slate-800 p-3">
            <div className="flex gap-2">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Suchen..."
                className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
              />
              <button
                type="button"
                onClick={startNewEntry}
                className="rounded bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-500"
              >
                Neu
              </button>
            </div>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="mt-2 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          <div className="max-h-[calc(100vh-280px)] overflow-y-auto">
            {filteredEntries.length === 0 && (
              <div className="p-4 text-sm text-slate-500">Keine passenden Eintraege.</div>
            )}
            {filteredEntries.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => selectEntry(entry)}
                className={`block w-full border-b border-slate-800 px-3 py-3 text-left hover:bg-slate-800/60 ${
                  selectedId === entry.id ? 'bg-slate-800/80' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-slate-100">{entry.title}</div>
                    <div className="mt-1 truncate text-xs text-slate-500">{entry.category || 'ohne Kategorie'}</div>
                  </div>
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${
                    entry.isActive ? 'bg-emerald-900/60 text-emerald-200' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {entry.isActive ? 'KI' : statusLabel(entry.status)}
                  </span>
                </div>
                {entry.keywords.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {entry.keywords.slice(0, 4).map((keyword) => (
                      <span key={keyword} className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
                        {keyword}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-slate-800 bg-slate-900/60">
          <div className="border-b border-slate-800 p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-100">
                  {selectedId === 'new' ? 'Neuer Wissenseintrag' : 'Wissenseintrag bearbeiten'}
                </h2>
                {selectedEntry && (
                  <p className="mt-1 text-xs text-slate-500">
                    Aktualisiert am {formatDate(selectedEntry.updatedAt)}
                    {selectedEntry.updatedBy ? ` von ${selectedEntry.updatedBy}` : ''}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                {selectedEntry && canApprove && selectedEntry.status !== 'archived' && (
                  <button
                    type="button"
                    onClick={archiveEntry}
                    disabled={saving}
                    className="rounded border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50"
                  >
                    Archivieren
                  </button>
                )}
                <button
                  type="button"
                  onClick={saveEntry}
                  disabled={saving || !migrationReady}
                  className="rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
                >
                  {saving ? 'Speichert...' : 'Speichern'}
                </button>
              </div>
            </div>
          </div>

          <div className="grid gap-4 p-4">
            <label className="grid gap-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Titel</span>
              <input
                value={draft.title}
                onChange={(event) => patchDraft({ title: event.target.value })}
                className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
              />
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-1.5">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Kategorie</span>
                <input
                  value={draft.category}
                  onChange={(event) => patchDraft({ category: event.target.value })}
                  placeholder="z.B. pickguard, reklamation, versand"
                  className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
                />
              </label>

              <label className="grid gap-1.5">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Status</span>
                <select
                  value={draft.status}
                  onChange={(event) => patchDraft({ status: event.target.value as DraftEntry['status'] })}
                  disabled={!canApprove}
                  className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500 disabled:opacity-60"
                >
                  {STATUS_OPTIONS.filter((option) => option.value).map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            </div>

            <label className="grid gap-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Keywords</span>
              <input
                value={draft.keywordsRaw}
                onChange={(event) => patchDraft({ keywordsRaw: event.target.value })}
                placeholder="kommagetrennt, z.B. pickguard, vorlage, fraesung"
                className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
              />
            </label>

            <label className="grid gap-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Inhalt</span>
              <textarea
                value={draft.content}
                onChange={(event) => patchDraft({ content: event.target.value })}
                rows={14}
                className="resize-y rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm leading-relaxed text-slate-100 outline-none focus:border-sky-500"
              />
            </label>

            <div className="flex flex-col gap-2 rounded border border-slate-800 bg-slate-950/50 p-3 text-sm text-slate-300 sm:flex-row sm:items-center">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={draft.kiFreigabe}
                  disabled={!canApprove}
                  onChange={(event) => patchDraft({ kiFreigabe: event.target.checked })}
                  className="h-4 w-4 rounded border-slate-700 bg-slate-950"
                />
                KI-Freigabe
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={draft.isActive}
                  disabled={!canApprove || draft.status !== 'approved' || !draft.kiFreigabe}
                  onChange={(event) => patchDraft({ isActive: event.target.checked })}
                  className="h-4 w-4 rounded border-slate-700 bg-slate-950"
                />
                Aktiv im KI-Kontext
              </label>
              {!canApprove && (
                <span className="text-xs text-slate-500">Freigabe und Aktivierung sind Admin-Aktionen.</span>
              )}
            </div>

            {message && (
              <div className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-300">
                {message}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
