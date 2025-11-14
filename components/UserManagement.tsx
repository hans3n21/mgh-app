'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'staff';
  createdAt: string;
  _count: {
    orders: number;
  };
}

interface CreateUserForm {
  name: string;
  email: string;
  password: string;
  role: 'admin' | 'staff';
}

export default function UserManagement() {
  const { data: session } = useSession();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState<CreateUserForm>({
    name: '',
    email: '',
    password: '',
    role: 'staff',
  });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Nur für Admins verfügbar
  if (session?.user?.role !== 'admin') {
    return (
      <div className="rounded-xl border border-slate-800 p-3">
        <div className="text-slate-400">Nur für Administratoren verfügbar.</div>
      </div>
    );
  }

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/users');
      if (response.ok) {
        const data = await response.json();
        setUsers(data);
      } else {
        throw new Error('Fehler beim Laden der Benutzer');
      }
    } catch (error) {
      setError('Fehler beim Laden der Benutzer');
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

  const deleteUser = async (userId: string, userName: string) => {
    if (!confirm(`Sind Sie sicher, dass Sie den Benutzer "${userName}" löschen möchten?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (response.ok) {
        await fetchUsers(); // Benutzerliste aktualisieren
      } else {
        alert(data.error || 'Fehler beim Löschen des Benutzers');
      }
    } catch (error) {
      alert('Fehler beim Löschen des Benutzers');
      console.error('Error deleting user:', error);
    }
  };

  const getRoleLabel = (role: string) => {
    return role === 'admin' ? 'Administrator' : 'Mitarbeiter';
  };

  const getRoleBadgeClass = (role: string) => {
    return role === 'admin'
      ? 'bg-amber-900/30 text-amber-300 border-amber-700/50'
      : 'bg-blue-900/30 text-blue-300 border-blue-700/50';
  };

  return (
    <div className="rounded-xl border border-slate-800 p-3">
      <div className="flex items-center justify-between mb-4">
        <div className="font-semibold">Benutzerverwaltung</div>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
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
              onChange={(e) => setCreateForm(prev => ({ ...prev, role: e.target.value as 'admin' | 'staff' }))}
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
              className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-green-800 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {creating ? 'Erstelle...' : 'Erstellen'}
            </button>
            <button
              onClick={() => {
                setShowCreateForm(false);
                setError(null);
              }}
              className="px-3 py-1.5 bg-slate-600 hover:bg-slate-500 text-white rounded-lg text-sm transition-colors"
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-slate-400 text-sm">Lade Benutzer...</div>
      ) : users.length === 0 ? (
        <div className="text-slate-400 text-sm">Keine Benutzer gefunden.</div>
      ) : (
        <div className="space-y-2">
          {users.map((user) => (
            <div key={user.id} className="flex items-center justify-between p-3 border border-slate-700 rounded-lg bg-slate-800/30">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-100">{user.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${getRoleBadgeClass(user.role)}`}>
                    {getRoleLabel(user.role)}
                  </span>
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
                {user.id !== session.user?.id && (
                  <button
                    onClick={() => deleteUser(user.id, user.name)}
                    className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs transition-colors"
                  >
                    Löschen
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
