import { loadEnvConfig } from '@next/env';
import { PrismaClient } from '@prisma/client';
import { matchKnowledgeEntries } from '../lib/ai/keyword-matcher';
import {
  formatPriceItem,
  isPriceLikeKnowledgeEntry,
  isPriceQuestion,
  matchPriceItems,
  type PricePromptItem,
} from '../lib/ai/price-matcher';

type TestCase = {
  name: string;
  input: string;
  expected: string;
};

const DEFAULT_MAIL_ACCOUNT_ID = 'cmmepxgcl000161pglisrfl7f';

const TEST_CASES: TestCase[] = [
  {
    name: 'Preisfrage Pickguard',
    input: 'Was kostet ein Sparkle Pickguard fuer eine Stratocaster?',
    expected: 'Soll aktive PriceItems finden, aber keine alten Preis-KnowledgeEntries nutzen.',
  },
  {
    name: 'Lieferzeit Pickguard',
    input: 'Wie lange dauert eine Custom-Pickguard-Fertigung, wenn ich euch mein altes Pickguard schicke?',
    expected: 'Soll aktive Liefer-/Ablauf-Knowledge finden, aber keine Preisfrage sein.',
  },
  {
    name: 'Pickguard Ablauf',
    input: 'Wie laeuft eine Custom-Pickguard-Fertigung ab, wenn ich euch mein altes Pickguard als Vorlage schicke?',
    expected: 'Soll den preisbereinigten Pickguard-Ablauf finden, aber keine Preise aus KnowledgeEntry ableiten.',
  },
  {
    name: 'Versand kleine Bestellung',
    input: 'Warum kostet der Versand so viel, koennt ihr ein kleines Teil nicht als Brief verschicken?',
    expected: 'Soll aktive Versandregeln finden, aber keine konkrete Versandpreistabelle aus KnowledgeEntry nutzen.',
  },
  {
    name: 'Reklamation',
    input: 'Ich habe ein falsches Teil bekommen. Wie soll ich bei einer Reklamation vorgehen?',
    expected: 'Soll zeigen, ob Reklamationswissen schon aktiv ist oder noch Review bleibt.',
  },
  {
    name: 'MGH Economy Serie',
    input: 'Was ist die MGH Economy Serie und welche Specs sind dort typisch?',
    expected: 'Soll aktive Economy-Regeln finden, aber keinen konkreten Einstiegspreis aus KnowledgeEntry nennen.',
  },
  {
    name: 'Zahlung Custom-Auftrag',
    input: 'Wie laeuft die Zahlung bei einem Custom Gitarrenauftrag, kann man in zwei Teilen zahlen?',
    expected: 'Soll aktive Zahlungsregeln finden, aber keinen konkreten Mindestbetrag aus KnowledgeEntry nennen.',
  },
  {
    name: 'Custom-Anfrage Body/Hals/Gitarre',
    input: 'Ich moechte einen Custom Body und eventuell einen passenden Hals bauen lassen. Welche Infos braucht ihr zuerst?',
    expected: 'Soll zeigen, ob Custom-Rueckfragen schon aktiv sind oder noch Review bleiben.',
  },
  {
    name: 'Storno Custom-Auftrag',
    input: 'Ich moechte meinen Custom-Auftrag stornieren. Wie laeuft das ab?',
    expected: 'Soll aktives Storno-Wissen finden.',
  },
  {
    name: 'Internationale Antwort',
    input: 'Der Kunde schreibt auf Englisch aus dem Ausland. In welcher Sprache sollen wir antworten?',
    expected: 'Soll aktive Sprachregeln finden.',
  },
  {
    name: 'Vorlagen und Dateien',
    input: 'Reicht ein Foto als Vorlage oder braucht ihr eine Vektordatei mit Massstab?',
    expected: 'Soll aktives Wissen zu Vorlagen, Dateien und Massstab finden.',
  },
];

function getMailAccountId() {
  const explicit = process.argv.find((arg) => arg.startsWith('--mail-account-id='));
  if (explicit) return explicit.slice('--mail-account-id='.length);
  const index = process.argv.indexOf('--mail-account-id');
  if (index !== -1) return process.argv[index + 1] || DEFAULT_MAIL_ACCOUNT_ID;
  return DEFAULT_MAIL_ACCOUNT_ID;
}

async function run() {
  loadEnvConfig(process.cwd());
  const prisma = new PrismaClient();
  const mailAccountId = getMailAccountId();

  try {
    const [mailAccount, knowledgeEntries, priceItems, inactiveReviewCount, inactivePriceKnowledgeCount] =
      await Promise.all([
        prisma.mailAccount.findUnique({
          where: { id: mailAccountId },
          select: { id: true, name: true },
        }),
        prisma.knowledgeEntry.findMany({
          where: { mailAccountId, isActive: true },
          orderBy: { sortOrder: 'asc' },
        }),
        prisma.priceItem.findMany({
          where: { active: true },
          orderBy: [
            { mainCategory: 'asc' },
            { category: 'asc' },
            { label: 'asc' },
          ],
          select: {
            id: true,
            mainCategory: true,
            category: true,
            label: true,
            description: true,
            unit: true,
            price: true,
            min: true,
            max: true,
            priceText: true,
            active: true,
          },
        }) as Promise<PricePromptItem[]>,
        prisma.knowledgeEntry.count({
          where: { mailAccountId, isActive: false, category: { startsWith: 'review:' } },
        }),
        prisma.knowledgeEntry.count({
          where: { mailAccountId, isActive: false, category: 'preise' },
        }),
      ]);

    console.log(`AI context dry-run for: ${mailAccount?.name ?? mailAccountId}`);
    console.log(`Active KnowledgeEntries: ${knowledgeEntries.length}`);
    console.log(`Inactive review KnowledgeEntries: ${inactiveReviewCount}`);
    console.log(`Inactive legacy price KnowledgeEntries: ${inactivePriceKnowledgeCount}`);
    console.log(`Active PriceItems: ${priceItems.length}`);
    console.log('');

    for (const testCase of TEST_CASES) {
      const hasPriceIntent = isPriceQuestion(testCase.input);
      const rawKnowledgeHits = matchKnowledgeEntries(testCase.input, knowledgeEntries);
      const knowledgeHits = hasPriceIntent
        ? rawKnowledgeHits.filter((hit) => !isPriceLikeKnowledgeEntry(hit.entry))
        : rawKnowledgeHits;
      const priceHits = hasPriceIntent ? matchPriceItems(testCase.input, priceItems) : [];
      const filteredPriceKnowledge = rawKnowledgeHits.length - knowledgeHits.length;

      console.log(`## ${testCase.name}`);
      console.log(`Input: ${testCase.input}`);
      console.log(`Expected: ${testCase.expected}`);
      console.log(`Price question: ${hasPriceIntent ? 'yes' : 'no'}`);
      console.log(
        `Price hits: ${
          priceHits.length > 0
            ? priceHits.map((hit) => `${hit.item.label} = ${formatPriceItem(hit.item)}`).join(' | ')
            : '-'
        }`
      );
      console.log(
        `Knowledge hits: ${
          knowledgeHits.length > 0
            ? knowledgeHits.map((hit) => `${hit.entry.title} (${hit.entry.category ?? '-'})`).join(' | ')
            : '-'
        }`
      );
      console.log(`Filtered legacy price knowledge hits: ${filteredPriceKnowledge}`);
      console.log('');
    }
  } finally {
    await prisma.$disconnect();
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
