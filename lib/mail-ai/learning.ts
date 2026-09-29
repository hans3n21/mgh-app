// Lernen aus den Entscheidungen in der Vorschlagsleiste:
// 1. Lernbeispiele fuer das Sprachmodell (optional, Schalter "Lernfaelle beifuegen").
// 2. Trefferquote je Feld: wie oft stimmten die Vorschlaege, wie oft wurden sie
//    korrigiert oder verworfen. Grundlage, um Feldern spaeter zu vertrauen.
// Gespeichert ist nur mailId + Position + Entscheidung; der Satz fuer ein Beispiel
// wird bei Bedarf aus der Mail gelesen und geht nur an das lokale Modell.
import type { OrderType } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { FIELD_LABELS } from '@/lib/order-presets';
import { getPlaintext } from '@/lib/mail/extraction';
import { readAnnotations, sourceHash } from '@/lib/mail-training/review';
import type { Annotation, ReviewEvent } from '@/lib/mail-training/contracts';
import { CONTACT_FIELDS, CONTACT_LABELS, type ContactField } from '@/lib/mail/contact-fields';
import { snippetAround } from './snippet';

export type LearningExample = { text: string; findings: { field: string; value: string; intent: string; quote: string }[] };

/**
 * Beispiele aus menschlich geprueften Stellen: bevorzugt Korrekturen (dort hat
 * das Modell etwas falsch gemacht), je Feld hoechstens eines. Der Wert ist immer
 * die woertliche Stelle, damit das Modell nicht lernt, Werte umzuformulieren.
 */
export function pickExamples(reviews: { text: string; annotations: Annotation[] }[], max = 2): LearningExample[] {
  const candidates: { corrected: boolean; field: string; example: LearningExample }[] = [];
  for (const review of reviews) {
    for (const a of review.annotations) {
      if (a.kind !== 'order' || !a.reviewed || a.dismissed || review.text.slice(a.start, a.end) !== a.text) continue;
      const s = snippetAround(review.text, a.start, a.end);
      const sentence = `${s.before}${s.match}${s.after}`.trim();
      if (!sentence || sentence.length > 300) continue;
      candidates.push({ corrected: !!a.reason && a.reason !== 'correct', field: a.field,
        example: { text: sentence, findings: [{ field: a.field, value: a.text, intent: a.intent, quote: sentence }] } });
    }
  }
  const ordered = [...candidates.filter(c => c.corrected), ...candidates.filter(c => !c.corrected)];
  const result: LearningExample[] = [];
  const seen = new Set<string>();
  for (const c of ordered) {
    if (seen.has(c.field)) continue;
    seen.add(c.field);
    result.push(c.example);
    if (result.length >= max) break;
  }
  return result;
}

/** Juengste gepruefte Mails desselben Auftragstyps (ohne die aktuelle). */
export async function loadExamples(orderType: string, excludeMailId: string, max = 2): Promise<LearningExample[]> {
  const rows = await prisma.mailTrainingReview.findMany({
    where: { mailId: { not: excludeMailId }, mail: { isDeleted: false, order: { type: orderType as OrderType } } },
    orderBy: { updatedAt: 'desc' }, take: 8,
    select: { sourceHash: true, annotations: true, mail: { select: { text: true, html: true } } },
  });
  const reviews = rows.map(r => ({ text: getPlaintext(r.mail.text, r.mail.html), hash: r.sourceHash, annotations: readAnnotations(r.annotations) }))
    .filter(r => r.annotations.some(a => a.reviewed && a.kind === 'order') && sourceHash(r.text) === r.hash);
  return pickExamples(reviews, max);
}

export type FieldStat = { field: string; label: string; total: number; correct: number; corrected: number; wrong: number };
export type VariantStat = { withExamples: boolean; total: number; correct: number };

/**
 * Nur Modellvorschlaege, ueber die ein Mensch entschieden hat. "richtig" heisst:
 * Feld, Wert und Absicht unveraendert bestaetigt.
 */
export function computeStats(annotationSets: Annotation[][]): { fields: FieldStat[]; variants: VariantStat[] } {
  const fields = new Map<string, FieldStat>();
  const variants = new Map<boolean, VariantStat>();
  for (const set of annotationSets) {
    for (const a of set) {
      if (a.kind !== 'order' || a.origin !== 'model' || !a.reviewed) continue;
      const stat = fields.get(a.field) ?? { field: a.field, label: FIELD_LABELS[a.field] || a.field, total: 0, correct: 0, corrected: 0, wrong: 0 };
      stat.total++;
      const isWrong = a.dismissed || a.reason === 'wrong';
      const isCorrect = !isWrong && a.reason === 'correct';
      if (isWrong) stat.wrong++; else if (isCorrect) stat.correct++; else stat.corrected++;
      fields.set(a.field, stat);
      const withExamples = !!a.modelRevision?.endsWith('+ex');
      const variant = variants.get(withExamples) ?? { withExamples, total: 0, correct: 0 };
      variant.total++;
      if (isCorrect) variant.correct++;
      variants.set(withExamples, variant);
    }
  }
  return { fields: Array.from(fields.values()).sort((a, b) => b.total - a.total || a.label.localeCompare(b.label)),
    variants: Array.from(variants.values()) };
}

export type ContactStat = { field: string; label: string; total: number; correct: number; corrected: number };

/**
 * Kontaktdaten aus Mails (Verlauf 'contact', lib/mail/contact.ts): unveraendert
 * bestaetigt oder vom Menschen geaendert, ergaenzt bzw. entfernt. "korrigiert"
 * heisst nicht zwingend falsch erkannt; man darf auch bewusst anders entscheiden.
 */
export function computeContactStats(histories: ReviewEvent[][]): ContactStat[] {
  const stats = new Map<string, ContactStat>();
  histories.forEach(history => history.forEach(e => {
    if (e.action !== 'contact' || !e.field) return;
    const stat = stats.get(e.field) ?? { field: e.field, label: CONTACT_LABELS[e.field as ContactField] || e.field, total: 0, correct: 0, corrected: 0 };
    stat.total++;
    if (e.reason === 'correct') stat.correct++; else stat.corrected++;
    stats.set(e.field, stat);
  }));
  return CONTACT_FIELDS.map(f => stats.get(f)).filter((s): s is ContactStat => !!s);
}

export async function loadStats() {
  const rows = await prisma.mailTrainingReview.findMany({ select: { annotations: true, history: true } });
  return { ...computeStats(rows.map(r => readAnnotations(r.annotations))),
    contact: computeContactStats(rows.map(r => (Array.isArray(r.history) ? r.history as unknown as ReviewEvent[] : []))) };
}
