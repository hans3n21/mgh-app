// Gemeinsame Klassen fuer die Werkzeugleiste ueber dem Datenblatt.
// An einer Stelle, damit die Knoepfe nicht wieder auseinanderlaufen — vorher
// war einer grau gefuellt, einer violett, einer rahmenlos.
//
// Bewusst rahmen- und flaechenlos: hervorgehoben wird nur der Bearbeiten-Knopf.
// Beschriftung ist immer sichtbar, auch auf dem Handy — reine Emoji-Knoepfe
// muss man raten.
export const TOOLBAR_BUTTON =
  'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs sm:text-sm ' +
  'text-slate-300 transition-colors hover:bg-slate-800 hover:text-slate-100';
