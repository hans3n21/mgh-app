export type PriceCategoryInput = {
  mainCategory?: string | null
  category?: string | null
  label?: string | null
  description?: string | null
}

const CATEGORY_MAP: Array<{ mainCategory: string; categories: string[] }> = [
  {
    mainCategory: 'Reparaturen',
    categories: [
      'Setup',
      'Kopfplatte',
      'Griffbrett',
      'Korpus',
      'Elektronik & Elektrik',
      'Pickup-Schmiede',
      'Oberflaechenbehandlung',
      'Inlays',
      'Custom Gravur & Print',
    ],
  },
  {
    mainCategory: 'Guitar Parts',
    categories: [
      'Necks & Fretboards',
      'Bodies',
      'Knobs & Frames',
      'Custom Pickups',
    ],
  },
  {
    mainCategory: 'Pickguards',
    categories: [
      'Pickguards',
      'Trussrodcover',
      'Backplates & Rahmen',
      'Pickguard Zusatzoptionen',
    ],
  },
  {
    mainCategory: 'Versand',
    categories: [
      'Versandkosten',
      'Gitarrenversand',
      'Versandmarke',
    ],
  },
  {
    mainCategory: 'MGH Guitars',
    categories: [
      'MGH Economy Serie',
      'Custom Gitarren',
      'Gitarrenbau',
    ],
  },
]

const TEXT_RULES: Array<{ mainCategory: string; terms: string[] }> = [
  {
    mainCategory: 'Versand',
    terms: [
      'versand',
      'porto',
      'verpackung',
      'dhl',
      'shipping',
      'ship',
      'sendung',
      'versandmarke',
    ],
  },
  {
    mainCategory: 'Pickguards',
    terms: [
      'pickguard',
      'pickguards',
      'schlagbrett',
      'schlagbretter',
      'trussrodcover',
      'trussrod',
      'backplate',
      'tremolodeckel',
      'pickuprahmen',
      'shielding',
    ],
  },
  {
    mainCategory: 'MGH Guitars',
    terms: [
      'economy serie',
      'economy',
      'custom gitarre',
      'custom guitar',
      'gitarrenbau',
      'instrument',
    ],
  },
  {
    mainCategory: 'Guitar Parts',
    terms: [
      'body',
      'bodies',
      'hals',
      'haelse',
      'halse',
      'neck',
      'necks',
      'fretboard',
      'griffbrett',
      'pickup',
      'pickups',
      'humbucker',
      'single coil',
      'singlecoil',
      'p90',
      'knob',
      'potiknopf',
      'rahmen',
    ],
  },
  {
    mainCategory: 'Reparaturen',
    terms: [
      'reparatur',
      'setup',
      'sattel',
      'bund',
      'buende',
      'bunde',
      'lack',
      'lackierung',
      'loet',
      'lot',
      'elektronik',
      'mechanik',
      'halsbruch',
      'reinigung',
      'abrichten',
      'neubundierung',
    ],
  },
]

export function normalizePriceText(value: string | null | undefined) {
  return (value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
}

function normalizeOptionalPriceText(value: string | null | undefined) {
  const normalized = normalizePriceText(value)
  return normalized || null
}

export function inferPriceMainCategory(input: PriceCategoryInput): string | null {
  const provided = normalizePriceText(input.mainCategory)
  if (provided) return provided

  const category = normalizePriceText(input.category)
  const normalizedCategory = normalizeForCategory(category)

  for (const group of CATEGORY_MAP) {
    if (group.categories.some((candidate) => normalizeForCategory(candidate) === normalizedCategory)) {
      return group.mainCategory
    }
  }

  const haystack = normalizeForCategory(
    [input.category, input.label, input.description]
      .filter(Boolean)
      .join(' ')
  )

  for (const rule of TEXT_RULES) {
    if (rule.terms.some((term) => haystack.includes(normalizeForCategory(term)))) {
      return rule.mainCategory
    }
  }

  return 'Sonstiges'
}

export function normalizePriceItemInput<T extends PriceCategoryInput>(input: T): T & { mainCategory: string | null } {
  const category = normalizePriceText(input.category)
  const label = normalizePriceText(input.label)
  const description = normalizeOptionalPriceText(input.description)
  const mainCategory = inferPriceMainCategory({
    ...input,
    category,
    label,
    description,
  })

  return {
    ...input,
    ...(category && { category }),
    ...(label && { label }),
    description,
    mainCategory,
  }
}

function normalizeForCategory(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}
