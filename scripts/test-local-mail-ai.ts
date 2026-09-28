/** Synthetic model evaluation; never reads customer data or the application database. */
import { readFileSync } from 'node:fs';
import { analyzeLocally } from '../lib/local-ai/client';

async function main() {
  const tokenPath = process.argv[2];
  if (!tokenPath) throw new Error('Usage: npx tsx scripts/test-local-mail-ai.ts <token-file> [http://127.0.0.1:8765]');
  const config = { enabled: true, baseUrl: process.argv[3] || 'http://127.0.0.1:8765', apiKey: readFileSync(tokenPath, 'utf8').trim() };
  const cases = [
    { text: 'Bitte den Hals aus Ahorn.', field: 'neck_wood', value: 'Ahorn', expected: 'confirmed' },
    { text: 'Bitte den Hals aus Ahorn.', field: 'fretboard_material', value: 'Ahorn', expected: 'unclear' },
    { text: 'Kein Ebenholz fürs Griffbrett.', field: 'fretboard_material', value: 'Ebenholz', expected: 'rejected' },
    { text: 'Was kostet ein Griffbrett aus Ebenholz?', field: 'fretboard_material', value: 'Ebenholz', expected: 'tentative' },
    { text: 'Bitte 22 Edelstahlbünde.', field: 'frets', value: '22 Edelstahlbünde', expected: 'confirmed' },
    { text: 'Wäre ein Radius von 12 Zoll möglich? Noch nicht entschieden.', field: 'fretboard_radius', value: 'Radius von 12 Zoll', expected: 'tentative' },
    { text: 'Zunächst wollte ich Ebenholz fürs Griffbrett. Jetzt bitte Palisander fürs Griffbrett.', field: 'fretboard_material', value: 'Palisander', expected: 'confirmed' },
    { text: 'Zunächst wollte ich Ebenholz fürs Griffbrett. Jetzt bitte Palisander fürs Griffbrett.', field: 'fretboard_material', value: 'Ebenholz', expected: 'rejected' },
  ];
  let correct = 0;
  for (const [index, test] of cases.entries()) {
    const result = await analyzeLocally(config, test.text, 'NECK');
    const answer = result.findings.find(f => f.field === test.field && f.value === test.value);
    const passed = answer?.decision === test.expected;
    if (passed) correct++;
    console.log(JSON.stringify({ case: index + 1, expected: test.expected, actual: answer?.decision,
      probability: answer?.probability, passed, ms: result.elapsedMs, revision: result.revision }));
  }
  console.log(`${correct}/${cases.length} synthetic decisions correct. This is not a representative accuracy estimate.`);
  if (correct !== cases.length) process.exitCode = 1;
}
main().catch(() => { console.error('Model test could not run. Check token file, service readiness and local address.'); process.exitCode = 1; });
