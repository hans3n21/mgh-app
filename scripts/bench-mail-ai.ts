// Messung der lokalen Mail-KI an erfundenen Testmails (lib/mail-ai/__fixtures__/order-cases.json).
// Nutzt dieselben Funktionen wie die App, keine Datenbank, nur lokale Dienste.
//
//   npx tsx scripts/bench-mail-ai.ts fields --model gemma4:e4b [--cpu] [--examples]
//   npx tsx scripts/bench-mail-ai.ts pii
//
// fields: Auftragsangaben mit Absicht ueber Ollama (Prompt/Schema/Pruefung aus lib/mail-ai/order-suggestions.ts).
//         --cpu erzwingt reine CPU (ungefaehr Hauptrechner), --examples simuliert Lernbeispiele aus den anderen Faellen.
// pii:    Personenangaben: nur Regeln vs. Regeln + lokaler Analysedienst (services/mail-ai, Schluessel aus data/access-token.txt).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { buildSuggestionMessages, outputSchema, toSuggestionAnnotations } from '@/lib/mail-ai/order-suggestions';
import { snippetAround } from '@/lib/mail-ai/snippet';
import { callMailAi, DEFAULT_BASE_URL, toPiiEntities } from '@/lib/mail-ai/client';
import { localRequest } from '@/lib/ai-training/ollama';
import { extractEntities, type ExtractedEntity } from '@/lib/mail/extraction';
import { orderFields } from '@/lib/mail-training/review';

type Case = { id: string; text: string; current: Record<string, string>;
  pii: { type: string; quote: string }[]; order: { field: string; value: string; intent: string }[] };
const fixture = JSON.parse(readFileSync(join(process.cwd(), 'lib/mail-ai/__fixtures__/order-cases.json'), 'utf8')) as { orderType: string; cases: Case[] };
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const norm = (s: string) => s.toLocaleLowerCase('de').replace(/\s+/g, ' ').trim();
const overlaps = (a: string, b: string) => norm(a).includes(norm(b)) || norm(b).includes(norm(a));
const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)} %` : '-');

function examplesFor(id: string) {
  const out: { text: string; findings: { field: string; value: string; intent: string; quote: string }[] }[] = [];
  for (const c of fixture.cases.filter(x => x.id !== id)) {
    const o = c.order.find(x => c.text.includes(x.value));
    if (!o) continue;
    const at = c.text.indexOf(o.value);
    const s = snippetAround(c.text, at, at + o.value.length);
    const sentence = `${s.before}${s.match}${s.after}`.trim();
    out.push({ text: sentence, findings: [{ field: o.field, value: o.value, intent: o.intent, quote: sentence }] });
    if (out.length >= 2) break;
  }
  return out;
}

async function benchFields() {
  const model = option('model') || 'gemma4:e4b';
  const fields = orderFields(fixture.orderType);
  const schema = outputSchema(fields.map(f => f.key));
  let expected = 0, found = 0, intentOk = 0, predicted = 0, ms = 0;
  for (const c of fixture.cases) {
    const started = Date.now();
    const result = await localRequest('http://127.0.0.1:11434', '/api/chat', {
      model, stream: false, think: false, keep_alive: '5m',
      messages: buildSuggestionMessages({ fresh: c.text, fields, current: c.current, examples: flag('examples') ? examplesFor(c.id) : undefined }),
      format: z.toJSONSchema(schema), options: { temperature: 0, seed: 42, num_ctx: 8192, num_predict: 1500, ...(flag('cpu') ? { num_gpu: 0 } : {}) },
    }, 600_000);
    const took = Date.now() - started; ms += took;
    let annotations: ReturnType<typeof toSuggestionAnnotations> = [];
    try { annotations = toSuggestionAnnotations(c.text, c.text, schema.parse(JSON.parse(result.message.content)).findings, fields, model); }
    catch { console.log(`${c.id}: ungültige Modellantwort`); }
    predicted += annotations.length;
    const used = new Set<number>(); const missing: string[] = []; const wrong: string[] = [];
    for (const o of c.order) {
      expected++;
      const i = annotations.findIndex((a, j) => !used.has(j) && a.field === o.field && overlaps(a.value, o.value));
      if (i < 0) { missing.push(`${o.field}=${o.value}`); continue; }
      used.add(i); found++;
      if (annotations[i].intent === o.intent) intentOk++; else wrong.push(`${o.value}: ${annotations[i].intent} statt ${o.intent}`);
    }
    const extra = annotations.filter((_, j) => !used.has(j)).map(a => `${a.field}=${a.value}`);
    console.log(`${c.id.padEnd(27)} ${(took / 1000).toFixed(1).padStart(5)} s  ${[missing.length && `fehlt: ${missing.join(', ')}`,
      wrong.length && `Absicht: ${wrong.join(', ')}`, extra.length && `extra: ${extra.join(', ')}`].filter(Boolean).join(' // ')}`);
  }
  console.log(JSON.stringify({ aufgabe: 'Auftragsfelder', model, modus: flag('cpu') ? 'CPU' : 'GPU/auto', beispiele: flag('examples'),
    felder: `${found}/${expected} (${pct(found, expected)})`, absicht: `${intentOk}/${found}`, ueberzaehlig: predicted - found,
    sekundenJeMail: +(ms / fixture.cases.length / 1000).toFixed(1) }, null, 2));
}

async function benchPii() {
  const tokenFile = join(process.cwd(), 'services/mail-ai/data/access-token.txt');
  const config = { enabled: true, baseUrl: DEFAULT_BASE_URL, apiKey: readFileSync(tokenFile, 'utf8').trim() };
  const score = { rules: { found: 0, false: 0 }, both: { found: 0, false: 0 } };
  let expected = 0, ms = 0;
  for (const c of fixture.cases) {
    const rules = (await extractEntities(c.text, null, { skipDb: true })).filter(e => e.pii);
    const started = Date.now();
    const model = toPiiEntities(c.text, await callMailAi(config, '/pii', { text: c.text }, 60_000));
    ms += Date.now() - started;
    const count = (entities: ExtractedEntity[], key: 'rules' | 'both') => {
      for (const p of c.pii) if (entities.some(e => overlaps(e.text, p.quote))) score[key].found++;
      score[key].false += entities.filter(e => !c.pii.some(p => overlaps(e.text, p.quote))).length;
    };
    expected += c.pii.length;
    count(rules, 'rules');
    count([...rules, ...model], 'both');
  }
  console.log(JSON.stringify({ aufgabe: 'Personenangaben', erwartet: expected,
    nurRegeln: { gefunden: `${score.rules.found}/${expected}`, faelschlich: score.rules.false },
    regelnPlusDienst: { gefunden: `${score.both.found}/${expected}`, faelschlich: score.both.false },
    dienstSekundenJeMail: +(ms / fixture.cases.length / 1000).toFixed(2) }, null, 2));
}

(args[0] === 'pii' ? benchPii() : benchFields()).then(() => process.exit(0)).catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
