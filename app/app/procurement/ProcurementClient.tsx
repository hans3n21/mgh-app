'use client';

import React, { useState } from 'react';

interface ProcurementItem {
  id: string;
  name: string;
  qty: number;
  unit?: string | null;
  status: string;
  neededBy?: Date | null;
  note?: string | null;
  orderId?: string | null;
  createdAt: Date;
  updatedAt: Date;
  archivedAt?: Date | null;
  creator?: {
    id: string;
    name: string;
    email: string;
  } | null;
}

interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface ProcurementClientProps {
  initialItems: ProcurementItem[];
  currentUser: CurrentUser;
}

const statusLabels = {
  'offen': { label: 'Offen', color: 'bg-yellow-500/20 text-yellow-300' },
  'bestellt': { label: 'Bestellt', color: 'bg-blue-500/20 text-blue-300' },
  'archiviert': { label: 'Archiviert', color: 'bg-slate-500/20 text-slate-400' },
};

export default function ProcurementClient({ initialItems, currentUser }: ProcurementClientProps) {
  const [items, setItems] = useState<ProcurementItem[]>(initialItems);
  const [showArchived, setShowArchived] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editData, setEditData] = useState<{
    name: string;
    qty: number;
    note: string;
    orderId: string;
    link?: string;
  }>({
    name: '',
    qty: 1,
    note: '',
    orderId: '',
    link: ''
  });
  const [loading, setLoading] = useState(false);

  // Form state für neues Item
  const [newItem, setNewItem] = useState({
    name: '',
    qty: 1,
    note: '',
    orderId: '',
    link: ''
  });

  const isAdmin = currentUser.role === 'admin';

  // Items laden (mit Filter)
  const loadItems = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (showArchived) params.set('archived', 'true');
      if (statusFilter !== 'all') params.set('status', statusFilter);

      const res = await fetch(`/api/procurement?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setItems(data);
      }
    } catch (error) {
      console.error('Fehler beim Laden:', error);
    } finally {
      setLoading(false);
    }
  };

  // Neues Item erstellen
  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      console.log('🔄 Sending item to API:', newItem);

      const res = await fetch('/api/procurement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newItem),
      });

      console.log('📡 API Response status:', res.status);

      if (res.ok) {
        const item = await res.json();
        console.log('✅ Item created successfully:', item);
        setItems(prev => [item, ...prev]);
        setNewItem({ name: '', qty: 1, note: '', orderId: '', link: '' });
        setShowAddForm(false);
        alert('✅ Item erfolgreich erstellt!');
      } else {
        const error = await res.json();
        console.error('❌ API Error:', error);
        alert(`Fehler: ${error.error || 'Unbekannter Fehler'}`);
      }
    } catch (error) {
      console.error('❌ Network Error:', error);
      alert('Netzwerkfehler beim Erstellen des Items');
    } finally {
      setLoading(false);
    }
  };

  // Item Status ändern (nur Admin)
  const handleStatusChange = async (itemId: string, newStatus: string) => {
    setLoading(true);
    try {
      const res = await fetch('/api/procurement', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: itemId, status: newStatus }),
      });

      if (res.ok) {
        const updatedItem = await res.json();
        setItems(prev => prev.map(item =>
          item.id === itemId ? updatedItem : item
        ));

        // Wenn archiviert und Filter nicht auf "archiviert", Item aus Liste entfernen
        if (newStatus === 'archiviert' && !showArchived) {
          setItems(prev => prev.filter(item => item.id !== itemId));
        }
      } else {
        const error = await res.json();
        alert(`Fehler: ${error.error}`);
      }
    } catch (error) {
      console.error('Fehler beim Status-Update:', error);
      alert('Fehler beim Aktualisieren des Status');
    } finally {
      setLoading(false);
    }
  };

  // Item bearbeiten starten
  const startEditItem = (item: ProcurementItem) => {
    setEditingItem(item.id);
    setEditData({
      name: item.name,
      qty: item.qty,
      note: item.note || '',
      orderId: item.orderId || '',
      link: (item as any).link || ''
    });
  };

  // Item bearbeiten speichern
  const handleUpdateItem = async (itemId: string) => {
    setLoading(true);
    try {
      const res = await fetch('/api/procurement', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: itemId,
          name: editData.name,
          qty: editData.qty,
          note: editData.note,
          orderId: editData.orderId,
          link: editData.link
        }),
      });

      if (res.ok) {
        const updatedItem = await res.json();
        setItems(prev => prev.map(item =>
          item.id === itemId ? updatedItem : item
        ));
        setEditingItem(null);
      } else {
        const error = await res.json();
        alert(`Fehler: ${error.error}`);
      }
    } catch (error) {
      console.error('Fehler beim Update:', error);
      alert('Fehler beim Aktualisieren des Items');
    } finally {
      setLoading(false);
    }
  };

  // Item löschen (nur Admin)
  const handleDeleteItem = async (itemId: string) => {
    if (!confirm('Item wirklich löschen?')) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/procurement?id=${itemId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setItems(prev => prev.filter(item => item.id !== itemId));
      } else {
        const error = await res.json();
        alert(`Fehler: ${error.error}`);
      }
    } catch (error) {
      console.error('Fehler beim Löschen:', error);
      alert('Fehler beim Löschen des Items');
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    loadItems();
  }, [showArchived, statusFilter]);

  const filteredItems = items.filter(item => {
    if (statusFilter !== 'all' && item.status !== statusFilter) return false;
    if (!showArchived && item.status === 'archiviert') return false;
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Kontrollen */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm"
          >
            <option value="all">Alle Status</option>
            <option value="offen">Offen</option>
            <option value="bestellt">Bestellt</option>
            {showArchived && <option value="archiviert">Archiviert</option>}
          </select>

          {/* Archiv Toggle */}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="rounded"
            />
            Archiv anzeigen
          </label>
        </div>

        {/* Add Button */}
        <button
          onClick={() => setShowAddForm(true)}
          className="bg-sky-600 hover:bg-sky-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          + Neues Item
        </button>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
          <h3 className="text-lg font-semibold mb-3">Neues Procurement Item</h3>
          <form onSubmit={handleAddItem} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Produkt *</label>
                <input
                  type="text"
                  value={newItem.name}
                  onChange={(e) => setNewItem(prev => ({ ...prev, name: e.target.value }))}
                  required
                  className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm"
                  placeholder="z.B. Floyd Rose Original"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Anzahl (Stück) *</label>
                <input
                  type="number"
                  min="1"
                  value={newItem.qty}
                  onChange={(e) => setNewItem(prev => ({ ...prev, qty: parseInt(e.target.value) }))}
                  required
                  className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Auftrag ID</label>
                <input
                  type="text"
                  value={newItem.orderId}
                  onChange={(e) => setNewItem(prev => ({ ...prev, orderId: e.target.value }))}
                  className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm"
                  placeholder="ORD-2025-001"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Link (URL)</label>
                <input
                  type="url"
                  value={newItem.link}
                  onChange={(e) => setNewItem(prev => ({ ...prev, link: e.target.value }))}
                  className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm"
                  placeholder="https://shop.example.com/artikel"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Notiz</label>
                <input
                  type="text"
                  value={newItem.note}
                  onChange={(e) => setNewItem(prev => ({ ...prev, note: e.target.value }))}
                  className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm"
                  placeholder="Zusätzliche Informationen"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={loading}
                className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                {loading ? 'Erstelle...' : 'Erstellen'}
              </button>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="bg-slate-600 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Abbrechen
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Items Liste */}
      <div className="bg-slate-800/10 sm:bg-slate-800/30 rounded-lg overflow-hidden">
        {loading && (
          <div className="text-center py-4">
            <div className="inline-flex items-center gap-2 text-slate-400">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-sky-500"></div>
              <span className="text-sm">Lade Items...</span>
            </div>
          </div>
        )}

        {!loading && filteredItems.length === 0 ? (
          <div className="text-slate-500 text-center py-8">
            <div className="text-4xl mb-2">📦</div>
            <div>Keine Items gefunden</div>
            {statusFilter !== 'all' && (
              <div className="text-sm mt-1">für Status "{statusLabels[statusFilter as keyof typeof statusLabels]?.label}"</div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-400 bg-slate-800/50">
                  <th className="py-3 px-4">Produkt</th>
                  <th className="py-3 px-4">Menge</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 hidden sm:table-cell">Erstellt von</th>
                  <th className="py-3 px-4 hidden sm:table-cell">Auftrag</th>
                  <th className="py-3 px-4 hidden sm:table-cell">Notiz</th>
                  <th className="py-3 px-4 hidden sm:table-cell">Link</th>
                  <th className="py-3 px-4 hidden sm:table-cell">Erstellt</th>
                  {isAdmin && <th className="py-3 px-4">Aktionen</th>}
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item, index) => (
                  <tr key={item.id} className={`border-t border-slate-700 hover:bg-slate-800/30 ${index % 2 === 0 ? 'bg-slate-800/10' : ''}`}>
                    <td className="py-3 px-4 font-medium">
                      {editingItem === item.id ? (
                        <input
                          type="text"
                          value={editData.name}
                          onChange={(e) => setEditData(prev => ({ ...prev, name: e.target.value }))}
                          className="w-full rounded bg-slate-950 border border-slate-700 px-2 py-1 text-sm"
                        />
                      ) : (
                        item.name
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {editingItem === item.id ? (
                        <input
                          type="number"
                          min="1"
                          value={editData.qty}
                          onChange={(e) => setEditData(prev => ({ ...prev, qty: parseInt(e.target.value) }))}
                          className="w-20 rounded bg-slate-950 border border-slate-700 px-2 py-1 text-sm"
                        />
                      ) : (
                        `${item.qty} Stk`
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusLabels[item.status as keyof typeof statusLabels]?.color || 'bg-slate-500/20 text-slate-400'}`}>
                        {statusLabels[item.status as keyof typeof statusLabels]?.label || item.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-400 hidden sm:table-cell">
                      {item.creator?.name || 'Unbekannt'}
                    </td>
                    <td className="py-3 px-4 text-slate-400 hidden sm:table-cell">
                      {editingItem === item.id ? (
                        <input
                          type="text"
                          value={editData.orderId}
                          onChange={(e) => setEditData(prev => ({ ...prev, orderId: e.target.value }))}
                          className="w-full rounded bg-slate-950 border border-slate-700 px-2 py-1 text-sm"
                          placeholder="ORD-2025-001"
                        />
                      ) : (
                        item.orderId || '—'
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-400 max-w-xs hidden sm:table-cell">
                      {editingItem === item.id ? (
                        <input
                          type="text"
                          value={editData.note}
                          onChange={(e) => setEditData(prev => ({ ...prev, note: e.target.value }))}
                          className="w-full rounded bg-slate-950 border border-slate-700 px-2 py-1 text-sm"
                          placeholder="Notiz..."
                        />
                      ) : (
                        <span className="truncate">{item.note || '—'}</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-400 max-w-xs hidden sm:table-cell">
                      {editingItem === item.id ? (
                        <input
                          type="url"
                          value={editData.link || ''}
                          onChange={(e) => setEditData(prev => ({ ...prev, link: e.target.value }))}
                          className="w-full rounded bg-slate-950 border border-slate-700 px-2 py-1 text-sm"
                          placeholder="https://..."
                        />
                      ) : (
                        (item as any).link ? (
                          <a href={(item as any).link} target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:text-sky-300 underline">Link</a>
                        ) : '—'
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-400 hidden sm:table-cell">
                      {new Date(item.createdAt).toLocaleDateString('de-DE')}
                    </td>
                    {isAdmin && (
                      <td className="py-3 px-4">
                        <div className="flex gap-1">
                          {editingItem === item.id ? (
                            <>
                              {/* Save Button */}
                              <button
                                onClick={() => handleUpdateItem(item.id)}
                                className="text-green-400 hover:text-green-300 p-1 rounded hover:bg-slate-700"
                                title="Speichern"
                              >
                                ✅
                              </button>
                              {/* Cancel Button */}
                              <button
                                onClick={() => setEditingItem(null)}
                                className="text-slate-400 hover:text-slate-300 p-1 rounded hover:bg-slate-700"
                                title="Abbrechen"
                              >
                                ❌
                              </button>
                            </>
                          ) : (
                            <>
                              {/* Edit Button */}
                              <button
                                onClick={() => startEditItem(item)}
                                className="text-slate-400 hover:text-slate-300 p-1 rounded hover:bg-slate-700"
                                title="Bearbeiten"
                              >
                                ✏️
                              </button>

                              {/* Status Icon Buttons */}
                              {item.status !== 'offen' && (
                                <button
                                  onClick={() => handleStatusChange(item.id, 'offen')}
                                  className="hidden sm:inline-flex text-yellow-400 hover:text-yellow-300 p-1 rounded hover:bg-slate-700"
                                  title="Auf Offen setzen"
                                >
                                  ⭕
                                </button>
                              )}

                              {item.status !== 'bestellt' && (
                                <button
                                  onClick={() => handleStatusChange(item.id, 'bestellt')}
                                  className="hidden sm:inline-flex text-blue-400 hover:text-blue-300 p-1 rounded hover:bg-slate-700"
                                  title="Als bestellt markieren"
                                >
                                  🚚
                                </button>
                              )}

                              {(item.status === 'bestellt' || item.status === 'offen') && (
                                <button
                                  onClick={() => handleStatusChange(item.id, 'archiviert')}
                                  className="hidden sm:inline-flex text-green-400 hover:text-green-300 p-1 rounded hover:bg-slate-700"
                                  title="Als eingetroffen markieren (wird archiviert)"
                                >
                                  ✅
                                </button>
                              )}

                              {/* Delete Button */}
                              <button
                                onClick={() => handleDeleteItem(item.id)}
                                className="text-red-400 hover:text-red-300 p-1 rounded hover:bg-slate-700"
                                title="Löschen"
                              >
                                🗑️
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="text-xs text-slate-500 space-y-1">
        <p><strong>Hinweis:</strong> Alle Mitarbeiter können neue Items hinzufügen.</p>
        <p>Nur Admins können Status ändern und Items löschen.</p>
        <p>Items mit Status "Archiviert" werden standardmäßig ausgeblendet.</p>
      </div>
    </div>
  );
}
