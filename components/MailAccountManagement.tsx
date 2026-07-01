'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

interface MailAccount {
  id: string;
  name: string;
  email: string;
  imapHost: string;
  imapPort: number;
  imapUser: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  isDefault: boolean;
  isActive: boolean;
  userId: string | null;
  user: {
    id: string;
    name: string;
    email: string;
  } | null;
  createdAt: string;
  _count: {
    mails: number;
  };
}

interface MailAccountProfileData {
  mailAccountId: string;
  displayName: string | null;
  aiSystemPrompt: string | null;
  backgroundInfo: string | null;
  defaultLanguage: string;
  defaultOrderType: string | null;
  templateIds: string[];
  pinnedFolders: string[];
}

interface CreateMailAccountForm {
  name: string;
  email: string;
  imapHost: string;
  imapPort: number;
  imapUser: string;
  imapPass: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  isDefault: boolean;
  isActive: boolean;
}

export default function MailAccountManagement() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === 'admin' || session?.user?.role === 'admin_no_feedback';
  const [accounts, setAccounts] = useState<MailAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [accountsExpanded, setAccountsExpanded] = useState(false);
  const [createForm, setCreateForm] = useState<CreateMailAccountForm>({
    name: '',
    email: '',
    imapHost: '',
    imapPort: 993,
    imapUser: '',
    imapPass: '',
    smtpHost: '',
    smtpPort: 587,
    smtpUser: '',
    smtpPass: '',
    isDefault: false,
    isActive: true,
  });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<CreateMailAccountForm> & { id: string } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [profileExpandedId, setProfileExpandedId] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Record<string, MailAccountProfileData>>({});
  const [savingProfile, setSavingProfile] = useState<string | null>(null);
  const [replyTemplates, setReplyTemplates] = useState<Array<{ id: string; key: string; lang: string }>>([]);

  useEffect(() => {
    if (!isAdmin) return;
    fetch('/api/reply-templates')
      .then(r => r.ok ? r.json() : [])
      .then(setReplyTemplates)
      .catch(() => {});
  }, [isAdmin]);

  const loadProfile = async (accountId: string) => {
    if (profiles[accountId]) return;
    const res = await fetch(`/api/mail-accounts/${accountId}/profile`);
    if (res.ok) {
      const data = await res.json();
      setProfiles(prev => ({ ...prev, [accountId]: data }));
    }
  };

  const saveProfile = async (accountId: string) => {
    const profile = profiles[accountId];
    if (!profile) return;
    setSavingProfile(accountId);
    try {
      await fetch(`/api/mail-accounts/${accountId}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      });
    } finally {
      setSavingProfile(null);
    }
  };

  const updateProfile = (accountId: string, patch: Partial<MailAccountProfileData>) => {
    setProfiles(prev => ({
      ...prev,
      [accountId]: { ...prev[accountId], ...patch },
    }));
  };

  const ORDER_TYPES = ['GUITAR', 'BODY', 'NECK', 'REPAIR', 'PICKGUARD', 'PICKUPS', 'ENGRAVING', 'FINISH_ONLY'];

  useEffect(() => {
    if (!isAdmin) return;
    fetchAccounts();
  }, [isAdmin]);

  const fetchAccounts = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/mail-accounts?includeCounts=1');
      if (response.ok) {
        const data = await response.json();
        setAccounts(data);
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unbekannter Fehler' }));
        throw new Error(errorData.error || `Fehler beim Laden der Mail-Accounts (${response.status})`);
      }
    } catch (error: any) {
      const errorMessage = error.message || 'Fehler beim Laden der Mail-Accounts';
      setError(errorMessage);
      console.error('Error fetching mail accounts:', error);
    } finally {
      setLoading(false);
    }
  };

  const createAccount = async () => {
    if (!createForm.name || !createForm.email || !createForm.imapHost || !createForm.imapUser || !createForm.imapPass || !createForm.smtpHost || !createForm.smtpUser || !createForm.smtpPass) {
      setError('Alle Felder sind erforderlich');
      return;
    }

    try {
      setCreating(true);
      setError(null);

      const response = await fetch('/api/mail-accounts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(createForm),
      });

      const data = await response.json();

      if (response.ok) {
        await fetchAccounts();
        setShowCreateForm(false);
        setCreateForm({
          name: '',
          email: '',
          imapHost: '',
          imapPort: 993,
          imapUser: '',
          imapPass: '',
          smtpHost: '',
          smtpPort: 587,
          smtpUser: '',
          smtpPass: '',
          isDefault: false,
          isActive: true,
        });
      } else {
        setError(data.error || 'Fehler beim Erstellen des Mail-Accounts');
      }
    } catch (error) {
      setError('Fehler beim Erstellen des Mail-Accounts');
      console.error('Error creating mail account:', error);
    } finally {
      setCreating(false);
    }
  };

  const updateAccount = async (accountId: string, updates: Partial<CreateMailAccountForm>) => {
    try {
      setError(null);

      const response = await fetch(`/api/mail-accounts/${accountId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });

      const data = await response.json();

      if (response.ok) {
        await fetchAccounts();
        setEditingId(null);
        setEditForm(null);
      } else {
        setError(data.error || 'Fehler beim Aktualisieren des Mail-Accounts');
      }
    } catch (error) {
      setError('Fehler beim Aktualisieren des Mail-Accounts');
      console.error('Error updating mail account:', error);
    }
  };

  const deleteAccount = async (accountId: string, accountName: string) => {
    if (!confirm(`Sind Sie sicher, dass Sie den Mail-Account "${accountName}" löschen möchten?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/mail-accounts/${accountId}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (response.ok) {
        await fetchAccounts();
      } else {
        alert(data.error || 'Fehler beim Löschen des Mail-Accounts');
      }
    } catch (error) {
      alert('Fehler beim Löschen des Mail-Accounts');
      console.error('Error deleting mail account:', error);
    }
  };

  const testConnection = async (accountId: string) => {
    try {
      setTesting(accountId);
      setError(null);

      const response = await fetch(`/api/mail-accounts/${accountId}/test`, {
        method: 'POST',
      });

      const data = await response.json();

      if (response.ok) {
        alert(data.message || 'Verbindung erfolgreich!');
      } else {
        alert(`${data.error || 'Verbindung fehlgeschlagen'}${data.details ? `\n\nDetails: ${data.details}` : ''}`);
      }
    } catch (error) {
      alert('Fehler beim Testen der Verbindung');
      console.error('Error testing connection:', error);
    } finally {
      setTesting(null);
    }
  };

  const syncMails = async (fullSync = false) => {
    try {
      setSyncing(true);
      setError(null);

      const response = await fetch('/api/mail/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullSync }),
      });

      const data = await response.json();

      if (response.ok) {
        const errorCount = typeof data?.errorCount === 'number' ? data.errorCount : 0;
        if (errorCount > 0) {
          alert(
            `Synchronisation abgeschlossen mit ${errorCount} Fehler(n).\n` +
            `Einige Ordner/Konten konnten nicht vollständig synchronisiert werden.\n` +
            `Bitte Terminal-Logs prüfen.`
          );
        } else {
          alert(
            fullSync
              ? 'Alle Mails werden neu geladen. Bitte warten...'
              : 'Mail-Synchronisation erfolgreich gestartet! Die Mails werden jetzt geladen...'
          );
        }
        setTimeout(() => {
          window.location.reload();
        }, fullSync ? 3000 : 2000);
      } else {
        const details = data?.advice || data?.details;
        setError(data.error || 'Synchronisation fehlgeschlagen');
        alert(`${data.error || 'Synchronisation fehlgeschlagen'}${details ? `\n\nDetails: ${details}` : ''}`);
      }
    } catch (error) {
      setError('Fehler beim Starten der Synchronisation');
      alert('Fehler beim Starten der Synchronisation');
      console.error('Error syncing mails:', error);
    } finally {
      setSyncing(false);
    }
  };

  const startEdit = (account: MailAccount) => {
    setEditingId(account.id);
    setEditForm({
      id: account.id,
      name: account.name,
      email: account.email,
      imapHost: account.imapHost,
      imapPort: account.imapPort,
      imapUser: account.imapUser,
      imapPass: '', // Leer lassen, nur ändern wenn ausgefüllt
      smtpHost: account.smtpHost,
      smtpPort: account.smtpPort,
      smtpUser: account.smtpUser,
      smtpPass: '', // Leer lassen, nur ändern wenn ausgefüllt
      isDefault: account.isDefault,
      isActive: account.isActive,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm(null);
    setError(null);
  };

  const saveEdit = async () => {
    if (!editForm) return;

    const updates: Partial<CreateMailAccountForm> = {};
    if (editForm.name) updates.name = editForm.name;
    if (editForm.email) updates.email = editForm.email;
    if (editForm.imapHost) updates.imapHost = editForm.imapHost;
    if (editForm.imapPort) updates.imapPort = editForm.imapPort;
    if (editForm.imapUser) updates.imapUser = editForm.imapUser;
    if (editForm.imapPass) updates.imapPass = editForm.imapPass;
    if (editForm.smtpHost) updates.smtpHost = editForm.smtpHost;
    if (editForm.smtpPort) updates.smtpPort = editForm.smtpPort;
    if (editForm.smtpUser) updates.smtpUser = editForm.smtpUser;
    if (editForm.smtpPass) updates.smtpPass = editForm.smtpPass;
    if (editForm.isDefault !== undefined) updates.isDefault = editForm.isDefault;
    if (editForm.isActive !== undefined) updates.isActive = editForm.isActive;

    await updateAccount(editForm.id, updates);
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
    <div className="rounded-xl border border-slate-800 p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div className="font-semibold">E-Mail-Einstellungen</div>
        <div className="flex flex-wrap items-center gap-2">
          {accounts.length > 0 && accounts.some(a => a.isActive) && (
            <button
              onClick={() => syncMails(true)}
              disabled={syncing}
              title="Reparatur-Sync: Cursor zurücksetzen und alle Mails neu laden (nur bei fehlenden Mails nötig)"
              className="w-full sm:w-auto px-2.5 py-1.5 sm:px-3 sm:py-1.5 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800/60 disabled:opacity-50 text-slate-200 border border-slate-600 rounded-lg text-xs sm:text-sm font-medium transition-colors"
            >
              {syncing ? '...' : '🔄 Vollsync (Reparatur)'}
            </button>
          )}
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="w-full sm:w-auto px-2.5 py-1.5 sm:px-3 sm:py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 rounded-lg text-xs sm:text-sm font-medium transition-colors"
          >
            + Mail-Account hinzufügen
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-900/30 border border-red-700/50 rounded-lg text-red-300 text-sm">
          {error}
        </div>
      )}

      {showCreateForm && (
        <div className="mb-4 p-4 border border-slate-700 rounded-lg bg-slate-800/30">
          <div className="text-sm font-medium mb-3">Neuen Mail-Account erstellen</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Name (z.B. Support)"
              value={createForm.name}
              onChange={(e) => setCreateForm(prev => ({ ...prev, name: e.target.value }))}
              className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-slate-100 placeholder-slate-400 text-sm"
            />
            <input
              type="email"
              placeholder="E-Mail-Adresse"
              value={createForm.email}
              onChange={(e) => setCreateForm(prev => ({ ...prev, email: e.target.value }))}
              className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-slate-100 placeholder-slate-400 text-sm"
            />
            <div className="md:col-span-2">
              <div className="text-xs text-slate-400 mb-2 font-medium">IMAP-Einstellungen</div>
            </div>
            <input
              type="text"
              placeholder="IMAP Host (z.B. imap.example.com)"
              value={createForm.imapHost}
              onChange={(e) => setCreateForm(prev => ({ ...prev, imapHost: e.target.value }))}
              className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-slate-100 placeholder-slate-400 text-sm"
            />
            <input
              type="number"
              placeholder="IMAP Port (z.B. 993)"
              value={createForm.imapPort}
              onChange={(e) => setCreateForm(prev => ({ ...prev, imapPort: parseInt(e.target.value) || 993 }))}
              className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-slate-100 placeholder-slate-400 text-sm"
            />
            <input
              type="text"
              placeholder="IMAP Benutzername"
              value={createForm.imapUser}
              onChange={(e) => setCreateForm(prev => ({ ...prev, imapUser: e.target.value }))}
              className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-slate-100 placeholder-slate-400 text-sm"
            />
            <input
              type="password"
              placeholder="IMAP Passwort"
              value={createForm.imapPass}
              onChange={(e) => setCreateForm(prev => ({ ...prev, imapPass: e.target.value }))}
              className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-slate-100 placeholder-slate-400 text-sm"
            />
            <div className="md:col-span-2">
              <div className="text-xs text-slate-400 mb-2 font-medium mt-2">SMTP-Einstellungen</div>
            </div>
            <input
              type="text"
              placeholder="SMTP Host (z.B. smtp.example.com)"
              value={createForm.smtpHost}
              onChange={(e) => setCreateForm(prev => ({ ...prev, smtpHost: e.target.value }))}
              className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-slate-100 placeholder-slate-400 text-sm"
            />
            <input
              type="number"
              placeholder="SMTP Port (z.B. 587)"
              value={createForm.smtpPort}
              onChange={(e) => setCreateForm(prev => ({ ...prev, smtpPort: parseInt(e.target.value) || 587 }))}
              className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-slate-100 placeholder-slate-400 text-sm"
            />
            <input
              type="text"
              placeholder="SMTP Benutzername"
              value={createForm.smtpUser}
              onChange={(e) => setCreateForm(prev => ({ ...prev, smtpUser: e.target.value }))}
              className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-slate-100 placeholder-slate-400 text-sm"
            />
            <input
              type="password"
              placeholder="SMTP Passwort"
              value={createForm.smtpPass}
              onChange={(e) => setCreateForm(prev => ({ ...prev, smtpPass: e.target.value }))}
              className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-slate-100 placeholder-slate-400 text-sm"
            />
            <div className="md:col-span-2 flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={createForm.isDefault}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, isDefault: e.target.checked }))}
                  className="rounded border-slate-600"
                />
                Standard-Account
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={createForm.isActive}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, isActive: e.target.checked }))}
                  className="rounded border-slate-600"
                />
                Aktiv
              </label>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={createAccount}
              disabled={creating}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-800/60 disabled:opacity-50 text-slate-100 border border-slate-700 rounded-lg text-xs sm:text-sm font-medium transition-colors"
            >
              {creating ? 'Erstelle...' : 'Erstellen'}
            </button>
            <button
              onClick={() => {
                setShowCreateForm(false);
                setError(null);
              }}
              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 rounded-lg text-xs sm:text-sm transition-colors"
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}

      <button
        onClick={() => setAccountsExpanded(!accountsExpanded)}
        className="flex items-center gap-2 text-sm font-medium mb-2 hover:text-slate-200 transition-colors"
      >
        <span className={`text-slate-400 transition-transform ${accountsExpanded ? 'rotate-90' : ''}`}>
          ▶
        </span>
        Mail-Accounts ({accounts.length})
      </button>
      {accountsExpanded && (
        <>
          {loading ? (
            <div className="text-slate-400 text-sm">Lade Mail-Accounts...</div>
          ) : accounts.length === 0 ? (
            <div className="text-slate-400 text-sm">Keine Mail-Accounts gefunden.</div>
          ) : (
            <div className="space-y-2">
              {accounts.map((account) => (
                <div key={account.id} className="p-3 border border-slate-700 rounded-lg bg-slate-800/30">
                  {editingId === account.id && editForm ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <input
                          type="text"
                          placeholder="Name"
                          value={editForm.name || ''}
                          onChange={(e) => setEditForm(prev => prev ? { ...prev, name: e.target.value } : null)}
                          className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-slate-100 placeholder-slate-400 text-sm"
                        />
                        <input
                          type="email"
                          placeholder="E-Mail"
                          value={editForm.email || ''}
                          onChange={(e) => setEditForm(prev => prev ? { ...prev, email: e.target.value } : null)}
                          className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-slate-100 placeholder-slate-400 text-sm"
                        />
                        <input
                          type="text"
                          placeholder="IMAP Host"
                          value={editForm.imapHost || ''}
                          onChange={(e) => setEditForm(prev => prev ? { ...prev, imapHost: e.target.value } : null)}
                          className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-slate-100 placeholder-slate-400 text-sm"
                        />
                        <input
                          type="number"
                          placeholder="IMAP Port"
                          value={editForm.imapPort || 993}
                          onChange={(e) => setEditForm(prev => prev ? { ...prev, imapPort: parseInt(e.target.value) || 993 } : null)}
                          className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-slate-100 placeholder-slate-400 text-sm"
                        />
                        <input
                          type="text"
                          placeholder="IMAP Benutzername"
                          value={editForm.imapUser || ''}
                          onChange={(e) => setEditForm(prev => prev ? { ...prev, imapUser: e.target.value } : null)}
                          className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-slate-100 placeholder-slate-400 text-sm"
                        />
                        <input
                          type="password"
                          placeholder="IMAP Passwort (leer = unverändert)"
                          value={editForm.imapPass || ''}
                          onChange={(e) => setEditForm(prev => prev ? { ...prev, imapPass: e.target.value } : null)}
                          className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-slate-100 placeholder-slate-400 text-sm"
                        />
                        <input
                          type="text"
                          placeholder="SMTP Host"
                          value={editForm.smtpHost || ''}
                          onChange={(e) => setEditForm(prev => prev ? { ...prev, smtpHost: e.target.value } : null)}
                          className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-slate-100 placeholder-slate-400 text-sm"
                        />
                        <input
                          type="number"
                          placeholder="SMTP Port"
                          value={editForm.smtpPort || 587}
                          onChange={(e) => setEditForm(prev => prev ? { ...prev, smtpPort: parseInt(e.target.value) || 587 } : null)}
                          className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-slate-100 placeholder-slate-400 text-sm"
                        />
                        <input
                          type="text"
                          placeholder="SMTP Benutzername"
                          value={editForm.smtpUser || ''}
                          onChange={(e) => setEditForm(prev => prev ? { ...prev, smtpUser: e.target.value } : null)}
                          className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-slate-100 placeholder-slate-400 text-sm"
                        />
                        <input
                          type="password"
                          placeholder="SMTP Passwort (leer = unverändert)"
                          value={editForm.smtpPass || ''}
                          onChange={(e) => setEditForm(prev => prev ? { ...prev, smtpPass: e.target.value } : null)}
                          className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-slate-100 placeholder-slate-400 text-sm"
                        />
                        <div className="md:col-span-2 flex items-center gap-4">
                          <label className="flex items-center gap-2 text-sm text-slate-300">
                            <input
                              type="checkbox"
                              checked={editForm.isDefault || false}
                              onChange={(e) => setEditForm(prev => prev ? { ...prev, isDefault: e.target.checked } : null)}
                              className="rounded border-slate-600"
                            />
                            Standard-Account
                          </label>
                          <label className="flex items-center gap-2 text-sm text-slate-300">
                            <input
                              type="checkbox"
                              checked={editForm.isActive !== undefined ? editForm.isActive : true}
                              onChange={(e) => setEditForm(prev => prev ? { ...prev, isActive: e.target.checked } : null)}
                              className="rounded border-slate-600"
                            />
                            Aktiv
                          </label>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={saveEdit}
                          className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                          Speichern
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="px-3 py-1.5 bg-slate-600 hover:bg-slate-500 text-white rounded-lg text-sm transition-colors"
                        >
                          Abbrechen
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-slate-100">{account.name}</span>
                            {account.isDefault && (
                              <span className="px-2 py-0.5 bg-amber-900/30 text-amber-300 border border-amber-700/50 rounded text-xs">
                                Standard
                              </span>
                            )}
                            {!account.isActive && (
                              <span className="px-2 py-0.5 bg-slate-700/30 text-slate-400 border border-slate-600/50 rounded text-xs">
                                Inaktiv
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-slate-400 mt-1">
                            {account.email}
                          </div>
                          <div className="text-xs text-slate-500 mt-1">
                            IMAP: {account.imapHost}:{account.imapPort} • SMTP: {account.smtpHost}:{account.smtpPort}
                            {account._count.mails > 0 && (
                              <span className="ml-2">• {account._count.mails} Mails</span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500">
                            Erstellt: {new Date(account.createdAt).toLocaleDateString('de-DE')}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => testConnection(account.id)}
                            disabled={testing === account.id}
                            className="px-2 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:opacity-50 text-white rounded text-xs transition-colors"
                          >
                            {testing === account.id ? 'Teste...' : 'Testen'}
                          </button>
                          <button
                            onClick={() => startEdit(account)}
                            className="px-2 py-1 bg-slate-600 hover:bg-slate-500 text-white rounded text-xs transition-colors"
                          >
                            Bearbeiten
                          </button>
                          {account._count.mails === 0 && (
                            <button
                              onClick={() => deleteAccount(account.id, account.name)}
                              className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs transition-colors"
                            >
                              Löschen
                            </button>
                          )}
                          <button
                            onClick={() => {
                              const next = profileExpandedId === account.id ? null : account.id;
                              setProfileExpandedId(next);
                              if (next) loadProfile(account.id);
                            }}
                            className={`px-2 py-1 rounded text-xs transition-colors ${
                              profileExpandedId === account.id
                                ? 'bg-violet-700 text-white'
                                : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                            }`}
                          >
                            ⚙ Profil
                          </button>
                        </div>
                      </div>

                      {/* Profil-Bereich */}
                      {profileExpandedId === account.id && profiles[account.id] && (
                        <div className="mt-3 pt-3 border-t border-slate-700 space-y-3">
                          <p className="text-xs text-slate-400 font-medium">Postfach-Profil</p>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-xs text-slate-400 block mb-1">Anzeigename (Reiter)</label>
                              <input
                                type="text"
                                value={profiles[account.id].displayName ?? ''}
                                onChange={e => updateProfile(account.id, { displayName: e.target.value || null })}
                                placeholder={account.name}
                                className="w-full rounded bg-slate-900 border border-slate-700 px-2 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-violet-500"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-slate-400 block mb-1">Standard-Sprache</label>
                              <select
                                value={profiles[account.id].defaultLanguage}
                                onChange={e => updateProfile(account.id, { defaultLanguage: e.target.value })}
                                className="w-full rounded bg-slate-900 border border-slate-700 px-2 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-violet-500"
                              >
                                <option value="de">Deutsch</option>
                                <option value="en">English</option>
                                <option value="fr">Français</option>
                                <option value="es">Español</option>
                                <option value="it">Italiano</option>
                              </select>
                            </div>
                          </div>

                          <div>
                            <label className="text-xs text-slate-400 block mb-1">Standard-Auftragstyp</label>
                            <select
                              value={profiles[account.id].defaultOrderType ?? ''}
                              onChange={e => updateProfile(account.id, { defaultOrderType: e.target.value || null })}
                              className="w-full rounded bg-slate-900 border border-slate-700 px-2 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-violet-500"
                            >
                              <option value="">– kein Standard –</option>
                              {ORDER_TYPES.map(t => (
                                <option key={t} value={t}>{t}</option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="text-xs text-slate-400 block mb-1">KI-Tonalität / System-Prompt</label>
                            <textarea
                              value={profiles[account.id].aiSystemPrompt ?? ''}
                              onChange={e => updateProfile(account.id, { aiSystemPrompt: e.target.value || null })}
                              rows={3}
                              placeholder="z.B. Du bist ein freundlicher Mitarbeiter eines Gitarrenbau-Shops. Antworte auf Deutsch, duze den Kunden."
                              className="w-full rounded bg-slate-900 border border-slate-700 px-2 py-1.5 text-sm text-slate-200 resize-none focus:outline-none focus:ring-1 focus:ring-violet-500"
                            />
                          </div>

                          <div>
                            <label className="text-xs text-slate-400 block mb-1">Hintergrundwissen für KI</label>
                            <textarea
                              value={profiles[account.id].backgroundInfo ?? ''}
                              onChange={e => updateProfile(account.id, { backgroundInfo: e.target.value || null })}
                              rows={3}
                              placeholder="z.B. Pickguard Preise: ab 45€. Lieferzeit: 2-3 Wochen. Versand DE: 6€."
                              className="w-full rounded bg-slate-900 border border-slate-700 px-2 py-1.5 text-sm text-slate-200 resize-none focus:outline-none focus:ring-1 focus:ring-violet-500"
                            />
                          </div>

                          <div>
                            <label className="text-xs text-slate-400 block mb-1">Gepinnte Ordner (kommasepariert)</label>
                            <input
                              type="text"
                              value={(profiles[account.id].pinnedFolders ?? []).join(', ')}
                              onChange={e => updateProfile(account.id, {
                                pinnedFolders: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                              })}
                              placeholder="INBOX, Sent"
                              className="w-full rounded bg-slate-900 border border-slate-700 px-2 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-violet-500"
                            />
                            <p className="text-[11px] text-slate-500 mt-0.5">Exakte IMAP-Ordnerpfade, z.B. INBOX, Sent, [Gmail]/Sent Mail</p>
                          </div>

                          {replyTemplates.length > 0 && (
                            <div>
                              <label className="text-xs text-slate-400 block mb-1">Vorgeschlagene Vorlagen</label>
                              <div className="space-y-1 max-h-32 overflow-y-auto">
                                {replyTemplates.map(tpl => {
                                  const checked = (profiles[account.id].templateIds ?? []).includes(tpl.id);
                                  return (
                                    <label key={tpl.id} className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => {
                                          const current = profiles[account.id].templateIds ?? [];
                                          const next = checked
                                            ? current.filter(id => id !== tpl.id)
                                            : [...current, tpl.id];
                                          updateProfile(account.id, { templateIds: next });
                                        }}
                                        className="rounded border-slate-600 bg-slate-900 text-violet-500"
                                      />
                                      {tpl.key} <span className="text-slate-500">({tpl.lang})</span>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          <button
                            onClick={() => saveProfile(account.id)}
                            disabled={savingProfile === account.id}
                            className="px-3 py-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
                          >
                            {savingProfile === account.id ? 'Speichern…' : 'Profil speichern'}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
