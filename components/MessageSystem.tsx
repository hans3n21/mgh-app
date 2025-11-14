'use client';

import { useState, useImperativeHandle, forwardRef } from 'react';
import DatasheetPDFGenerator from './DatasheetPDFGenerator';
import VoiceInputButton from './VoiceInputButton';

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
  images?: { id: string; path: string; comment?: string }[];
  onPDFAttachment?: (pdfBlob: Blob, filename: string) => void;
  // Für PDF-Generierung
  orderTitle?: string;
  orderType?: string;
  customerName?: string;
  specs?: { id: string; key: string; value: string }[];
  activeCategories?: Set<string>;
}

const MessageSystem = forwardRef<
  { attachPDF: (blob: Blob, filename: string) => void },
  MessageSystemProps
>(function MessageSystem({ 
  orderId, 
  messages, 
  currentUserId, 
  onMessagesChange,
  images,
  onPDFAttachment,
  orderTitle,
  orderType,
  customerName,
  specs,
  activeCategories,
}, ref) {
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [attachedPDF, setAttachedPDF] = useState<{ blob: Blob; filename: string } | null>(null);
  const [optimizing, setOptimizing] = useState(false);

  useImperativeHandle(ref, () => ({
    attachPDF: (blob: Blob, filename: string) => {
      setAttachedPDF({ blob, filename });
    }
  }));

  const sendMessage = async () => {
    if (!newMessage.trim() || sending) return;

    setSending(true);
    try {
      // Nachricht mit ausgewählten Bildern und PDFs zusammenstellen
      let messageBody = newMessage.trim();
      const attachments: string[] = [];
      
      if (selectedImages.length > 0) {
        const imageUrls = selectedImages.map(id => {
          const img = images?.find(i => i.id === id);
          return img?.path;
        }).filter(Boolean);
        
        attachments.push(...imageUrls.map(url => `🖼️ ${url}`));
      }
      
      if (attachedPDF) {
        attachments.push(`📄 ${attachedPDF.filename}`);
      }
      
      if (attachments.length > 0) {
        messageBody += '\n\n📎 Anhänge:\n' + attachments.join('\n');
      }

      const response = await fetch(`/api/orders/${orderId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: messageBody,
          senderType: 'staff',
          senderId: currentUserId,
        }),
      });

      if (response.ok) {
        const createdMessage = await response.json();
        onMessagesChange([...messages, createdMessage]);
        setNewMessage('');
        setSelectedImages([]);
        setAttachedPDF(null);
      }
    } catch (error) {
      console.error('Fehler beim Senden:', error);
      alert('Fehler beim Senden der Nachricht');
    } finally {
      setSending(false);
    }
  };

  // Text optimieren via N8N
  const optimizeText = async () => {
    if (!newMessage.trim() || optimizing) return;
    
    setOptimizing(true);
    try {
      const res = await fetch('/api/compose-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: newMessage,
          customerName: customerName,
          orderTitle: orderTitle,
          language: 'de'
        }),
      });
      
      const data = await res.json();
      
      if (data.text && !data.fallback) {
        setNewMessage(data.text);
      } else if (data.fallback) {
        alert('N8N nicht konfiguriert. Text bleibt unverändert.');
      } else {
        alert('Fehler bei der Text-Optimierung.');
      }
    } catch (error) {
      console.error('Text optimization error:', error);
      alert('Fehler bei der Text-Optimierung.');
    } finally {
      setOptimizing(false);
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
          <div className="flex items-center gap-3">
            {/* Voice Input Button */}
            <VoiceInputButton
              onTranscript={(text) => {
                setNewMessage((prev) => {
                  const separator = prev.trim() ? '\n' : '';
                  return prev + separator + text;
                });
              }}
              language="de"
              disabled={sending}
            />
            <button
              onClick={optimizeText}
              disabled={!newMessage.trim() || optimizing || sending}
              className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-all bg-purple-700 hover:bg-purple-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
              title="Text via N8N optimieren"
            >
              {optimizing ? (
                <>
                  <span className="text-lg">⏳</span>
                  <span>Optimiere...</span>
                </>
              ) : (
                <>
                  <span className="text-lg">✨</span>
                  <span>Optimieren</span>
                </>
              )}
            </button>
            <div className="text-xs text-slate-500">
              {newMessage.length}/500 Zeichen
            </div>
            {selectedImages.length > 0 && (
              <div className="text-xs bg-sky-600 text-white px-2 py-0.5 rounded">
                {selectedImages.length} Bild(er) ausgewählt
              </div>
            )}
            {attachedPDF && (
              <div className="flex items-center gap-2 text-xs bg-green-600 text-white px-2 py-0.5 rounded">
                <span>📄 {attachedPDF.filename}</span>
                <button
                  onClick={() => setAttachedPDF(null)}
                  className="hover:bg-green-700 px-1 rounded"
                  title="PDF entfernen"
                >
                  ×
                </button>
              </div>
            )}
          </div>
          <button
            onClick={sendMessage}
            disabled={sending || !newMessage.trim() || newMessage.length > 500}
            className="rounded bg-slate-700 hover:bg-slate-600 px-3 py-1.5 text-sm font-medium disabled:opacity-50 text-slate-200"
          >
            {sending ? 'Sendet...' : 'Senden'}
          </button>
        </div>
      </div>

      {/* Dateien als Anhang Panel - unter "Neue Nachricht" */}
      {(images && images.length > 0) || (specs && specs.length > 0) ? (
        <div className="rounded-lg border border-slate-700 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">📎 Dateien als Anhang hinzufügen</div>
            {selectedImages.length > 0 && (
              <button
                onClick={() => setSelectedImages([])}
                className="text-xs text-slate-400 hover:text-slate-300"
              >
                Auswahl zurücksetzen
              </button>
            )}
          </div>
          {images && images.length > 0 && (
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2 max-h-40 overflow-y-auto">
              {images.map((img) => (
              <div key={img.id} className="relative group">
                <img
                  src={img.path}
                  className={`w-full h-16 object-cover rounded cursor-pointer border-2 transition-colors ${
                    selectedImages.includes(img.id)
                      ? 'border-sky-500 shadow-lg shadow-sky-500/25'
                      : 'border-slate-600 hover:border-slate-400'
                  }`}
                  title={img.comment || 'Bild als Anhang auswählen'}
                  onClick={() => {
                    setSelectedImages(prev => 
                      prev.includes(img.id) 
                        ? prev.filter(id => id !== img.id)
                        : [...prev, img.id]
                    );
                  }}
                />
                {selectedImages.includes(img.id) && (
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-sky-600 rounded-full flex items-center justify-center">
                    <span className="text-white text-xs">✓</span>
                  </div>
                )}
                </div>
              ))}
            </div>
          )}
          
          {/* PDF-Datenblatt Sektion */}
          {specs && specs.length > 0 && orderTitle && orderType && customerName && activeCategories && (
            <div className="border-t border-slate-600 pt-3">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-medium">📄 Datenblatt-PDF</div>
              </div>
              <DatasheetPDFGenerator
                orderId={orderId}
                orderTitle={orderTitle}
                orderType={orderType}
                customerName={customerName}
                specs={specs}
                activeCategories={activeCategories}
                assigneeName={undefined} // TODO: Assignee-Daten in MessageSystem verfügbar machen
                finalAmount={undefined} // TODO: Preis-Daten in MessageSystem verfügbar machen
                buttonText="📧 Datenblatt-PDF anhängen"
                stringCount={specs.find(s => s.key === 'string_count')?.value || '–'}
                onPDFGenerated={(pdfBlob, filename) => {
                  setAttachedPDF({ blob: pdfBlob, filename });
                }}
              />
            </div>
          )}
          
          <div className="text-xs text-slate-500">
            💡 Klicke auf Bilder, um sie als Anhang auszuwählen. PDFs werden automatisch angehängt.
          </div>
        </div>
      ) : null}

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
});

export default MessageSystem;
