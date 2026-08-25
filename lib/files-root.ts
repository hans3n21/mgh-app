import path from 'path';

/**
 * Wurzelverzeichnis fuer hochgeladene Dateien (uploads/...).
 *
 * Ueber FILES_ROOT konfigurierbar, damit alle Rechner (Chef-PC, Entwicklung)
 * denselben Bestand auf dem NAS lesen und schreiben. Vorher speicherte jeder
 * Rechner unter seinem eigenen process.cwd() — die geteilte Datenbank kannte
 * dann Pfade, deren Dateien nur auf dem Rechner lagen, der den Mail-Sync
 * gefahren hatte; auf allen anderen blieben die Bilder tot (404).
 *
 * Ohne FILES_ROOT bleibt alles wie bisher im Projektverzeichnis.
 */
export function filesRoot(): string {
    const configured = process.env.FILES_ROOT?.trim();
    return configured ? configured : process.cwd();
}

/**
 * Loest einen in der DB gespeicherten local:-Relativpfad (ohne Praefix) gegen
 * die Dateiwurzel auf. Gibt null zurueck, wenn der Pfad aus der Wurzel
 * ausbricht (../-Tricks).
 */
export function resolveFilesPath(relPath: string): string | null {
    const root = path.resolve(filesRoot());
    const abs = path.resolve(root, relPath);
    if (abs !== root && !abs.startsWith(root + path.sep)) return null;
    return abs;
}
