import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { hasBackupToday } from '@/lib/backup-auto';
import { execSync } from 'child_process';
import { join } from 'path';
import { getBackupRoot } from '@/lib/backup-paths';

/**
 * GET /api/admin/backup/auto
 * Prüft ob heute schon ein Backup erstellt wurde und erstellt eines falls nötig
 * Kann beim App-Start aufgerufen werden
 */
export async function GET() {
    try {
        const session = await getServerSession(authOptions);

        if (!session || (session.user?.role !== 'admin' && session.user?.role !== 'admin_no_feedback')) {
            return NextResponse.json(
                { error: 'Unauthorized - Admin access required' },
                { status: 401 }
            );
        }

        const backupsDir = getBackupRoot();
        
        // Prüfe ob heute schon ein Backup existiert
        if (hasBackupToday(backupsDir)) {
            return NextResponse.json({
                success: true,
                message: 'Backup für heute bereits vorhanden',
                action: 'skipped',
            });
        }
        
        // Erstelle Backup
        const backupScript = join(process.cwd(), 'scripts', 'backup-postgres.ts');
        
        try {
            const output = execSync(`tsx "${backupScript}"`, {
                encoding: 'utf-8',
                env: process.env,
                cwd: process.cwd(),
            });
            
            return NextResponse.json({
                success: true,
                message: 'Automatisches Backup erfolgreich erstellt',
                action: 'created',
                output: output.split('\n').slice(-10).join('\n'), // Letzte 10 Zeilen
            });
        } catch (error: any) {
            console.error('Auto-backup error:', error);
            return NextResponse.json(
                {
                    success: false,
                    message: 'Automatisches Backup fehlgeschlagen',
                    error: error.message || String(error),
                    output: error.stdout || error.stderr || '',
                },
                { status: 500 }
            );
        }
    } catch (error) {
        console.error('Auto-backup API error:', error);
        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
        );
    }
}
