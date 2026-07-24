"use client";

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

interface Backup {
    name: string;
    path: string;
    createdAt: string;
    modifiedAt: string;
    size: number;
    hasSqlDump: boolean;
    sqlDumpError?: string;
}

export default function BackupManagement() {
    const { data: session } = useSession();
    const isAdmin = session?.user?.role === 'admin' || session?.user?.role === 'admin_no_feedback';
    const [backups, setBackups] = useState<Backup[]>([]);
    const [loading, setLoading] = useState(false);
    const [creating, setCreating] = useState(false);
    const [restoring, setRestoring] = useState<string | null>(null);
    const [deleting, setDeleting] = useState<string | null>(null);
    const [backupsExpanded, setBackupsExpanded] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [backupsDir, setBackupsDir] = useState<string>('');

    const loadBackups = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/backup');
            if (!res.ok) throw new Error('Fehler beim Laden der Backups');
            const data = await res.json();
            setBackups(data.backups || []);
            setBackupsDir(data.backupsDir || '');
        } catch {
            setMessage({ type: 'error', text: 'Fehler beim Laden der Backups' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!isAdmin) return;
        loadBackups();
    }, [isAdmin]);

    const createBackup = async () => {
        if (!confirm('Möchten Sie wirklich ein neues Backup erstellen?')) return;

        setCreating(true);
        setMessage(null);
        try {
            const res = await fetch('/api/admin/backup', {
                method: 'POST',
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Backup fehlgeschlagen');
            }

            setMessage({ 
                type: 'success', 
                text: 'Backup erfolgreich erstellt!' 
            });
            await loadBackups();
        } catch (error: any) {
            setMessage({ type: 'error', text: error.message || 'Backup fehlgeschlagen' });
        } finally {
            setCreating(false);
        }
    };

    const restoreBackup = async (backupName: string) => {
        if (!confirm('WICHTIG: Dies überschreibt die aktuelle Datenbank!\n\nMöchten Sie wirklich fortfahren?')) {
            return;
        }

        if (!confirm('Sind Sie SICHER? Diese Aktion kann nicht rückgängig gemacht werden!')) {
            return;
        }

        setRestoring(backupName);
        setMessage(null);
        try {
            const res = await fetch('/api/admin/restore', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    backupName,
                    useSqlDump: false, // JSON-Restore ist Standard
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Restore fehlgeschlagen');
            }

            setMessage({ type: 'success', text: 'Datenbank erfolgreich wiederhergestellt!' });
        } catch (error: any) {
            setMessage({ type: 'error', text: error.message || 'Restore fehlgeschlagen' });
        } finally {
            setRestoring(null);
        }
    };

    const deleteBackup = async (backupName: string) => {
        if (!confirm(`Möchten Sie das Backup "${backupName}" wirklich löschen?`)) {
            return;
        }

        if (!confirm('Diese Aktion kann nicht rückgängig gemacht werden!')) {
            return;
        }

        setDeleting(backupName);
        setMessage(null);
        try {
            const res = await fetch(`/api/admin/backup?backupName=${encodeURIComponent(backupName)}`, {
                method: 'DELETE',
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Löschen fehlgeschlagen');
            }

            setMessage({ type: 'success', text: 'Backup erfolgreich gelöscht!' });
            await loadBackups();
        } catch (error: any) {
            setMessage({ type: 'error', text: error.message || 'Löschen fehlgeschlagen' });
        } finally {
            setDeleting(null);
        }
    };


    const formatDateShort = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleString('de-DE', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const formatSize = (bytes: number) => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    };

    // Nur für Admins verfügbar
    if (!isAdmin) {
        return (
            <div className="rounded-xl border border-slate-800 p-3">
                <div className="text-slate-400">Nur für Administratoren verfügbar.</div>
            </div>
        );
    }

    return (
        <div className="rounded-xl border border-slate-800 p-3 space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <div className="font-semibold">Datenbank-Backup</div>
                    <div className="text-xs text-slate-400 mt-1">
                        Erstellen und Wiederherstellen von Datenbank-Backups
                    </div>
                </div>
                <button
                    onClick={createBackup}
                    disabled={creating}
                    className="w-full sm:w-auto px-2.5 py-1.5 sm:px-3 sm:py-1.5 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-800/60 disabled:cursor-not-allowed border border-slate-700 rounded text-xs sm:text-sm font-medium text-slate-100"
                >
                    {creating ? 'Erstelle Backup...' : 'Backup erstellen'}
                </button>
            </div>

            {message && (
                <div
                    className={`p-2 rounded text-sm ${
                        message.type === 'success'
                            ? 'bg-green-900/50 text-green-300 border border-green-700'
                            : 'bg-red-900/50 text-red-300 border border-red-700'
                    }`}
                >
                    {message.text}
                </div>
            )}

            <div className="border-t border-slate-700 pt-3">
                <button
                    onClick={() => setBackupsExpanded(!backupsExpanded)}
                    className="flex items-center gap-2 text-sm font-medium mb-2 hover:text-slate-200 transition-colors"
                >
                    <span className={`text-slate-400 transition-transform ${backupsExpanded ? 'rotate-90' : ''}`}>
                        ▶
                    </span>
                    Verfügbare Backups
                </button>
                {backupsExpanded && (
                    <>
                        {loading ? (
                            <div className="text-sm text-slate-400">Lade Backups...</div>
                        ) : backups.length === 0 ? (
                            <div className="text-sm text-slate-400">Keine Backups gefunden</div>
                        ) : (
                            <div className="space-y-2">
                                {backups.map((backup) => (
                                    <div
                                        key={backup.name}
                                        className="bg-slate-800/50 rounded border border-slate-700 p-2"
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex-1">
                                                <div className="text-sm font-medium">{formatDateShort(backup.createdAt)}</div>
                                                <div className="text-xs text-slate-400 mt-1">
                                                    {formatSize(backup.size)} • ✅ JSON-Backup verfügbar
                                                    {backup.hasSqlDump && ' • SQL-Dump verfügbar'}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => restoreBackup(backup.name)}
                                                    disabled={restoring === backup.name}
                                                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-800/60 disabled:cursor-not-allowed border border-slate-700 rounded text-xs font-medium text-slate-100"
                                                    title="Datenbank aus JSON-Backup wiederherstellen"
                                                >
                                                    {restoring === backup.name ? 'Wiederherstellen...' : 'Wiederherstellen'}
                                                </button>
                                                <button
                                                    onClick={() => deleteBackup(backup.name)}
                                                    disabled={deleting === backup.name}
                                                    className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-900/60 disabled:cursor-not-allowed border border-red-700/40 rounded text-xs font-medium text-red-300"
                                                    title="Backup löschen"
                                                >
                                                    {deleting === backup.name ? 'Löschen...' : 'Löschen'}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>

            <div className="text-xs text-slate-500 border-t border-slate-700 pt-2 space-y-1">
                <div>
                    💡 <strong>Hinweis:</strong> Backups werden automatisch nach 30 Tagen gelöscht. JSON-Backups können direkt wiederhergestellt werden.
                </div>
                {backupsDir && (
                    <div>
                        📁 <strong>Speicherort:</strong> {backupsDir}
                    </div>
                )}
                <div>
                    ✅ <strong>Automatische Backups:</strong> Tägliche Backups werden automatisch beim App-Start erstellt (im Production-Modus oder wenn ENABLE_AUTO_BACKUP gesetzt ist). Backups werden nur erstellt, wenn die Datenbank gesund ist.
                </div>
            </div>
        </div>
    );
}
