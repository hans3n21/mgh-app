// Eine Quelle fuer beide Navigationen (Navigation.tsx oben, GlobalMobileNav.tsx
// unten). Vorher waren es zwei getrennt gepflegte Listen — mit dem Ergebnis, dass
// "Auftraege" in der mobilen Leiste komplett fehlte und dieselben Bereiche oben
// und unten unterschiedlich hiessen ("Labelgenerator"/"Labels", "Einkauf"/"Beschaffung").

export interface NavItem {
  href: string;
  label: string;
  /** Kuerzere Beschriftung fuer die schmale mobile Leiste. */
  shortLabel?: string;
  icon: string;
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/app', label: 'Dashboard', icon: '🏠' },
  { href: '/app/posteingang', label: 'Posteingang', icon: '📬' },
  { href: '/app/orders', label: 'Aufträge', icon: '📋' },
  { href: '/app/customers', label: 'Kunden', icon: '👥' },
  { href: '/app/label-generator', label: 'Labelgenerator', shortLabel: 'Labels', icon: '🏷️' },
  { href: '/app/prices', label: 'Preise', icon: '💰' },
  { href: '/app/wissen', label: 'Wissen', icon: '📚' },
  { href: '/app/procurement', label: 'Einkauf', icon: '📦' },
  { href: '/app/settings', label: 'Einstellungen', icon: '⚙️' },
];
