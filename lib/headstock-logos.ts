// Zentrale Liste der Headstock-Logos.
// Wird an drei Stellen genutzt: Autofill-Optionen im Auftrag, Bildvorschau im
// Formular (HeadstockLogoInput) und die Bildergalerie im Kunden-PDF.
// `value` ist der Wert, der so in OrderSpecKV landet — nicht aendern, ohne die
// bestehenden Auftraege zu migrieren.
export type HeadstockLogo = {
  value: string;
  /** Kurzbeschreibung fuer Kunden (Bildunterschrift im PDF, Tooltip in der App) */
  description?: string;
  /** Pfad unter public/ — Original-Foto, undefined = kein Bild vorhanden */
  image?: string;
  /** Verkleinerte Variante fuer PDF/Vorschau (scripts/build-headstock-thumbs.ts) */
  thumb?: string;
};

export const HEADSTOCK_LOGOS: HeadstockLogo[] = [
  {
    value: 'Altes Logo',
    description: 'MGH Guitars Schriftzug',
    image: '/images/logos/headstocks/logo-old.jpg',
    thumb: '/images/logos/headstocks/thumbs/logo-old.jpg',
  },
  {
    value: 'Neues Logo',
    description: 'MGH Emblem, deckend',
    image: '/images/logos/headstocks/logo-new.jpg',
    thumb: '/images/logos/headstocks/thumbs/logo-new.jpg',
  },
  {
    value: 'Neues Logo (Outline)',
    description: 'MGH Emblem, nur Kontur',
    image: '/images/logos/headstocks/logo-new-outline.jpg',
    thumb: '/images/logos/headstocks/thumbs/logo-new-outline.jpg',
  },
  {
    value: 'Eigenes Logo',
    description: 'Vorlage bitte mitschicken',
  },
  {
    value: 'Kein Logo',
  },
];

/** Reine Auswahlwerte — Reihenfolge wie im Dropdown. */
export const HEADSTOCK_LOGO_OPTIONS: string[] = HEADSTOCK_LOGOS.map((l) => l.value);

/** Nur die Eintraege mit Bild — Grundlage fuer Galerie und Vorschau. */
export const HEADSTOCK_LOGOS_WITH_IMAGE = HEADSTOCK_LOGOS.filter(
  (l): l is HeadstockLogo & { image: string; thumb: string } => Boolean(l.image && l.thumb),
);

export function findHeadstockLogo(value?: string): HeadstockLogo | undefined {
  const needle = (value || '').trim().toLowerCase();
  if (!needle) return undefined;
  return HEADSTOCK_LOGOS.find((l) => l.value.toLowerCase() === needle);
}
