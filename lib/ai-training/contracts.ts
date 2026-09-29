import { z } from 'zod';

// Gespraechsausschnitt fuer kontextabhaengige Markierungen im Trainingsmodus (context.ts).
export const SnapshotSchema = z.object({
  currentId: z.string(), orderType: z.string(),
  fields: z.array(z.object({ key: z.string(), label: z.string() })),
  messages: z.array(z.object({ id: z.string(), date: z.string(), role: z.enum(['customer', 'staff', 'unknown']), text: z.string() })),
  omitted: z.number().int(),
});
export type Snapshot = z.infer<typeof SnapshotSchema>;
// Einstellung unter KI-Training -> Lokale Modelle (lib/ai-training/ollama.ts).
export type ModelConfig = { enabled: boolean; baseUrl: string; model: string; useExamples: boolean; localOnlyConfirmed: boolean };
