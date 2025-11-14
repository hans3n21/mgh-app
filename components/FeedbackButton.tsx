'use client';
import React, { useState, useEffect } from 'react';

interface FeedbackButtonProps {
  className?: string;
}

export default function FeedbackButton({ className = '' }: FeedbackButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [currentPage, setCurrentPage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  // Aktuelle Seite erfassen
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname;
      const pageName = getPageName(path);
      setCurrentPage(pageName);
    }
  }, []);

  const getPageName = (path: string): string => {
    if (path === '/') return 'Dashboard';
    if (path.includes('/posteingang')) return 'Posteingang';
    if (path.includes('/orders')) return 'Aufträge';
    if (path.includes('/customers')) return 'Kunden';
    if (path.includes('/prices')) return 'Preise';
    if (path.includes('/procurement')) return 'Beschaffung';
    if (path.includes('/settings')) return 'Einstellungen';
    return path.replace('/', '').replace('-', ' ');
  };

  const sendFeedback = async () => {
    if (!message.trim()) return;
    
    setSending(true);
    try {
      // Hier würdest du die Nachricht an dein Backend oder E-Mail-System senden
      const feedbackData = {
        message: message.trim(),
        page: currentPage,
        url: window.location.href,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
      };

      // Beispiel: API-Call (du müsstest eine entsprechende API-Route erstellen)
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(feedbackData),
      });

      if (response.ok) {
        setSent(true);
        setTimeout(() => {
          setIsOpen(false);
          setSent(false);
          setMessage('');
        }, 2000);
      } else {
        throw new Error('Fehler beim Senden');
      }
    } catch (error) {
      console.error('Feedback-Fehler:', error);
      alert('Fehler beim Senden der Nachricht');
    } finally {
      setSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      sendFeedback();
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className={`fixed top-4 left-4 z-50 bg-amber-600 hover:bg-amber-500 text-white p-2 rounded-full shadow-lg transition-all duration-200 md:hidden ${className}`}
        title="Feedback senden"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-3.582 8-8 8a8.959 8.959 0 01-4.906-1.471L3 21l2.471-5.094A8.959 8.959 0 013 12c0-4.418 3.582-8 8-8s8 3.582 8 8z" />
        </svg>
      </button>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 z-40 md:hidden"
        onClick={() => setIsOpen(false)}
      />
      
      {/* Modal */}
      <div className="fixed top-4 left-4 right-4 z-50 bg-slate-900 border border-slate-700 rounded-lg shadow-xl md:hidden">
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-200">
              💬 Feedback senden
            </h3>
            <button
              onClick={() => setIsOpen(false)}
              className="text-slate-400 hover:text-slate-200 p-1"
            >
              ✕
            </button>
          </div>
          
          <div className="space-y-3">
            <div className="text-sm text-slate-400">
              <strong>Aktuelle Seite:</strong> {currentPage}
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Deine Nachricht:
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Beschreibe hier dein Problem oder deinen Verbesserungsvorschlag..."
                className="w-full h-32 px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-200 placeholder-slate-500 resize-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                disabled={sending || sent}
              />
              <div className="text-xs text-slate-500 mt-1">
                Tipp: Strg + Enter zum schnellen Senden
              </div>
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={sendFeedback}
                disabled={!message.trim() || sending || sent}
                className="flex-1 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-700 disabled:text-slate-500 text-white py-2 px-4 rounded font-medium transition-colors"
              >
                {sent ? '✓ Gesendet!' : sending ? 'Sende...' : 'Senden'}
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="px-4 py-2 border border-slate-700 text-slate-300 rounded hover:bg-slate-800 transition-colors"
                disabled={sending}
              >
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
