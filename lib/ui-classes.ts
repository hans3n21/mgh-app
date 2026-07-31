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

// Aeusserer Kasten einer Seite. Am Handy BEWUSST ohne eigene Rahmenoptik:
// gemessen auf 375px steckten Inhalte in drei ineinandergeschachtelten
// Polsterungen — Layout (16px), Seiten-Kasten (16px), Inhaltskarte (16px) —
// zusammen 96px, also 26% der Bildschirmbreite, bevor der erste Buchstabe kam.
// Der Rahmen um die GANZE Seite trennt dort nichts von nichts; ab sm ist Platz
// genug und er hilft wieder bei der Gliederung.
export const PAGE_PANEL =
  'sm:rounded-2xl sm:border sm:border-slate-800 sm:bg-slate-900/60 sm:p-4';
