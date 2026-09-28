import { z } from 'zod';

export const PRIVACY_FIELDS: Record<string, string> = {
  name: 'Name', address: 'Adresse', postalCode: 'PLZ / Ort', email: 'E-Mail',
  phone: 'Telefon', iban: 'IBAN', customerNumber: 'Kundennummer',
};
export const INTENTS = { confirmed: 'Verbindlicher Wunsch', question: 'Frage / noch offen',
  change: 'Kunde ändert seinen Wunsch', rejected: 'Nicht gewünscht', unclear: 'Unklar' } as const;
export const REASONS = { correct: 'Richtig erkannt', missed: 'Übersehen', field: 'Falsches Feld',
  value: 'Falscher Wert', intent: 'Falsch verstanden', privacy: 'Zensierung korrigiert',
  customer_change: 'Neue Kundenentscheidung' } as const;

export const AnnotationSchema = z.object({
  id: z.string().min(1).max(100), start: z.number().int().nonnegative(), end: z.number().int().positive(),
  text: z.string().min(1).max(1000), kind: z.enum(['privacy', 'order']),
  field: z.string().min(1).max(100), value: z.string().max(1000),
  intent: z.enum(['confirmed', 'question', 'change', 'rejected', 'unclear']),
  masked: z.boolean(), dismissed: z.boolean().default(false),
  origin: z.enum(['rules', 'model', 'example', 'manual']),
  reviewed: z.boolean(), reason: z.enum(['correct', 'missed', 'field', 'value', 'intent', 'privacy', 'customer_change']).optional(),
  modelRevision: z.string().max(100).optional(),
  evidence: z.array(z.object({ mailId: z.string(), quote: z.string().min(1).max(1000) }).strict()).max(8).optional(),
  contextHash: z.string().length(64).optional(),
}).strict();
export type Annotation = z.infer<typeof AnnotationSchema>;
export type ReviewEvent = {
  at: string; userId: string; action: 'review' | 'apply' | 'reset'; annotationId?: string;
  reason?: string; before?: Annotation; after?: Annotation;
  orderId?: string; field?: string; oldValue?: string; newValue?: string;
};
export type TrainingData = {
  mailId: string; sourceHash: string; revision: number; orderId: string | null;
  plaintext: string; annotations: Annotation[]; fields: { key: string; label: string }[];
  currentValues: Record<string, string>; history: ReviewEvent[];
  exampleCount: number; modelEnabled: boolean; notice?: string;
  context?: import('@/lib/ai-training/contracts').Snapshot;
};
export const MutationSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('review'), revision: z.number().int().nonnegative(), sourceHash: z.string().length(64),
    orderId: z.string().nullable(), annotation: AnnotationSchema, previous: AnnotationSchema.optional(), reason: z.enum(['correct', 'missed', 'field', 'value', 'intent', 'privacy', 'customer_change']) }).strict(),
  z.object({ action: z.literal('apply'), revision: z.number().int().nonnegative(), sourceHash: z.string().length(64),
    orderId: z.string(), annotationId: z.string(), expectedValue: z.string().max(10000) }).strict(),
  z.object({ action: z.literal('model'), revision: z.number().int().nonnegative(), sourceHash: z.string().length(64), orderId: z.string() }).strict(),
]);
