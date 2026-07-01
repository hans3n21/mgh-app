import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { execSync } from 'child_process';
import { join } from 'path';
import { existsSync } from 'fs';
import { z } from 'zod';
import { restoreFromJson } from '@/lib/restore-json';
import { resolveBackupDirectory } from '@/lib/backup-paths';

const restoreSchema = z.object({
    backupName: z.string().min(1, 'Backup-Name erforderlich'),
    useSqlDump: z.boolean().default(false), // JSON ist jetzt Standard
});

/**
 * POST /api/admin/restore
 * Stellt ein Backup wieder her
 * Nur für Admins
 * 
 * WICHTIG: Dies überschreibt die aktuelle Datenbank!
 */
export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        
        if (!session || (session.user?.role !== 'admin' && session.user?.role !== 'admin_no_feedback')) {
            return NextResponse.json(
                { error: 'Unauthorized - Admin access required' },
                { status: 401 }
            );
        }

        const body = await request.json();
        const { backupName, useSqlDump } = restoreSchema.parse(body);

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

        if (useSqlDump) {
            // Restore via SQL-Dump
            const sqlFile = join(backupPath, 'database.sql');
            
            if (!existsSync(sqlFile)) {
                return NextResponse.json(
                    { error: 'SQL-Dump nicht gefunden. Verwenden Sie useSqlDump: false für JSON-Restore.' },
                    { status: 404 }
                );
            }

            try {
                // Restore mit psql
                const dbUrl = process.env.DATABASE_URL;
                if (!dbUrl) {
                    return NextResponse.json(
                        { error: 'DATABASE_URL nicht gesetzt' },
                        { status: 500 }
                    );
                }

                // Parse connection string
                const match = dbUrl.match(/postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
                if (!match) {
                    return NextResponse.json(
                        { error: 'Ungültige DATABASE_URL' },
                        { status: 500 }
                    );
                }

                const [, user, password, host, port, database] = match;
                const env = { ...process.env, PGPASSWORD: password };

                // SICHERHEIT: Erstelle ein Sicherheits-Backup vor dem Restore
                console.log('🛡️  Erstelle Sicherheits-Backup vor Restore...');
                try {
                    const backupScript = join(process.cwd(), 'scripts', 'backup-postgres.ts');
                    execSync(`tsx "${backupScript}"`, {
                        env,
                        cwd: process.cwd(),
                        stdio: 'pipe',
                    });
                    console.log('✅ Sicherheits-Backup erstellt');
                } catch (error: any) {
                    console.warn('⚠️  Sicherheits-Backup fehlgeschlagen, fahre trotzdem fort:', error.message);
                }

                // Restore SQL-Dump
                // Der Dump enthält --clean, also werden Tabellen gelöscht und neu erstellt
                console.log('🔄 Stelle Datenbank wieder her...');
                const restoreCmd = `psql -h ${host} -p ${port} -U ${user} -d ${database} -f "${sqlFile}"`;
                
                execSync(restoreCmd, {
                    env,
                    stdio: 'pipe',
                });

                return NextResponse.json({
                    success: true,
                    message: 'Datenbank erfolgreich wiederhergestellt (SQL-Dump)',
                });
            } catch (error: any) {
                console.error('Restore error:', error);
                return NextResponse.json(
                    {
                        error: 'Restore fehlgeschlagen',
                        details: error.message || String(error),
                        output: error.stdout || error.stderr || '',
                    },
                    { status: 500 }
                );
            }
        } else {
            // JSON-Restore (Standard)
            try {
                // SICHERHEIT: Erstelle ein Sicherheits-Backup vor dem Restore
                console.log('🛡️  Erstelle Sicherheits-Backup vor Restore...');
                try {
                    const backupScript = join(process.cwd(), 'scripts', 'backup-postgres.ts');
                    execSync(`tsx "${backupScript}"`, {
                        env: process.env,
                        cwd: process.cwd(),
                        stdio: 'pipe',
                    });
                    console.log('✅ Sicherheits-Backup erstellt');
                } catch (error: any) {
                    console.warn('⚠️  Sicherheits-Backup fehlgeschlagen, fahre trotzdem fort:', error.message);
                }

                // Restore aus JSON-Dateien
                console.log('🔄 Stelle Datenbank aus JSON-Backup wieder her...');
                const result = await restoreFromJson(backupPath);
                
                if (!result.success) {
                    return NextResponse.json(
                        {
                            error: 'JSON-Restore fehlgeschlagen',
                            details: result.error || 'Unbekannter Fehler',
                        },
                        { status: 500 }
                    );
                }

                return NextResponse.json({
                    success: true,
                    message: 'Datenbank erfolgreich wiederhergestellt (JSON-Backup)',
                    counts: result.counts,
                });
            } catch (error: any) {
                console.error('JSON-Restore error:', error);
                return NextResponse.json(
                    {
                        error: 'JSON-Restore fehlgeschlagen',
                        details: error.message || String(error),
                    },
                    { status: 500 }
                );
            }
        }
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Validation failed', details: error.issues },
                { status: 400 }
            );
        }

        console.error('Restore API error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
