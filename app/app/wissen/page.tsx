import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isMissingGlobalKnowledgeTable, listGlobalKnowledgeEntries } from '@/lib/knowledge/global-knowledge'
import KnowledgeClient, { type GlobalKnowledgeDto } from './KnowledgeClient'

async function loadInitialKnowledge() {
  try {
    const entries = await listGlobalKnowledgeEntries(prisma)
    return { entries: entries as GlobalKnowledgeDto[], migrationReady: true }
  } catch (error) {
    if (!isMissingGlobalKnowledgeTable(error)) {
      console.error('[wissen page]', error)
    }
    return { entries: [], migrationReady: false }
  }
}

export default async function WissenPage() {
  const session = await getServerSession(authOptions)
  const { entries, migrationReady } = await loadInitialKnowledge()
  const canApprove = session?.user.role === 'admin' || session?.user.role === 'admin_no_feedback'

  return (
    <KnowledgeClient
      initialEntries={entries}
      migrationReady={migrationReady}
      canApprove={canApprove}
    />
  )
}
