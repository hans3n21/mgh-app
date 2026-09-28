import { z } from 'zod';

export const EvidenceSchema = z.object({ mailId: z.string().min(1), quote: z.string().min(1).max(1000) }).strict();
export const FindingSchema = z.object({
  kind: z.enum(['order', 'privacy']), field: z.string().min(1).max(100), value: z.string().min(1).max(1000),
  intent: z.enum(['confirmed', 'question', 'change', 'rejected', 'unclear']),
  quote: z.string().min(1).max(1000), occurrence: z.number().int().nonnegative().max(500).optional(), evidence: z.array(EvidenceSchema).max(8),
}).strict();
export const OutputSchema = z.object({ findings: z.array(FindingSchema).max(60) }).strict();
export type Finding = z.infer<typeof FindingSchema>;
export const SnapshotSchema = z.object({
  currentId: z.string(), orderType: z.string(),
  fields: z.array(z.object({ key: z.string(), label: z.string() })),
  messages: z.array(z.object({ id: z.string(), date: z.string(), role: z.enum(['customer', 'staff', 'unknown']), text: z.string() })),
  omitted: z.number().int(),
});
export type Snapshot = z.infer<typeof SnapshotSchema>;
export type Metrics = { expected: number; predicted: number; correct: number; missed: number; extra: number; unsafeConfirmations: number; privacyMissed: number; exact: boolean };
export type CaseView = { id: string; mailId: string; title: string; partition: string; fingerprint: string; createdAt: string; unavailable?: boolean;
  snapshot: Snapshot; expected: Finding[];
  results: { id: string; model: string; digest: string; protocol: string; durationMs: number; error: string | null; findings: Finding[]; metrics: Metrics; createdAt: string; examples: string[] }[] };
export type ModelConfig = { enabled: boolean; baseUrl: string; model: string; useExamples: boolean; localOnlyConfirmed: boolean };
export type Dashboard = { config: ModelConfig; cases: CaseView[] };
