'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'admin_no_feedback' | 'staff';
  createdAt: string;
  _count: {
    orders: number;
  };
}

interface CreateUserForm {
  name: string;
  email: string;
  password: string;
  role: 'admin' | 'admin_no_feedback' | 'staff';
}

export default function UserManagement() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === 'admin' || session?.user?.role === 'admin_no_feedback';
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [usersExpanded, setUsersExpanded] = useState(false);
  const [createForm, setCreateForm] = useState<CreateUserForm>({
    name: '',
    email: '',
    password: '',
    role: 'staff',
  });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatingRoles, setUpdatingRoles] = useState<Set<string>>(new Set());
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ id: string; name: string; email: string; password: string } | null>(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    fetchUsers();
  }, [isAdmin]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/users');
      if (response.ok) {
        const data = await response.json();
        setUsers(data);
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unbekannter Fehler' }));
        throw new Error(errorData.error || `Fehler beim Laden der Benutzer (${response.status})`);
      }
    } catch (error: any) {
      const errorMessage = error.message || 'Fehler beim Laden der Benutzer';
      setError(errorMessage);
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const createUser = async () => {
    if (!createForm.name || !createForm.email || !createForm.password) {
      setError('Alle Felder sind erforderlich');
      return;
    }

    try {
      setCreating(true);
      setError(null);

      const response = await fetch('/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(createForm),
      });

      const data = await response.json();

      if (response.ok) {
        await fetchUsers(); // Benutzerliste aktualisieren
        setShowCreateForm(false);
        setCreateForm({ name: '', email: '', password: '', role: 'staff' });
      } else {
        setError(data.error || 'Fehler beim Erstellen des Benutzers');
      }
    } catch (error) {
      setError('Fehler beim Erstellen des Benutzers');
      console.error('Error creating user:', error);
    } finally {
      setCreating(false);
    }
  };

  const updateUserRole = async (userId: string, newRole: 'admin' | 'admin_no_feedback' | 'staff') => {
    try {
      setUpdatingRoles(prev => new Set(prev).add(userId));
      setError(null);

      const response = await fetch(`/api/users/${userId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ role: newRole }),
      });

      const data = await response.json();

      if (response.ok) {
        await fetchUsers(); // Benutzerliste aktualisieren
      } else {
        setError(data.error || 'Fehler beim Aktualisieren der Rolle');
      }
    } catch (error) {
      setError('Fehler beim Aktualisieren der Rolle');
      console.error('Error updating user role:', error);
    } finally {
      setUpdatingRoles(prev => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    }
  };

  const startEdit = (user: User) => {
    setEditingUserId(user.id);
    setEditForm({
      id: user.id,
      name: user.name,
      email: user.email,
      password: '', // Leer lassen, nur ändern wenn ausgefüllt
    });
  };

  const cancelEdit = () => {
    setEditingUserId(null);
    setEditForm(null);
    setError(null);
  };

  const saveEdit = async () => {
    if (!editForm) return;

    if (!editForm.name || !editForm.email) {
      setError('Name und E-Mail sind erforderlich');
      return;
    }

    try {
      setUpdating(true);
      setError(null);

      const updateData: any = {
        name: editForm.name,
        email: editForm.email,
      };

      // Nur Passwort senden wenn es ausgefüllt wurde
      if (editForm.password && editForm.password.length > 0) {
        if (editForm.password.length < 6) {
          setError('Passwort muss mindestens 6 Zeichen lang sein');
          setUpdating(false);
          return;
        }
        updateData.password = editForm.password;
      }

      const response = await fetch(`/api/users/${editForm.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData),
      });

      const data = await response.json();

      if (response.ok) {
        await fetchUsers();
        cancelEdit();
      } else {
        setError(data.error || 'Fehler beim Aktualisieren des Benutzers');
      }
    } catch (error) {
      setError('Fehler beim Aktualisieren des Benutzers');
      console.error('Error updating user:', error);
    } finally {
      setUpdating(false);
    }
  };

  const deleteUser = async (userId: string, userName: string) => {
    if (!confirm(`Sind Sie sicher, dass Sie den Benutzer "${userName}" löschen möchten?\n\nDiese Aktion kann nicht rückgängig gemacht werden.`)) {
      return;
    }

    try {
      setError(null);
      const response = await fetch(`/api/users/${userId}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (response.ok) {
        await fetchUsers(); // Benutzerliste aktualisieren
      } else {
        const errorMsg = data.error || 'Fehler beim Löschen des Benutzers';
        setError(errorMsg);
        alert(errorMsg + (data.hasOrders ? `\n\nDer Benutzer hat ${data.orderCount} zugewiesene Aufträge.` : ''));
      }
    } catch (error) {
      const errorMsg = 'Fehler beim Löschen des Benutzers';
      setError(errorMsg);
      alert(errorMsg);
      console.error('Error deleting user:', error);
    }
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
        <div className="font-semibold">Benutzerverwaltung</div>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="w-full sm:w-auto px-2.5 py-1.5 sm:px-3 sm:py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 rounded-lg text-xs sm:text-sm font-medium transition-colors"
        >
          + Benutzer hinzufügen
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-900/30 border border-red-700/50 rounded-lg text-red-300 text-sm">
          {error}
        </div>
      )}

      {showCreateForm && (
        <div className="mb-4 p-4 border border-slate-700 rounded-lg bg-slate-800/30">
          <div className="text-sm font-medium mb-3">Neuen Benutzer erstellen</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Name"
              value={createForm.name}
              onChange={(e) => setCreateForm(prev => ({ ...prev, name: e.target.value }))}
              className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-slate-100 placeholder-slate-400 text-sm"
            />
            <input
              type="email"
              placeholder="E-Mail"
              value={createForm.email}
              onChange={(e) => setCreateForm(prev => ({ ...prev, email: e.target.value }))}
              className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-slate-100 placeholder-slate-400 text-sm"
            />
            <input
              type="password"
              placeholder="Passwort (min. 6 Zeichen)"
              value={createForm.password}
              onChange={(e) => setCreateForm(prev => ({ ...prev, password: e.target.value }))}
              className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-slate-100 placeholder-slate-400 text-sm"
            />
            <select
              value={createForm.role}
              onChange={(e) => setCreateForm(prev => ({ ...prev, role: e.target.value as 'admin' | 'admin_no_feedback' | 'staff' }))}
              className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-slate-100 text-sm"
            >
              <option value="staff">Mitarbeiter</option>
              <option value="admin">Administrator</option>
            </select>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={createUser}
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
        onClick={() => setUsersExpanded(!usersExpanded)}
        className="flex items-center gap-2 text-sm font-medium mb-2 hover:text-slate-200 transition-colors"
      >
        <span className={`text-slate-400 transition-transform ${usersExpanded ? 'rotate-90' : ''}`}>
          ▶
        </span>
        Benutzerliste ({users.length})
      </button>
      {usersExpanded && (
        <>
          {loading ? (
            <div className="text-slate-400 text-sm">Lade Benutzer...</div>
          ) : users.length === 0 ? (
            <div className="text-slate-400 text-sm">Keine Benutzer gefunden.</div>
          ) : (
            <div className="space-y-2">
              {users.map((user) => (
                <div key={user.id} className="p-3 border border-slate-700 rounded-lg bg-slate-800/30">
                  {editingUserId === user.id && editForm ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <input
                          type="text"
                          placeholder="Name"
                          value={editForm.name}
                          onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                          className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-slate-100 placeholder-slate-400 text-sm"
                        />
                        <input
                          type="email"
                          placeholder="E-Mail"
                          value={editForm.email}
                          onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                          className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-slate-100 placeholder-slate-400 text-sm"
                        />
                        <input
                          type="password"
                          placeholder="Passwort (leer lassen zum Beibehalten)"
                          value={editForm.password}
                          onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                          className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-slate-100 placeholder-slate-400 text-sm"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={saveEdit}
                          disabled={updating}
                          className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-green-800 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                          {updating ? 'Speichere...' : 'Speichern'}
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
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-100">{user.name}</span>
                        </div>
                        <div className="text-sm text-slate-400">
                          {user.email}
                          {user._count.orders > 0 && (
                            <span className="ml-2">• {user._count.orders} Aufträge</span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500">
                          Erstellt: {new Date(user.createdAt).toLocaleDateString('de-DE')}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          value={user.role}
                          onChange={(e) => updateUserRole(user.id, e.target.value as 'admin' | 'admin_no_feedback' | 'staff')}
                          disabled={updatingRoles.has(user.id) || user.id === session?.user?.id}
                          className="rounded-lg bg-slate-950 border border-slate-700 px-2 py-1 text-slate-100 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <option value="staff">Mitarbeiter</option>
                          <option value="admin">Administrator</option>
                          <option value="admin_no_feedback">Administrator (ohne Feedback)</option>
                        </select>
                        <button
                          onClick={() => startEdit(user)}
                          className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs transition-colors"
                          title="Bearbeiten"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        {user.id !== session?.user?.id && (
                          <button
                            onClick={() => deleteUser(user.id, user.name)}
                            className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs transition-colors"
                            title="Löschen"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
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
