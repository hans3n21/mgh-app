// Hintergrundpruefung neuer Mails mit dem lokalen Analysedienst. Laeuft nach
// jedem Sync mit neuen Mails, eine Mail nach der anderen, und blockiert den Sync
// nicht (kein IMAP-Lock, eigener Ablauf). Der Stand haengt an globalThis, weil
// Next diese Datei in mehrere Bundles packt (vgl. Mutex in lib/mail/sync.ts).
import { prisma } from '@/lib/prisma';
import { getPlaintext, mergeModelEntities, type ExtractedEntity } from '@/lib/mail/extraction';
import { isSentFolderName } from '@/lib/mail/folders';
import { stripQuotedContent } from '@/lib/mail/stripQuotedContent';
import { detectPiiStrict, readMailAiConfig } from './client';

const LOOKBACK_MS = 24 * 60 * 60 * 1000;
const state = (globalThis as unknown as { __mailAiQueue?: { running: boolean; pending: boolean; done: Set<string> } })
  .__mailAiQueue ??= { running: false, pending: false, done: new Set<string>() };

/** Sync meldet neue Mails; die Pruefung laeuft entkoppelt weiter. */
export function scheduleMailAnalysis() {
  if (state.running) { state.pending = true; return; }
  void run().catch(error => console.warn(`[mail-ai] Hintergrundprüfung abgebrochen: ${error instanceof Error ? error.message : 'unbekannt'}`));
}

async function run() {
  state.running = true;
  try {
    do {
      state.pending = false;
      if (!(await readMailAiConfig(true)).enabled) return;
      const recent = await prisma.mail.findMany({
        where: { createdAt: { gte: new Date(Date.now() - LOOKBACK_MS) }, isDeleted: false },
        select: { id: true, folder: true }, orderBy: { createdAt: 'asc' }, take: 300,
      });
      for (const mail of recent) {
        if (state.done.has(mail.id) || isSentFolderName(mail.folder)) continue;
        // Dienst weg: abbrechen, beim naechsten Sync erneut versuchen.
        await analyzeMail(mail.id);
        state.done.add(mail.id);
      }
      if (state.done.size > 5000) state.done.clear();
    } while (state.pending);
  } finally {
    state.running = false;
  }
}

/**
 * Modellerkennung fuer eine Mail, auf demselben Text wie die Sync-Erkennung
 * (neuer Teil ohne Zitat), damit die Positionen zusammenpassen.
 */
export async function analyzeMail(mailId: string) {
  const mail = await prisma.mail.findUnique({ where: { id: mailId }, select: { text: true, html: true, extraction: { select: { entities: true } } } });
  if (!mail) return;
  const text = getPlaintext(stripQuotedContent(mail.text ?? '').freshContent, mail.html);
  if (text.length < 5) return;
  const ml = await detectPiiStrict(text, 120_000);
  const existing = (mail.extraction?.entities ?? []) as unknown as ExtractedEntity[];
  const entities = mergeModelEntities(Array.isArray(existing) ? existing : [], ml);
  const json = entities as unknown as import('@prisma/client').Prisma.InputJsonValue;
  await prisma.mailExtraction.upsert({ where: { mailId }, create: { mailId, entities: json }, update: { entities: json } });
}
