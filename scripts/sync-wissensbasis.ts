import type { KnowledgeEntry, PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { loadEnvConfig } from '@next/env';
import { randomUUID } from 'crypto';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, relative } from 'path';

type Frontmatter = Record<string, string | boolean>;

type ParsedKnowledgeDoc = {
  fileName: string;
  sourcePath: string;
  title: string;
  content: string;
  status: string;
  kiFreigabe: boolean;
  category: string;
  keywords: string[];
  sortOrder: number;
  piiWarnings: string[];
  priceWarnings: string[];
  isActive: boolean;
};

type DuplicateInfo = {
  exactTitle?: ComparableKnowledgeEntry;
  similar: Array<{ entry: ComparableKnowledgeEntry; reason: string }>;
};

type ComparableKnowledgeEntry = Pick<
  KnowledgeEntry,
  'id' | 'title' | 'keywords' | 'content' | 'category' | 'isActive' | 'sortOrder' | 'updatedAt'
>;

type GlobalKnowledgeEntryRow = ComparableKnowledgeEntry & {
  status: string;
  kiFreigabe: boolean;
  sourcePath: string | null;
};

const DOCS_DIR = join(process.cwd(), 'docs', 'wissensbasis');
loadEnvConfig(process.cwd());
let prisma: PrismaClient;

const KEYWORD_HINTS: Record<string, string[]> = {
  '00_firmendaten_und_marken.md': [
    'firmendaten',
    'mgh',
    'der trashcontainer',
    'dein pickguard',
    'mgh guitars',
    'werkstatt',
    'tonalitaet',
    'sonderwuensche',
    'kontakt',
    'whatsapp',
  ],
  '01_versandkosten.md': [
    'versand',
    'versandkosten',
    'dhl',
    'tracking',
    'warenpost',
    'ausland',
    'briefversand',
    'lieferung',
  ],
  '02_lieferzeiten.md': [
    'lieferzeit',
    'lieferzeiten',
    'bearbeitungszeit',
    'produktionszeit',
    'wartezeit',
    'dauer',
  ],
  '03_pickguards_preise_und_ablauf.md': [
    'pickguard',
    'pickguards',
    'dein pickguard',
    'preise',
    'sparkle',
    'tortoise',
    'versandmarke',
    'einsendung',
    'fraesung',
    'shielding',
  ],
  '04_mgh_economy_serie.md': [
    'mgh economy',
    'economy serie',
    'serie',
    'modell',
    'standard',
    'gitarre',
  ],
  '05_custom_anfragen_bodies_haelse_gitarren.md': [
    'custom',
    'body',
    'bodies',
    'hals',
    'haelse',
    'gitarre',
    'gitarren',
    'sonderanfertigung',
    'mensur',
    'holz',
    'finish',
  ],
  '06_zahlung_customauftraege.md': [
    'zahlung',
    'anzahlung',
    'customauftrag',
    'customauftraege',
    'paypal',
    'ueberweisung',
    'rechnung',
  ],
  '07_storno_customauftraege.md': [
    'storno',
    'stornierung',
    'abbruch',
    'ruecktritt',
    'customauftrag',
    'customauftraege',
  ],
  '08_reklamation.md': [
    'reklamation',
    'reklamieren',
    'defekt',
    'fehler',
    'beschaedigt',
    'beschwerde',
    'nachbesserung',
  ],
  '09_vorlagen_dateien_und_templates.md': [
    'vorlage',
    'datei',
    'template',
    'vektor',
    'skizze',
    'scan',
    'masse',
    'lineal',
  ],
  '10_sprachen.md': [
    'sprache',
    'sprachen',
    'englisch',
    'international',
    'uebersetzung',
    'ausland',
  ],
  '01_versandregeln.md': [
    'versand',
    'versandkosten',
    'shipping',
    'tracking',
    'dhl',
    'briefversand',
    'kleine bestellung',
    'zoll',
    'gebuehren',
  ],
  '03_pickguard_ablauf.md': [
    'pickguard',
    'pickguards',
    'dein pickguard',
    'ablauf',
    'custom pickguard',
    'versandmarke',
    'einsendung',
    'fraesung',
    'shielding',
    'vorlage',
    'fertigungszeit',
  ],
  '04_mgh_economy_serie.md': [
    'mgh economy',
    'economy serie',
    'economy',
    'gitarre',
    'gitarren',
    'custom build',
    'specs',
    'oil wax',
    'fixed bridge',
  ],
  '06_zahlung_customauftraege.md': [
    'zahlung',
    'anzahlung',
    'teilzahlung',
    'customauftrag',
    'customauftraege',
    'custom auftrag',
    'custom auftraege',
    'vorkasse',
    'finish',
    'ratenzahlung',
  ],
};

const KEYWORD_STOPWORDS = new Set([
  'aber',
  'alle',
  'als',
  'antwort',
  'antwortbaustein',
  'auf',
  'aus',
  'bei',
  'das',
  'der',
  'die',
  'dies',
  'ein',
  'eine',
  'english',
  'fuer',
  'grundregel',
  'in',
  'ist',
  'mit',
  'nach',
  'nicht',
  'oder',
  'regeln',
  'sagen',
  'soll',
  'und',
  'wenn',
  'wie',
  'zu',
]);

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    apply: false,
    updateExisting: false,
    includePriceContent: false,
    listAccounts: false,
    listExisting: false,
    defaultAccount: false,
    global: false,
    mailAccountId: '',
    dir: DOCS_DIR,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--apply') opts.apply = true;
    else if (arg === '--update-existing') opts.updateExisting = true;
    else if (arg === '--include-price-content') opts.includePriceContent = true;
    else if (arg === '--list-accounts') opts.listAccounts = true;
    else if (arg === '--list-existing') opts.listExisting = true;
    else if (arg === '--default-account') opts.defaultAccount = true;
    else if (arg === '--global') opts.global = true;
    else if (arg === '--mail-account-id') opts.mailAccountId = args[++i] ?? '';
    else if (arg === '--dir') opts.dir = args[++i] ?? opts.dir;
    else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return opts;
}

function printUsage() {
  console.log(`Usage:
  npm run knowledge:sync -- --list-accounts
  npm run knowledge:sync -- --mail-account-id <id> --list-existing
  npm run knowledge:sync -- --global --list-existing
  npm run knowledge:sync -- --default-account
  npm run knowledge:sync -- --mail-account-id <id>
  npm run knowledge:sync -- --mail-account-id <id> --apply
  npm run knowledge:sync -- --global --dir docs/wissensbasis_import_ready --apply
  npm run knowledge:sync -- --mail-account-id <id> --apply --include-price-content

Notes:
  Default mode is dry-run. Use --apply to write KnowledgeEntry rows.
  Use --global to target GlobalKnowledgeEntry instead of a specific mail account.
  Review/draft docs are imported as isActive=false.
  Docs with price review warnings are skipped on apply unless --include-price-content is passed.
  Existing titles are skipped unless --update-existing is passed.`);
}

function parseFrontmatter(raw: string): { meta: Frontmatter; body: string } {
  const normalized = raw.replace(/^\uFEFF/, '');
  if (!normalized.startsWith('---')) {
    return { meta: {}, body: normalized.trim() };
  }

  const end = normalized.indexOf('\n---', 3);
  if (end === -1) return { meta: {}, body: normalized.trim() };

  const frontmatterText = normalized.slice(3, end).trim();
  const body = normalized.slice(end + 4).trim();
  const meta: Frontmatter = {};

  for (const line of frontmatterText.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;
    const key = match[1];
    const rawValue = match[2].trim();
    if (rawValue === 'true') meta[key] = true;
    else if (rawValue === 'false') meta[key] = false;
    else meta[key] = rawValue.replace(/^["']|["']$/g, '');
  }

  return { meta, body };
}

function parseDocs(dir: string): ParsedKnowledgeDoc[] {
  if (!existsSync(dir)) {
    throw new Error(`Knowledge docs directory not found: ${dir}`);
  }

  return readdirSync(dir)
    .filter((name) => name.endsWith('.md') && name.toLowerCase() !== 'readme.md')
    .sort((a, b) => a.localeCompare(b))
    .map((fileName) => {
      const sourcePath = join(dir, fileName);
      const raw = readFileSync(sourcePath, 'utf-8');
      const { meta, body } = parseFrontmatter(raw);
      const title = extractTitle(body, fileName);
      const status = String(meta.status ?? 'draft').toLowerCase();
      const kiFreigabe = meta.ki_freigabe === true;
      const isActive = status === 'approved' && kiFreigabe;
      const baseCategory = slugify(String(meta.bereich ?? fileName.replace(/^\d+_/, '').replace(/\.md$/, '')));
      const category = isActive ? baseCategory : `${status}:${baseCategory}`;
      const sortOrder = Number(fileName.match(/^(\d+)/)?.[1] ?? 0);
      const priceWarnings = scanForPriceReviewContent(fileName, body);

      return {
        fileName,
        sourcePath,
        title,
        content: body.trim(),
        status,
        kiFreigabe,
        category,
        keywords: buildKeywords(fileName, title, body, baseCategory),
        sortOrder,
        piiWarnings: scanForPiiLikeData(body),
        priceWarnings,
        isActive,
      };
    });
}

function extractTitle(body: string, fileName: string) {
  const title = body.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (title) return title;
  return fileName.replace(/^\d+_/, '').replace(/\.md$/, '').replace(/_/g, ' ');
}

function buildKeywords(fileName: string, title: string, body: string, category: string) {
  const headings = Array.from(body.matchAll(/^#{2,3}\s+(.+)$/gm))
    .flatMap((match) => splitWords(match[1]))
    .filter((word) => word.length >= 5);

  const seeded = [
    category,
    ...splitWords(title),
    ...(KEYWORD_HINTS[fileName] ?? []),
    ...headings.slice(0, 8),
  ];

  return unique(seeded.map(normalizeKeyword).filter((keyword) => keyword && !KEYWORD_STOPWORDS.has(keyword))).slice(0, 14);
}

function splitWords(text: string) {
  return text
    .replace(/[|:()[\],.;!?"/]/g, ' ')
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);
}

function normalizeKeyword(keyword: string) {
  return keyword.toLowerCase().trim().replace(/\s+/g, ' ');
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'sonstiges';
}

function unique<T>(values: T[]) {
  return Array.from(new Set(values));
}

function scanForPiiLikeData(text: string) {
  const checks = [
    { label: 'email-like value', regex: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi },
    { label: 'phone-like value', regex: /(?:\+?\d[\d\s()./-]{7,}\d)/g },
    { label: 'iban-like value', regex: /\b[A-Z]{2}\d{2}[A-Z0-9 ]{10,30}\b/g },
  ];

  const warnings: string[] = [];
  for (const check of checks) {
    const matches = unique(Array.from(text.matchAll(check.regex)).map((match) => match[0].trim()));
    if (matches.length > 0) {
      warnings.push(`${check.label}: ${matches.slice(0, 3).join(', ')}${matches.length > 3 ? ' ...' : ''}`);
    }
  }
  return warnings;
}

function scanForPriceReviewContent(fileName: string, text: string) {
  const warnings: string[] = [];
  const lowerFileName = fileName.toLowerCase();
  const hasPriceHeading = /^##\s+preise?\b/im.test(text);
  const hasPriceTable = /^\|.+(?:eur|€).+\|$/im.test(text);
  const amountMatches = unique(Array.from(text.matchAll(/\b(?:ab\s*)?\d+(?:[,.]\d+)?\s*(?:eur|€)\b/gi)).map((match) => match[0]));

  if (lowerFileName.includes('preis') || hasPriceHeading || hasPriceTable) {
    warnings.push('contains markdown price list; use only as review source for PriceItem, not as final KnowledgeEntry price truth');
  }
  if (amountMatches.length >= 3) {
    warnings.push(`contains multiple price-like amounts: ${amountMatches.slice(0, 5).join(', ')}${amountMatches.length > 5 ? ' ...' : ''}`);
  }

  return warnings;
}

function normalizeForCompare(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function findDuplicates(doc: ParsedKnowledgeDoc, entries: ComparableKnowledgeEntry[]): DuplicateInfo {
  const titleNorm = normalizeForCompare(doc.title);
  const contentNorm = normalizeForCompare(doc.content);
  const exactTitle = entries.find((entry) => normalizeForCompare(entry.title) === titleNorm);

  const similar = entries
    .filter((entry) => entry.id !== exactTitle?.id)
    .map((entry) => {
      const entryTitle = normalizeForCompare(entry.title);
      const entryContent = normalizeForCompare(entry.content);
      const overlap = keywordOverlap(doc.keywords, entry.keywords);

      if (entryTitle.includes(titleNorm) || titleNorm.includes(entryTitle)) {
        return { entry, reason: 'similar title' };
      }
      if (contentNorm && entryContent && (entryContent.includes(contentNorm.slice(0, 120)) || contentNorm.includes(entryContent.slice(0, 120)))) {
        return { entry, reason: 'similar content' };
      }
      if (overlap >= 0.45) {
        return { entry, reason: `keyword overlap ${Math.round(overlap * 100)}%` };
      }
      return null;
    })
    .filter((item): item is { entry: KnowledgeEntry; reason: string } => item !== null)
    .slice(0, 3);

  return { exactTitle, similar };
}

function keywordOverlap(a: string[], b: string[]) {
  if (a.length === 0 || b.length === 0) return 0;
  const left = new Set(a.map(normalizeKeyword));
  const right = new Set(b.map(normalizeKeyword));
  const hits = Array.from(left).filter((keyword) => right.has(keyword)).length;
  return hits / Math.max(left.size, right.size);
}

async function resolveMailAccountId(opts: ReturnType<typeof parseArgs>) {
  if (opts.mailAccountId) return opts.mailAccountId;
  if (!opts.defaultAccount) return '';

  const account = await prisma.mailAccount.findFirst({
    where: { isDefault: true, isActive: true },
    select: { id: true },
  });
  return account?.id ?? '';
}

async function listAccounts() {
  const accounts = await prisma.mailAccount.findMany({
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    select: { id: true, name: true, email: true, isDefault: true, isActive: true },
  });

  if (accounts.length === 0) {
    console.log('No mail accounts found.');
    return;
  }

  console.log('Mail accounts:');
  for (const account of accounts) {
    console.log(`- ${account.id} | ${account.name} | ${maskEmail(account.email)} | default=${account.isDefault} active=${account.isActive}`);
  }
}

async function listExistingKnowledge(mailAccountId: string) {
  const entries = await prisma.knowledgeEntry.findMany({
    where: { mailAccountId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      title: true,
      category: true,
      keywords: true,
      isActive: true,
      sortOrder: true,
      updatedAt: true,
    },
  });

  if (entries.length === 0) {
    console.log(`No KnowledgeEntry rows found for mailAccountId=${mailAccountId}.`);
    return;
  }

  console.log(`KnowledgeEntry rows for mailAccountId=${mailAccountId}:`);
  for (const entry of entries) {
    console.log(`- ${entry.id} | active=${entry.isActive} | category=${entry.category ?? '-'} | title=${entry.title}`);
    console.log(`  keywords: ${entry.keywords.join(', ') || '-'}`);
  }
}

async function listExistingGlobalKnowledge() {
  const entries = await fetchGlobalKnowledgeEntries();

  if (entries.length === 0) {
    console.log('No GlobalKnowledgeEntry rows found.');
    return;
  }

  console.log('GlobalKnowledgeEntry rows:');
  for (const entry of entries) {
    console.log(`- ${entry.id} | active=${entry.isActive} | status=${entry.status} | ki=${entry.kiFreigabe} | category=${entry.category ?? '-'} | title=${entry.title}`);
    console.log(`  keywords: ${entry.keywords.join(', ') || '-'}`);
    if (entry.sourcePath) console.log(`  source: ${entry.sourcePath}`);
  }
}

async function fetchGlobalKnowledgeEntries() {
  return prisma.$queryRaw<GlobalKnowledgeEntryRow[]>(Prisma.sql`
    SELECT
      "id",
      "title",
      "keywords",
      "content",
      "category",
      "status",
      "kiFreigabe",
      "isActive",
      "sourcePath",
      "sortOrder",
      "updatedAt"
    FROM "GlobalKnowledgeEntry"
    ORDER BY "sortOrder" ASC, "updatedAt" DESC
  `);
}

function keywordArraySql(keywords: string[]) {
  if (keywords.length === 0) return Prisma.sql`ARRAY[]::text[]`;
  return Prisma.sql`ARRAY[${Prisma.join(keywords)}]::text[]`;
}

async function createGlobalKnowledgeEntry(doc: ParsedKnowledgeDoc, sortOrder: number) {
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "GlobalKnowledgeEntry" (
      "id",
      "title",
      "keywords",
      "content",
      "category",
      "status",
      "kiFreigabe",
      "isActive",
      "sourcePath",
      "sortOrder",
      "updatedAt"
    )
    VALUES (
      ${randomUUID()},
      ${doc.title},
      ${keywordArraySql(doc.keywords)},
      ${doc.content},
      ${doc.category},
      ${doc.status},
      ${doc.kiFreigabe},
      ${doc.isActive},
      ${relative(process.cwd(), doc.sourcePath)},
      ${sortOrder},
      CURRENT_TIMESTAMP
    )
  `);
}

async function updateGlobalKnowledgeEntry(id: string, doc: ParsedKnowledgeDoc, sortOrder: number) {
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "GlobalKnowledgeEntry"
    SET
      "keywords" = ${keywordArraySql(doc.keywords)},
      "content" = ${doc.content},
      "category" = ${doc.category},
      "status" = ${doc.status},
      "kiFreigabe" = ${doc.kiFreigabe},
      "isActive" = ${doc.isActive},
      "sourcePath" = ${relative(process.cwd(), doc.sourcePath)},
      "sortOrder" = ${sortOrder},
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ${id}
  `);
}

function maskEmail(email: string) {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  return `${local.slice(0, 2)}***@${domain}`;
}

async function run() {
  const prismaModule = await import('@prisma/client');
  prisma = new prismaModule.PrismaClient();

  const opts = parseArgs();

  if (opts.listAccounts) {
    await listAccounts();
    return;
  }

  if (opts.global) {
    if (opts.listExisting) {
      await listExistingGlobalKnowledge();
      return;
    }

    const docs = parseDocs(opts.dir);
    const existing = await fetchGlobalKnowledgeEntries();

    console.log(`Knowledge source: ${relative(process.cwd(), opts.dir)}`);
    console.log('Target: GlobalKnowledgeEntry');
    console.log(`Mode: ${opts.apply ? 'APPLY' : 'DRY-RUN'}`);
    console.log(`Markdown docs: ${docs.length}`);
    console.log(`Existing GlobalKnowledgeEntry rows: ${existing.length}\n`);

    const maxSortOrder = existing.reduce((max, entry) => Math.max(max, entry.sortOrder), 0);
    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const [index, doc] of docs.entries()) {
      const dupes = findDuplicates(doc, existing);
      const statusLabel = doc.isActive ? 'approved/active' : `${doc.status}/inactive`;
      const blockedByPriceReview = doc.priceWarnings.length > 0 && !opts.includePriceContent;
      const action = blockedByPriceReview
        ? 'SKIP_PRICE_REVIEW'
        : dupes.exactTitle
        ? (opts.updateExisting ? 'UPDATE' : 'SKIP')
        : 'CREATE';

      console.log(`[${action}] ${doc.fileName} -> "${doc.title}" (${statusLabel})`);
      console.log(`  category: ${doc.category}`);
      console.log(`  keywords: ${doc.keywords.join(', ')}`);
      if (doc.piiWarnings.length > 0) {
        console.log(`  review warnings: ${doc.piiWarnings.join('; ')}`);
      }
      if (doc.priceWarnings.length > 0) {
        console.log(`  price review warnings: ${doc.priceWarnings.join('; ')}`);
      }
      if (dupes.exactTitle) {
        console.log(`  exact title match: ${dupes.exactTitle.id}`);
      }
      for (const similar of dupes.similar) {
        console.log(`  possible duplicate: ${similar.entry.title} (${similar.reason})`);
      }

      if (!opts.apply) {
        console.log('');
        continue;
      }

      if (blockedByPriceReview) {
        skipped++;
        console.log('  skipped on apply: price content must stay in PriceItem or be split/sanitized first');
        console.log('');
        continue;
      }

      if (dupes.exactTitle && !opts.updateExisting) {
        skipped++;
        console.log('');
        continue;
      }

      const sortOrder = doc.sortOrder || maxSortOrder + index + 1;
      if (dupes.exactTitle && opts.updateExisting) {
        await updateGlobalKnowledgeEntry(dupes.exactTitle.id, doc, sortOrder);
        updated++;
        console.log('');
        continue;
      }

      await createGlobalKnowledgeEntry(doc, sortOrder);
      created++;
      console.log('');
    }

    if (opts.apply) {
      console.log(`Done. Created=${created} Updated=${updated} Skipped=${skipped}`);
    } else {
      console.log('Dry-run only. Add --apply to write changes.');
    }
    return;
  }

  const mailAccountId = await resolveMailAccountId(opts);
  if (!mailAccountId) {
    printUsage();
    throw new Error('Missing --mail-account-id <id> or --default-account');
  }

  if (opts.listExisting) {
    await listExistingKnowledge(mailAccountId);
    return;
  }

  const docs = parseDocs(opts.dir);
  const existing = await prisma.knowledgeEntry.findMany({
    where: { mailAccountId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });

  console.log(`Knowledge source: ${relative(process.cwd(), opts.dir)}`);
  console.log(`Target mailAccountId: ${mailAccountId}`);
  console.log(`Mode: ${opts.apply ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`Markdown docs: ${docs.length}`);
  console.log(`Existing KnowledgeEntry rows: ${existing.length}\n`);

  const maxSortOrder = existing.reduce((max, entry) => Math.max(max, entry.sortOrder), 0);
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const [index, doc] of docs.entries()) {
    const dupes = findDuplicates(doc, existing);
    const statusLabel = doc.isActive ? 'approved/active' : `${doc.status}/inactive`;
    const blockedByPriceReview = doc.priceWarnings.length > 0 && !opts.includePriceContent;
    const action = blockedByPriceReview
      ? 'SKIP_PRICE_REVIEW'
      : dupes.exactTitle
      ? (opts.updateExisting ? 'UPDATE' : 'SKIP')
      : 'CREATE';

    console.log(`[${action}] ${doc.fileName} -> "${doc.title}" (${statusLabel})`);
    console.log(`  category: ${doc.category}`);
    console.log(`  keywords: ${doc.keywords.join(', ')}`);
    if (doc.piiWarnings.length > 0) {
      console.log(`  review warnings: ${doc.piiWarnings.join('; ')}`);
    }
    if (doc.priceWarnings.length > 0) {
      console.log(`  price review warnings: ${doc.priceWarnings.join('; ')}`);
    }
    if (dupes.exactTitle) {
      console.log(`  exact title match: ${dupes.exactTitle.id}`);
    }
    for (const similar of dupes.similar) {
      console.log(`  possible duplicate: ${similar.entry.title} (${similar.reason})`);
    }

    if (!opts.apply) {
      console.log('');
      continue;
    }

    if (blockedByPriceReview) {
      skipped++;
      console.log('  skipped on apply: price content must stay in PriceItem or be split/sanitized first');
      console.log('');
      continue;
    }

    if (dupes.exactTitle && !opts.updateExisting) {
      skipped++;
      console.log('');
      continue;
    }

    if (dupes.exactTitle && opts.updateExisting) {
      await prisma.knowledgeEntry.update({
        where: { id: dupes.exactTitle.id },
        data: {
          keywords: doc.keywords,
          content: doc.content,
          category: doc.category,
          isActive: doc.isActive,
          sortOrder: doc.sortOrder || dupes.exactTitle.sortOrder,
        },
      });
      updated++;
      console.log('');
      continue;
    }

    await prisma.knowledgeEntry.create({
      data: {
        mailAccountId,
        title: doc.title,
        keywords: doc.keywords,
        content: doc.content,
        category: doc.category,
        isActive: doc.isActive,
        sortOrder: maxSortOrder + index + 1,
      },
    });
    created++;
    console.log('');
  }

  if (opts.apply) {
    console.log(`Done. Created=${created} Updated=${updated} Skipped=${skipped}`);
  } else {
    console.log('Dry-run only. Add --apply to write changes.');
  }
}

run()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma?.$disconnect();
  });
