import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { execSync } from 'child_process';
import { join } from 'path';
import { readdirSync, statSync, existsSync, readFileSync, rmSync } from 'fs';
import { readdir } from 'fs/promises';
import { getBackupRoot, resolveBackupDirectory } from '@/lib/backup-paths';

/**
 * POST /api/admin/backup
 * Erstellt ein neues Backup der Datenbank
 * Nur für Admins
 */
export async function POST() {
    try {
        const session = await getServerSession(authOptions);
        
        if (!session || (session.user?.role !== 'admin' && session.user?.role !== 'admin_no_feedback')) {
            return NextResponse.json(
                { error: 'Unauthorized - Admin access required' },
                { status: 401 }
            );
        }

        // Führe Backup-Script aus
        const backupScript = join(process.cwd(), 'scripts', 'backup-postgres.ts');
        
        try {
            // Führe das Backup-Script aus
            const output = execSync(`tsx "${backupScript}"`, {
                encoding: 'utf-8',
                env: process.env,
                cwd: process.cwd(),
            });

            // Extrahiere Backup-Pfad aus Output
            const backupDirMatch = output.match(/📁 Backup directory: (.+)/);
            const backupPath = backupDirMatch ? backupDirMatch[1] : null;

            // Prüfe ob SQL-Dump erfolgreich war
            let sqlDumpWarning: string | null = null;
            if (backupPath) {
                try {
                    const metadataPath = join(backupPath, '_metadata.json');
                    if (existsSync(metadataPath)) {
                        const metadata = JSON.parse(readFileSync(metadataPath, 'utf-8'));
                        if (metadata.sqlDump && !metadata.sqlDump.success) {
                            sqlDumpWarning = metadata.sqlDump.error || 'SQL-Dump konnte nicht erstellt werden';
                        }
                    }
                } catch {
                    // Ignore errors reading metadata
                }
            }

            // Prüfe Output auf SQL-Dump Warnungen
            if (!sqlDumpWarning && output.includes('SQL dump failed')) {
                sqlDumpWarning = 'SQL-Dump konnte nicht erstellt werden. Prüfen Sie ob pg_dump installiert ist.';
            }

            return NextResponse.json({
                success: true,
                message: 'Backup erfolgreich erstellt',
                output: output.split('\n').slice(-10).join('\n'), // Letzte 10 Zeilen
                backupPath,
                sqlDumpWarning,
            });
        } catch (error: any) {
            console.error('Backup error:', error);
            return NextResponse.json(
                { 
                    error: 'Backup fehlgeschlagen',
                    details: error.message || String(error),
                    output: error.stdout || error.stderr || '',
                },
                { status: 500 }
            );
        }
    } catch (error) {
        console.error('Backup API error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

/**
 * GET /api/admin/backup
 * Listet alle verfügbaren Backups auf
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
        
        try {
            const files = readdirSync(backupsDir);
            const backups = await Promise.all(
                files
                    .filter(file => file.startsWith('postgres-backup-'))
                    .map(async (file) => {
                        const filePath = join(backupsDir, file);
                        const stats = statSync(filePath);
                        
                        // Berechne Gesamtgröße aller Dateien im Backup-Verzeichnis
                        let totalSize = 0;
                        let hasSqlDump = false;
                        let sqlDumpError: string | undefined = undefined;
                        
                        try {
                            const filesInDir = await readdir(filePath, { withFileTypes: true });
                            for (const dirent of filesInDir) {
                                if (dirent.isFile()) {
                                    const fileStats = statSync(join(filePath, dirent.name));
                                    totalSize += fileStats.size;
                                    if (dirent.name === 'database.sql') {
                                        hasSqlDump = true;
                                    }
                                }
                            }
                            
                            // Prüfe Metadaten für SQL-Dump Fehler
                            const metadataPath = join(filePath, '_metadata.json');
                            if (existsSync(metadataPath)) {
                                try {
                                    const metadata = JSON.parse(readFileSync(metadataPath, 'utf-8'));
                                    if (metadata.sqlDump && !metadata.sqlDump.success && metadata.sqlDump.error) {
                                        sqlDumpError = metadata.sqlDump.error;
                                    }
                                } catch {
                                    // Ignore metadata parse errors
                                }
                            }
                        } catch {
                            // Ignore
                        }

                        return {
                            name: file,
                            path: filePath,
                            createdAt: stats.birthtime,
                            modifiedAt: stats.mtime,
                            size: totalSize,
                            hasSqlDump,
                            sqlDumpError,
                        };
                    })
            );
            
            backups.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

            return NextResponse.json({
                backups,
                backupsDir,
            });
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                return NextResponse.json({
                    backups: [],
                    backupsDir,
                    message: 'Backup-Verzeichnis existiert noch nicht',
                });
            }
            throw error;
        }
    } catch (error) {
        console.error('Backup list error:', error);
        return NextResponse.json(
            { error: 'Failed to list backups' },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/admin/backup?backupName=...
 * Löscht ein Backup
 * Nur für Admins
 */
export async function DELETE(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        
        if (!session || (session.user?.role !== 'admin' && session.user?.role !== 'admin_no_feedback')) {
            return NextResponse.json(
                { error: 'Unauthorized - Admin access required' },
                { status: 401 }
            );
        }

        const { searchParams } = new URL(request.url);
        const backupName = searchParams.get('backupName');

        if (!backupName) {
            return NextResponse.json(
                { error: 'backupName Parameter erforderlich' },
                { status: 400 }
            );
        }

        const backupPath = resolveBackupDirectory(backupName);

        if (!backupPath) {
            return NextResponse.json(
                { error: 'Ungültiger Backup-Name' },
                { status: 400 }
            );
        }

        // Prüfe ob Backup existiert
        if (!existsSync(backupPath)) {
            return NextResponse.json(
                { error: 'Backup nicht gefunden' },
                { status: 404 }
            );
        }

        try {
            // Lösche Backup-Verzeichnis rekursiv
            rmSync(backupPath, { recursive: true, force: true });
            
            return NextResponse.json({
                success: true,
                message: 'Backup erfolgreich gelöscht',
            });
        } catch (error: any) {
            console.error('Delete backup error:', error);
            return NextResponse.json(
                {
                    error: 'Löschen fehlgeschlagen',
                    details: error.message || String(error),
                },
                { status: 500 }
            );
        }
    } catch (error) {
        console.error('Delete backup API error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
