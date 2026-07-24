'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

interface ReplyTemplate {
  id: string;
  key: string;
  lang: 'de' | 'en';
  subject: string | null;
  body: string;
  variables: string[] | null;
  createdAt: string;
  updatedAt: string;
}

interface CreateReplyTemplateForm {
  key: string;
  lang: 'de' | 'en';
  subject: string;
  body: string;
  variables: string;
}

export default function ReplyTemplateManagement() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === 'admin' || session?.user?.role === 'admin_no_feedback';
  const [templates, setTemplates] = useState<ReplyTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [templatesExpanded, setTemplatesExpanded] = useState(false);
  const [createForm, setCreateForm] = useState<CreateReplyTemplateForm>({
    key: '',
    lang: 'de',
    subject: '',
    body: '',
    variables: '',
  });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<CreateReplyTemplateForm> & { id: string } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    fetchTemplates();
  }, [isAdmin]);

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/reply-templates');
      if (response.ok) {
        const data = await response.json();
        setTemplates(data);
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unbekannter Fehler' }));
        throw new Error(errorData.error || `Fehler beim Laden der Templates (${response.status})`);
      }
    } catch (error: any) {
      const errorMessage = error.message || 'Fehler beim Laden der Templates';
      setError(errorMessage);
      console.error('Error fetching reply templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const createTemplate = async () => {
    if (!createForm.key || !createForm.body) {
      setError('Key und Body sind erforderlich');
      return;
    }

    try {
      setCreating(true);
      setError(null);

      const variablesArray = createForm.variables
        ? createForm.variables.split(',').map(v => v.trim()).filter(v => v.length > 0)
        : [];

      const response = await fetch('/api/reply-templates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          key: createForm.key,
          lang: createForm.lang,
          subject: createForm.subject || null,
          body: createForm.body,
          variables: variablesArray.length > 0 ? variablesArray : undefined,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        await fetchTemplates();
        setShowCreateForm(false);
        setCreateForm({
          key: '',
          lang: 'de',
          subject: '',
          body: '',
          variables: '',
        });
      } else {
        setError(data.error || 'Fehler beim Erstellen des Templates');
      }
    } catch (error) {
      setError('Fehler beim Erstellen des Templates');
      console.error('Error creating reply template:', error);
    } finally {
      setCreating(false);
    }
  };

  const updateTemplate = async (templateId: string, updates: Partial<CreateReplyTemplateForm>) => {
    try {
      setError(null);

      const body: any = {};
      if (updates.key) body.key = updates.key;
      if (updates.lang) body.lang = updates.lang;
      if (updates.subject !== undefined) body.subject = updates.subject || null;
      if (updates.body) body.body = updates.body;
      if (updates.variables !== undefined) {
        const variablesArray = updates.variables
          ? updates.variables.split(',').map(v => v.trim()).filter(v => v.length > 0)
          : [];
        body.variables = variablesArray.length > 0 ? variablesArray : null;
      }

      const response = await fetch(`/api/reply-templates/${templateId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (response.ok) {
        await fetchTemplates();
        setEditingId(null);
        setEditForm(null);
      } else {
        setError(data.error || 'Fehler beim Aktualisieren des Templates');
      }
    } catch (error) {
      setError('Fehler beim Aktualisieren des Templates');
      console.error('Error updating reply template:', error);
    }
  };

  const deleteTemplate = async (templateId: string, templateKey: string) => {
    if (!confirm(`Sind Sie sicher, dass Sie das Template "${templateKey}" löschen möchten?`)) {
      return;
    }

    try {
      setDeletingId(templateId);
      const response = await fetch(`/api/reply-templates/${templateId}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (response.ok) {
        await fetchTemplates();
      } else {
        alert(data.error || 'Fehler beim Löschen des Templates');
      }
    } catch (error) {
      alert('Fehler beim Löschen des Templates');
      console.error('Error deleting reply template:', error);
    } finally {
      setDeletingId(null);
    }
  };

  const startEdit = (template: ReplyTemplate) => {
    setEditingId(template.id);
    setEditForm({
      id: template.id,
      key: template.key,
      lang: template.lang,
      subject: template.subject || '',
      body: template.body,
      variables: template.variables ? template.variables.join(', ') : '',
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm(null);
    setError(null);
  };

  const saveEdit = async () => {
    if (!editForm) return;
    await updateTemplate(editForm.id, editForm);
  };

  // Nur für Admins verfügbar
  if (!isAdmin) {
    return (
      <div className="rounded-xl border border-slate-800 p-3">
        <div className="text-slate-400">Nur für Administratoren verfügbar.</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-800 p-3">
        <div className="text-slate-400">Lade Templates...</div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-800 p-3 space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-base font-semibold">Antwort-Templates</h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTemplatesExpanded(!templatesExpanded)}
            className="text-xs text-slate-400 hover:text-slate-200"
          >
            {templatesExpanded ? '▼' : '▶'}
          </button>
          <button
            type="button"
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="w-full sm:w-auto text-xs sm:text-sm rounded border border-slate-700 bg-slate-900 hover:bg-slate-800 px-2.5 py-1.5 text-slate-200 transition-colors"
          >
            {showCreateForm ? 'Abbrechen' : '+ Template erstellen'}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded border border-red-800 bg-red-900/20 p-2 text-sm text-red-300">
          {error}
        </div>
      )}

      {showCreateForm && (
        <div className="rounded border border-slate-700 bg-slate-900/50 p-3 space-y-3">
          <h4 className="text-sm font-medium">Neues Template erstellen</h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-300 mb-1">Key (eindeutig)</label>
              <input
                type="text"
                value={createForm.key}
                onChange={(e) => setCreateForm({ ...createForm, key: e.target.value })}
                className="w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-sm"
                placeholder="z.B. pickguard_quote"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Sprache</label>
              <select
                value={createForm.lang}
                onChange={(e) => setCreateForm({ ...createForm, lang: e.target.value as 'de' | 'en' })}
                className="w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-sm"
              >
                <option value="de">Deutsch</option>
                <option value="en">English</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-slate-300 mb-1">Betreff (optional)</label>
              <input
                type="text"
                value={createForm.subject}
                onChange={(e) => setCreateForm({ ...createForm, subject: e.target.value })}
                className="w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-sm"
                placeholder="Re: Ihre Anfrage"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-slate-300 mb-1">Body (Template-Text, Variablen mit {'{{variable}}'})</label>
              <textarea
                value={createForm.body}
                onChange={(e) => setCreateForm({ ...createForm, body: e.target.value })}
                rows={6}
                className="w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-sm"
                placeholder="Hallo {{firstName}}, vielen Dank für Ihre Anfrage..."
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-slate-300 mb-1">Variablen (kommagetrennt, optional)</label>
              <input
                type="text"
                value={createForm.variables}
                onChange={(e) => setCreateForm({ ...createForm, variables: e.target.value })}
                className="w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-sm"
                placeholder="firstName, mensur, griffbrett"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setShowCreateForm(false);
                setCreateForm({
                  key: '',
                  lang: 'de',
                  subject: '',
                  body: '',
                  variables: '',
                });
              }}
              className="text-xs rounded border border-slate-700 px-3 py-1 hover:bg-slate-800"
            >
              Abbrechen
            </button>
            <button
              type="button"
              onClick={createTemplate}
              disabled={creating}
              className="text-xs rounded bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1 disabled:opacity-50"
            >
              {creating ? 'Erstelle...' : 'Erstellen'}
            </button>
          </div>
        </div>
      )}

      {templatesExpanded && (
        <div className="space-y-2">
          {templates.length === 0 ? (
            <div className="text-sm text-slate-400">Keine Templates vorhanden</div>
          ) : (
            templates.map((template) => (
              <div key={template.id} className="rounded border border-slate-700 bg-slate-900/50 p-3">
                {editingId === template.id && editForm ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-slate-300 mb-1">Key</label>
                        <input
                          type="text"
                          value={editForm.key || ''}
                          onChange={(e) => setEditForm({ ...editForm, key: e.target.value })}
                          className="w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-300 mb-1">Sprache</label>
                        <select
                          value={editForm.lang || 'de'}
                          onChange={(e) => setEditForm({ ...editForm, lang: e.target.value as 'de' | 'en' })}
                          className="w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-sm"
                        >
                          <option value="de">Deutsch</option>
                          <option value="en">English</option>
                        </select>
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs text-slate-300 mb-1">Betreff</label>
                        <input
                          type="text"
                          value={editForm.subject || ''}
                          onChange={(e) => setEditForm({ ...editForm, subject: e.target.value })}
                          className="w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-sm"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs text-slate-300 mb-1">Body</label>
                        <textarea
                          value={editForm.body || ''}
                          onChange={(e) => setEditForm({ ...editForm, body: e.target.value })}
                          rows={6}
                          className="w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-sm"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs text-slate-300 mb-1">Variablen (kommagetrennt)</label>
                        <input
                          type="text"
                          value={editForm.variables || ''}
                          onChange={(e) => setEditForm({ ...editForm, variables: e.target.value })}
                          className="w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-sm"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="text-xs rounded border border-slate-700 px-3 py-1 hover:bg-slate-800"
                      >
                        Abbrechen
                      </button>
                      <button
                        type="button"
                        onClick={saveEdit}
                        className="text-xs rounded bg-sky-600 hover:bg-sky-500 text-white px-3 py-1"
                      >
                        Speichern
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-medium text-sm">{template.key}</div>
                        <div className="text-xs text-slate-400">
                          {template.lang === 'de' ? 'Deutsch' : 'English'}
                          {template.subject && ` · ${template.subject}`}
                        </div>
                        {template.variables && template.variables.length > 0 && (
                          <div className="text-xs text-slate-400 mt-1">
                            Variablen: {template.variables.join(', ')}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(template)}
                          className="text-xs rounded border border-slate-700 px-2 py-1 hover:bg-slate-800"
                        >
                          Bearbeiten
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteTemplate(template.id, template.key)}
                          disabled={deletingId === template.id}
                          className="text-xs rounded border border-red-700 bg-red-900/20 text-red-300 px-2 py-1 hover:bg-red-900/30 disabled:opacity-50"
                        >
                          {deletingId === template.id ? 'Löschen...' : 'Löschen'}
                        </button>
                      </div>
                    </div>
                    <div className="text-xs text-slate-500 bg-slate-950 p-2 rounded border border-slate-800 whitespace-pre-wrap max-h-32 overflow-y-auto">
                      {template.body}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
