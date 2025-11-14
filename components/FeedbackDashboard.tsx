'use client';
import React, { useState, useEffect } from 'react';

interface Feedback {
  id: string;
  message: string;
  page: string;
  url: string;
  timestamp: string;
  userAgent?: string;
  resolved: boolean;
  resolvedBy?: string;
  resolvedAt?: string;
  createdAt: string;
}

export default function FeedbackDashboard() {
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [filter, setFilter] = useState<'all' | 'open' | 'resolved'>('open');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFeedback();
  }, [filter]);

  const loadFeedback = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filter === 'open') params.set('resolved', 'false');
      if (filter === 'resolved') params.set('resolved', 'true');
      
      const response = await fetch(`/api/feedback?${params}`);
      if (response.ok) {
        const data = await response.json();
        setFeedback(data);
      }
    } catch (error) {
      console.error('Fehler beim Laden des Feedbacks:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleResolved = async (id: string, resolved: boolean) => {
    try {
      const response = await fetch('/api/feedback', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, resolved }),
      });

      if (response.ok) {
        loadFeedback(); // Reload data
      }
    } catch (error) {
      console.error('Fehler beim Aktualisieren:', error);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getPageIcon = (page: string) => {
    switch (page.toLowerCase()) {
      case 'posteingang': return '📥';
      case 'aufträge': return '📋';
      case 'kunden': return '👥';
      case 'preise': return '💰';
      case 'beschaffung': return '📦';
      case 'einstellungen': return '⚙️';
      case 'dashboard': return '🏠';
      default: return '📄';
    }
  };

  const openFeedback = feedback.filter(f => !f.resolved);
  const resolvedFeedback = feedback.filter(f => f.resolved);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-slate-400">Lade Feedback...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-200">
            💬 Feedback-Dashboard
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Verwalte Feedback und Verbesserungsvorschläge der Kollegen
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="text-xs text-slate-400">
            {openFeedback.length} offen • {resolvedFeedback.length} erledigt
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex border-b border-slate-800">
        {[
          { key: 'open', label: 'Offen', count: openFeedback.length },
          { key: 'resolved', label: 'Erledigt', count: resolvedFeedback.length },
          { key: 'all', label: 'Alle', count: feedback.length },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key as any)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              filter === tab.key
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-300'
            }`}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      {/* Feedback List */}
      <div className="space-y-4">
        {feedback.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            {filter === 'open' ? 'Kein offenes Feedback' : 
             filter === 'resolved' ? 'Kein erledigtes Feedback' : 
             'Kein Feedback vorhanden'}
          </div>
        ) : (
          feedback.map((item) => (
            <div
              key={item.id}
              className={`p-4 rounded-lg border transition-all ${
                item.resolved
                  ? 'bg-slate-900/30 border-slate-800/50'
                  : 'bg-slate-900 border-slate-800'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  {/* Header */}
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">{getPageIcon(item.page)}</span>
                    <span className="font-medium text-slate-200">{item.page}</span>
                    <span className="text-xs text-slate-500">
                      {formatDate(item.timestamp)}
                    </span>
                    {item.resolved && (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-green-900/20 text-green-400 border border-green-800">
                        ✓ Erledigt
                      </span>
                    )}
                  </div>

                  {/* Message */}
                  <div className="text-sm text-slate-300 mb-3 whitespace-pre-wrap">
                    {item.message}
                  </div>

                  {/* URL */}
                  <div className="text-xs text-slate-500 mb-2">
                    <span className="font-mono">{item.url}</span>
                  </div>

                  {/* Resolved Info */}
                  {item.resolved && item.resolvedAt && (
                    <div className="text-xs text-slate-500">
                      Erledigt am {formatDate(item.resolvedAt)}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => window.open(item.url, '_blank')}
                    className="p-2 text-slate-400 hover:text-slate-200 rounded border border-slate-700 hover:border-slate-600 transition-colors"
                    title="Seite öffnen"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </button>
                  
                  <button
                    onClick={() => toggleResolved(item.id, !item.resolved)}
                    className={`px-3 py-1 text-xs rounded border transition-colors ${
                      item.resolved
                        ? 'border-slate-600 text-slate-300 hover:bg-slate-800'
                        : 'border-green-600 bg-green-600/20 text-green-400 hover:bg-green-600/30'
                    }`}
                  >
                    {item.resolved ? 'Wieder öffnen' : 'Als erledigt markieren'}
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
