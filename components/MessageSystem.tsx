'use client';

import { useState } from 'react';

interface Message {
  id: string;
  body: string;
  createdAt: Date;
  senderType: string; // "staff" | "customer"
  sender?: { id: string; name: string } | null;
}

interface MessageSystemProps {
  orderId: string;
  messages: Message[];
  currentUserId: string;
  onMessagesChange: (messages: Message[]) => void;
}

export default function MessageSystem({ 
  orderId, 
  messages, 
  currentUserId, 
  onMessagesChange 
}: MessageSystemProps) {
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);

  const sendMessage = async () => {
    if (!newMessage.trim() || sending) return;

    setSending(true);
    try {
      const response = await fetch(`/api/orders/${orderId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: newMessage.trim(),
          senderType: 'staff',
          senderId: currentUserId,
        }),
      });

      if (response.ok) {
        const createdMessage = await response.json();
        onMessagesChange([...messages, createdMessage]);
        setNewMessage('');
      }
    } catch (error) {
      console.error('Fehler beim Senden:', error);
      alert('Fehler beim Senden der Nachricht');
    } finally {
      setSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-4">
      {/* Messages */}
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="text-slate-500 text-sm text-center py-4">
            Noch keine Nachrichten
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`rounded-lg p-3 ${
                message.senderType === 'staff'
                  ? 'bg-sky-500/10 border border-sky-500/20 ml-4'
                  : 'bg-slate-700/30 border border-slate-600/50 mr-4'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      message.senderType === 'staff' ? 'bg-sky-500' : 'bg-slate-400'
                    }`}
                  />
                  <span className="text-sm font-medium">
                    {message.senderType === 'staff'
                      ? message.sender?.name || 'Mitarbeiter'
                      : 'Kunde'}
                  </span>
                </div>
                <span className="text-xs text-slate-400">
                  {formatDate(message.createdAt)}
                </span>
              </div>
              <div className="text-sm text-slate-200 whitespace-pre-wrap">
                {message.body}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Message Input */}
      <div className="rounded-lg border border-slate-700 p-3 space-y-3">
        <div className="text-sm font-medium">Neue Nachricht</div>
        <textarea
          placeholder="Nachricht eingeben... (Enter zum Senden, Shift+Enter für neue Zeile)"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyPress={handleKeyPress}
          className="w-full rounded bg-slate-950 border border-slate-700 px-3 py-2 text-sm resize-none"
          rows={3}
        />
        <div className="flex justify-between items-center">
          <div className="text-xs text-slate-500">
            {newMessage.length}/500 Zeichen
          </div>
          <button
            onClick={sendMessage}
            disabled={sending || !newMessage.trim() || newMessage.length > 500}
            className="rounded bg-sky-600 hover:bg-sky-500 px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            {sending ? 'Sendet...' : 'Senden'}
          </button>
        </div>
      </div>

      {/* Customer Message Simulation */}
      <div className="rounded-lg border border-slate-600/50 bg-slate-800/30 p-3">
        <div className="text-sm font-medium mb-2">💡 Kunde simulieren</div>
        <div className="text-xs text-slate-400 mb-2">
          Für Demo-Zwecke: Nachricht als Kunde senden
        </div>
        <button
          onClick={async () => {
            try {
              const response = await fetch(`/api/orders/${orderId}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  body: 'Hallo! Wie ist der Stand meines Auftrags? Freue mich auf Updates!',
                  senderType: 'customer',
                  senderId: null,
                }),
              });

              if (response.ok) {
                const createdMessage = await response.json();
                onMessagesChange([...messages, createdMessage]);
              }
            } catch (error) {
              console.error('Fehler:', error);
            }
          }}
          className="text-xs rounded border border-slate-600 px-2 py-1 hover:bg-slate-700"
        >
          📱 Kunde-Nachricht simulieren
        </button>
      </div>
    </div>
  );
}
