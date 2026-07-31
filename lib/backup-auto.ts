/**
 * Automatisches Backup-System
 * Prüft ob heute schon ein Backup erstellt wurde und erstellt eines falls nötig
 */

import { readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Prüft ob heute schon ein Backup erstellt wurde
 */
export function hasBackupToday(backupsDir: string): boolean {
    try {
        const files = readdirSync(backupsDir);
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0]; // YYYY-MM-DD
        
        for (const file of files) {
            if (!file.startsWith('postgres-backup-')) continue;
            
            const filePath = join(backupsDir, file);
            try {
                const stats = statSync(filePath);
                const backupDate = new Date(stats.birthtime);
                const backupDateStr = backupDate.toISOString().split('T')[0];
                
                // Prüfe ob Backup von heute ist
                if (backupDateStr === todayStr) {
                    return true;
                }
            } catch {
                // Ignore errors
            }
        }
        
        return false;
    } catch {
        // Wenn Verzeichnis nicht existiert, gibt es kein Backup
        return false;
    }
}

/**
 * Erstellt automatisch ein Backup wenn heute noch keines erstellt wurde
 * Wird beim App-Start aufgerufen
 */
export async function ensureDailyBackup(): Promise<void> {
    // Nur im Production-Modus oder wenn explizit aktiviert
    if (process.env.NODE_ENV !== 'production' && !process.env.ENABLE_AUTO_BACKUP) {
        return;
    }
    
    const backupsDir = process.env.BACKUP_DIR || join(process.cwd(), 'backups');
    
    // Prüfe ob heute schon ein Backup existiert
    if (hasBackupToday(backupsDir)) {
        console.log('✅ Tägliches Backup bereits erstellt');
        return;
    }
    
    // Backup als Hintergrundprozess starten und NICHT darauf warten.
    //
    // Vorher stand hier execSync. Node ist einfaedig — der Aufruf hat die
    // Ereignisschleife fuer die gesamte Dauer des Backups eingefroren, und damit
    // die ganze App: gemessen liefen in dieser Zeit /signin und /api/health in
    // den Timeout, selbst /app (eine reine Weiterleitung ohne Datenbank) brauchte
    // sechs Sekunden. Das Backup schreibt die komplette Datenbank inklusive der
    // Bilder, die als Base64 in OrderImage.path liegen (Stand 31.07.2026: 111,5 MB)
    // — es dauert also Minuten, nicht Sekunden.
    //
    // Sichtbar wurde das nie, weil diese Funktion oben im Dev-Modus aussteigt.
    try {
        const { spawn } = await import('child_process');
        const backupScript = join(process.cwd(), 'scripts', 'backup-postgres.ts');

        console.log('📦 Starte automatisches tägliches Backup im Hintergrund...');

        const child = spawn('tsx', [backupScript], {
            env: process.env,
            cwd: process.cwd(),
            stdio: 'pipe',
            shell: true, // Windows: tsx liegt als .cmd vor
        });

        let fehlerAusgabe = '';
        child.stderr?.on('data', (d) => { fehlerAusgabe += String(d); });

        child.on('close', (code) => {
            if (code === 0) {
                console.log('✅ Automatisches Backup erfolgreich erstellt');
            } else {
                console.error(`⚠️  Automatisches Backup fehlgeschlagen (Code ${code}):`, fehlerAusgabe.slice(-500));
            }
        });

        child.on('error', (error) => {
            console.error('⚠️  Automatisches Backup konnte nicht gestartet werden:', error.message);
        });
    } catch (error: any) {
        // Logge Fehler, aber breche nicht ab
        console.error('⚠️  Automatisches Backup fehlgeschlagen:', error.message);
    }
}
