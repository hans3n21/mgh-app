import { z } from 'zod';
import { localOrigin, type LocalAiConfig } from './config';
import { DECISIONS, type Analysis } from './contracts';
import { makeQuestions, prepareCandidates } from './candidates';

export class LocalAiError extends Error {
  constructor(message: string, public status = 502) { super(message); }
}

const AnswerSchema = z.object({
  choice: z.enum(DECISIONS),
  probabilities: z.object({ confirmed: z.number().min(0).max(1), tentative: z.number().min(0).max(1),
    rejected: z.number().min(0).max(1), unclear: z.number().min(0).max(1) }).strict(),
}).refine(a => Math.abs(Object.values(a.probabilities).reduce((s, p) => s + p, 0) - 1) < 0.02 &&
  a.probabilities[a.choice] >= Math.max(...Object.values(a.probabilities)) - 0.00001);
const ResponseSchema = z.object({
  model: z.literal('convaiinnovations/laya-multilingual'), revision: z.string().min(1).max(100),
  answers: z.record(z.string(), AnswerSchema),
});

export async function analyzeLocally(config: LocalAiConfig, input: string, orderType: string): Promise<Analysis> {
  if (!config.enabled) throw new LocalAiError('Die lokale Mailprüfung ist in den Einstellungen ausgeschaltet.', 409);
  if (!config.apiKey) throw new LocalAiError('Bitte den Zugriffsschlüssel in den Einstellungen speichern.', 409);
  let prepared: ReturnType<typeof prepareCandidates>;
  try { prepared = prepareCandidates(input, orderType); }
  catch (error) { throw new LocalAiError(error instanceof Error ? error.message : 'Mail nicht geeignet.', 422); }
  const started = Date.now();
  let origin: string;
  try { origin = localOrigin(config.baseUrl); }
  catch { throw new LocalAiError('Bitte die lokale Dienstadresse in den Einstellungen prüfen.', 409); }
  if (!prepared.candidates.length) throw new LocalAiError('Keine unterstützten Angaben gefunden. Der Pilot prüft Holz, Bundangaben sowie ausdrücklich beschriftete Mensur und Radius.', 422);
  let response: Response;
  try {
    response = await fetch(`${origin}/analyze`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({ state: prepared.text, questions: makeQuestions(prepared.candidates) }),
      redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(120_000),
    });
  } catch {
    throw new LocalAiError('Der lokale KI-Dienst ist nicht erreichbar oder hat nach 120 Sekunden nicht geantwortet. Dienststart, Adresse und Netzwerk prüfen.');
  }
  if (!response.ok) {
    const messages: Record<number, string> = {
      401: 'Der Zugriffsschlüssel passt nicht zum lokalen Dienst.',
      413: 'Die Mail ist für das Kontextfenster des Pilotmodells zu lang. Bitte eine kürzere Mail testen.',
      503: 'Der lokale Dienst lädt das Modell noch oder bearbeitet eine andere Anfrage. Bitte später erneut versuchen.',
    };
    throw new LocalAiError(messages[response.status] || 'Der lokale KI-Dienst konnte die Mail nicht auswerten.');
  }
  // The model service is untrusted input; never use returned field names or values.
  const raw = await response.text();
  if (raw.length > 32_000) throw new LocalAiError('Die Antwort des lokalen Dienstes ist zu groß.');
  let parsed: z.infer<typeof ResponseSchema>;
  try { parsed = ResponseSchema.parse(JSON.parse(raw)); }
  catch { throw new LocalAiError('Der lokale Dienst hat eine ungültige Antwort geliefert.'); }
  const ids = prepared.candidates.map(c => c.id);
  if (Object.keys(parsed.answers).length !== ids.length || ids.some(id => !parsed.answers[id])) {
    throw new LocalAiError('Die Antwort des lokalen Dienstes ist unvollständig.');
  }
  return {
    model: parsed.model, revision: parsed.revision, elapsedMs: Date.now() - started, hadQuotes: prepared.hadQuotes,
    findings: prepared.candidates.map(c => ({ ...c, decision: parsed.answers[c.id].choice,
      probability: parsed.answers[c.id].probabilities[parsed.answers[c.id].choice] })),
  };
}
