import { promises as fs } from 'fs';
import path from 'path';
import type { Prisma } from '@prisma/client';
import { createPointOutHandlers, type PointOutStore } from '@hans3n21/pointout/server';
import { prisma } from '@/lib/prisma';
import { resolveFilesPath } from '@/lib/files-root';
import { POINTOUT_PROJECT_ID, feedbackPageName } from '@/lib/pointout-config';

// PointOut bringt Adapter fuer Supabase und OpenAI mit. Hier bleibt alles im Haus:
// Feedback landet in der Tabelle Feedback, der Screenshot unter uploads/feedback
// (FILES_ROOT, also auf dem NAS), Sprache geht an den lokalen Whisper-Dienst.
// Nur serverseitig importieren.

type FeedbackRecord = Parameters<PointOutStore['save']>[0];

const HOUR_MS = 60 * 60 * 1000;
const LIMITS = { feedback: 30, transcribe: 60 } as const;
// Ein Prozess auf dem Hauptrechner: ein Zaehler im Speicher reicht.
const hits = new Map<string, number[]>();

function claim(key: string, limit: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < HOUR_MS);
  const allowed = recent.length < limit;
  if (allowed) recent.push(now);
  hits.set(key, recent);
  return allowed;
}

async function transcribeWithLocalWhisper(audio: File): Promise<string> {
  const base = process.env.WHISPER_API_URL || 'http://localhost:9000';
  const form = new FormData();
  form.append('audio_file', audio);
  const response = await fetch(`${base}/asr?task=transcribe&language=de&output=json`, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`Whisper antwortet mit ${response.status}`);
  const result = (await response.json()) as { text?: string };
  return result.text ?? '';
}

function deviceSummary(record: FeedbackRecord): string | null {
  const browser = [record.browser, record.browser_version].filter(Boolean).join(' ');
  const os = [record.operating_system, record.operating_system_version].filter(Boolean).join(' ');
  const parts = [browser, os, record.device_type].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

function prismaStore(userId: string): PointOutStore {
  return {
    async save(record, image) {
      let screenshotPath: string | null = null;
      let absPath: string | null = null;
      if (image) {
        screenshotPath = path.posix.join('uploads', 'feedback', `${record.id}.${image.extension}`);
        absPath = resolveFilesPath(screenshotPath);
        if (!absPath) throw new Error('Ungültiger Screenshot-Pfad');
        await fs.mkdir(path.dirname(absPath), { recursive: true });
        await fs.writeFile(absPath, image.bytes);
      }
      try {
        await prisma.feedback.create({
          data: {
            id: record.id,
            message: record.feedback_text,
            page: feedbackPageName(record.route),
            url: record.page_url ?? record.route ?? '',
            timestamp: new Date(),
            userAgent: deviceSummary(record),
            category: record.metadata.category ?? 'general',
            screenshotPath,
            annotation: record.annotation_data as Prisma.InputJsonValue,
            device: {
              browser: record.browser,
              browser_version: record.browser_version,
              operating_system: record.operating_system,
              operating_system_version: record.operating_system_version,
              device_type: record.device_type,
              viewport: record.viewport,
              screen_size: record.screen_size,
              pixel_ratio: record.pixel_ratio,
              touch_enabled: record.touch_enabled,
              display_mode: record.display_mode,
            } as Prisma.InputJsonValue,
            metadata: {
              ...record.metadata,
              ...(record.transcript_original ? { transcript_original: record.transcript_original } : {}),
            } as Prisma.InputJsonValue,
            appVersion: record.app_version,
            createdById: userId,
          },
        });
      } catch (error) {
        if (absPath) await fs.rm(absPath, { force: true });
        throw error;
      }
    },
  };
}

/** userId muss aus der geprueften Sitzung stammen, er begrenzt die Anfragen je Person. */
export function pointOutHandlers(userId: string) {
  return createPointOutHandlers({
    projectId: POINTOUT_PROJECT_ID,
    store: prismaStore(userId),
    rateLimit: (_request, operation) => claim(`${userId}:${operation}`, LIMITS[operation]),
    transcribe: transcribeWithLocalWhisper,
    // Keine Live-Mitschrift: die liefe ueber OpenAI Realtime, Audio verliesse das Haus.
  });
}
