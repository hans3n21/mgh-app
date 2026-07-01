/**
 * Prüft ob PostgreSQL-Tools (pg_dump, psql) verfügbar sind
 */

import { execSync } from 'child_process';

export interface PostgresToolsStatus {
    pgDump: {
        available: boolean;
        path?: string;
        error?: string;
    };
    psql: {
        available: boolean;
        path?: string;
        error?: string;
    };
}

/**
 * Prüft ob ein Command verfügbar ist
 */
function checkCommand(command: string, windowsCommand?: string): { available: boolean; path?: string; error?: string } {
    try {
        const isWindows = process.platform === 'win32';
        const checkCmd = isWindows 
            ? (windowsCommand || `where ${command}`)
            : `which ${command}`;
        
        const result = execSync(checkCmd, { 
            encoding: 'utf-8',
            stdio: 'pipe',
        });
        
        const path = result.trim().split('\n')[0];
        
        return {
            available: true,
            path: path || undefined,
        };
    } catch (error: any) {
        return {
            available: false,
            error: error.message || 'Command not found',
        };
    }
}

/**
 * Prüft ob PostgreSQL-Tools verfügbar sind
 */
export function checkPostgresTools(): PostgresToolsStatus {
    const pgDump = checkCommand('pg_dump', 'where pg_dump');
    const psql = checkCommand('psql', 'where psql');
    
    return {
        pgDump,
        psql,
    };
}

/**
 * Gibt eine benutzerfreundliche Fehlermeldung zurück
 */
export function getPostgresToolsErrorMessage(status: PostgresToolsStatus): string | null {
    const missing: string[] = [];
    
    if (!status.pgDump.available) {
        missing.push('pg_dump');
    }
    if (!status.psql.available) {
        missing.push('psql');
    }
    
    if (missing.length === 0) {
        return null;
    }
    
    const isWindows = process.platform === 'win32';
    const installHint = isWindows
        ? 'Installieren Sie PostgreSQL Client Tools oder fügen Sie den PostgreSQL bin-Ordner zum PATH hinzu.'
        : 'Installieren Sie PostgreSQL Client Tools: sudo apt-get install postgresql-client (Ubuntu/Debian) oder brew install postgresql (macOS)';
    
    return `PostgreSQL-Tools fehlen: ${missing.join(', ')}. ${installHint}`;
}
