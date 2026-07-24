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
    
    // Erstelle Backup über API-Route (intern)
    try {
        const { execSync } = await import('child_process');
        const backupScript = join(process.cwd(), 'scripts', 'backup-postgres.ts');
        
        console.log('📦 Erstelle automatisches tägliches Backup...');
        execSync(`tsx "${backupScript}"`, {
            encoding: 'utf-8',
            env: process.env,
            cwd: process.cwd(),
            stdio: 'pipe', // Silent, nur bei Fehler
        });
        
        console.log('✅ Automatisches Backup erfolgreich erstellt');
    } catch (error: any) {
        // Logge Fehler, aber breche nicht ab
        console.error('⚠️  Automatisches Backup fehlgeschlagen:', error.message);
    }
}
