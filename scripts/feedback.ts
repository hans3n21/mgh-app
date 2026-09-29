/**
 * Feedback aus der App fuer die Bearbeitung in Claude Code (/feedback).
 *
 *   npm run feedback                   offene Eintraege, neueste zuerst
 *   npm run feedback -- all            auch erledigte
 *   npm run feedback -- show <id>      ein Eintrag mit Schritten, Geraet und Screenshot-Pfad
 *   npm run feedback -- resolve <id>   als erledigt markieren
 *   npm run feedback -- reopen <id>    wieder oeffnen
 *
 * <id> darf auch ein eindeutiger Anfang der ID sein. Schreibt nur das Feld
 * resolved/resolvedAt/resolvedBy, sonst nur Lesen.
 */
import 'dotenv/config';
import { existsSync } from 'fs';
import { prisma } from '@/lib/prisma';
import { resolveFilesPath } from '@/lib/files-root';

type Step = { seconds_before: number; kind: string; label: string; area?: string; count?: number };

const CATEGORY: Record<string, string> = { bug: 'Fehler', idea: 'Idee', design: 'Design', general: 'Allgemein' };

function pathOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

function date(value: Date): string {
  return value.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

async function authorName(id: string | null): Promise<string | null> {
  if (!id) return null;
  const user = await prisma.user.findUnique({ where: { id }, select: { name: true } });
  return user?.name ?? null;
}

async function findOne(idOrPrefix: string) {
  const matches = await prisma.feedback.findMany({ where: { id: { startsWith: idOrPrefix } }, take: 2 });
  if (matches.length === 0) throw new Error(`Kein Feedback mit ID ${idOrPrefix}`);
  if (matches.length > 1) throw new Error(`ID-Anfang ${idOrPrefix} ist nicht eindeutig`);
  return matches[0];
}

async function list(includeResolved: boolean) {
  const items = await prisma.feedback.findMany({
    where: includeResolved ? undefined : { resolved: false },
    orderBy: { createdAt: 'desc' },
  });
  if (items.length === 0) {
    console.log(includeResolved ? 'Kein Feedback vorhanden.' : 'Kein offenes Feedback.');
    return;
  }
  for (const item of items) {
    const author = await authorName(item.createdById);
    const meta = [
      CATEGORY[item.category ?? 'general'] ?? item.category,
      item.page,
      author,
      date(item.timestamp),
      item.screenshotPath ? 'Screenshot' : null,
      item.resolved ? 'ERLEDIGT' : null,
    ].filter(Boolean);
    const firstLine = item.message.split('\n').find((line) => line.trim()) ?? '';
    console.log(`${item.id}  ${meta.join(' · ')}`);
    console.log(`    ${firstLine.length > 140 ? firstLine.slice(0, 139) + '…' : firstLine}`);
  }
  console.log(`\n${items.length} Eintraege. Details: npm run feedback -- show <id>`);
}

async function show(idOrPrefix: string) {
  const item = await findOne(idOrPrefix);
  const author = await authorName(item.createdById);
  const metadata = (item.metadata ?? {}) as { steps?: Step[]; app_context?: Record<string, unknown>; transcript_original?: string };
  const device = (item.device ?? {}) as { viewport?: { width: number; height: number } | null; touch_enabled?: boolean | null };
  const screenshot = item.screenshotPath ? resolveFilesPath(item.screenshotPath) : null;

  console.log(`ID:        ${item.id}`);
  console.log(`Status:    ${item.resolved ? `erledigt (${item.resolvedAt ? date(item.resolvedAt) : '?'})` : 'offen'}`);
  console.log(`Kategorie: ${CATEGORY[item.category ?? 'general'] ?? item.category}`);
  console.log(`Von:       ${author ?? 'unbekannt (altes Formular)'}`);
  console.log(`Am:        ${date(item.timestamp)}`);
  console.log(`Seite:     ${item.page} – ${pathOf(item.url)}`);
  if (item.userAgent) console.log(`Geraet:    ${item.userAgent}${device.viewport ? `, Fenster ${device.viewport.width}×${device.viewport.height}` : ''}${device.touch_enabled ? ', Touch' : ''}`);
  if (screenshot) console.log(`Screenshot: ${screenshot}${existsSync(screenshot) ? '' : '  (Datei fehlt!)'}`);
  console.log(`\nText:\n${item.message}`);
  if (metadata.transcript_original && metadata.transcript_original !== item.message) {
    console.log(`\nUrspruenglich gesprochen:\n${metadata.transcript_original}`);
  }
  if (metadata.steps?.length) {
    console.log('\nLetzte Schritte (aelteste zuerst):');
    for (const step of metadata.steps) {
      const extra = [step.area, step.count ? `×${step.count}` : null].filter(Boolean).join(', ');
      console.log(`  -${step.seconds_before}s  ${step.kind.padEnd(7)} ${step.label}${extra ? ` (${extra})` : ''}`);
    }
  }
  if (metadata.app_context && Object.keys(metadata.app_context).length) {
    console.log(`\nApp-Zustand: ${JSON.stringify(metadata.app_context)}`);
  }
}

async function setResolved(idOrPrefix: string, resolved: boolean) {
  const item = await findOne(idOrPrefix);
  await prisma.feedback.update({
    where: { id: item.id },
    data: { resolved, resolvedAt: resolved ? new Date() : null, resolvedBy: resolved ? 'claude-code' : null },
  });
  console.log(`${item.id} ${resolved ? 'als erledigt markiert' : 'wieder geoeffnet'}.`);
}

async function main() {
  const [command = 'list', id] = process.argv.slice(2);
  if (command === 'list') return list(false);
  if (command === 'all') return list(true);
  if (!id) throw new Error(`Bitte ID angeben: npm run feedback -- ${command} <id>`);
  if (command === 'show') return show(id);
  if (command === 'resolve') return setResolved(id, true);
  if (command === 'reopen') return setResolved(id, false);
  throw new Error(`Unbekannter Befehl: ${command}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
