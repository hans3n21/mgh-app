'use client';

import { useState, useImperativeHandle, forwardRef, useMemo, useRef } from 'react';
import DatasheetPDFGenerator from './DatasheetPDFGenerator';
import VoiceInputButton from './VoiceInputButton';
import ImageCarouselModal from './ImageCarouselModal';
import { compressImageSource, compressImageFile } from '@/lib/image-compress';

interface Message {
  id: string;
  body: string;
  createdAt: Date;
  senderType: string; // "staff" | "customer"
  sender?: { id: string; name: string } | null;
  isEmail?: boolean;
}

interface MailEntry {
  id: string;
  messageId?: string;
  subject: string | null;
  fromName: string | null;
  fromEmail: string;
  text: string | null;
  html: string | null;
  date: Date;
  folder: string;
  senderId: string | null;
  attachments: Array<{ id: string; filename: string; mimeType: string | null; size: number }>;
}

interface OrderTaskEntry {
  id: string;
  title: string;
  note: string | null;
  status: string;
  completedAt: string | null;
  createdAt: string;
  assignee: { id: string; name: string };
  creator: { id: string; name: string };
}

interface MessageSystemProps {
  orderId: string;
  messages: Message[];
  currentUserId: string;
  onMessagesChange: (messages: Message[]) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  images?: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onImagesChange?: (images: any[]) => void;
  onPDFAttachment?: (pdfBlob: Blob, filename: string) => void;
  mails?: MailEntry[];
  orderTitle?: string;
  orderType?: string;
  customerName?: string;
  customerEmail?: string | null;
  specs?: { id: string; key: string; value: string }[];
  activeCategories?: Set<string>;
  users?: Array<{ id: string; name: string }>;
  tasks?: OrderTaskEntry[];
  onTasksChange?: (tasks: OrderTaskEntry[]) => void;
}

type TimelineEntry =
  | { kind: 'message'; data: Message; date: Date }
  | { kind: 'mail-in'; data: MailEntry; date: Date }
  | { kind: 'mail-out'; data: MailEntry; date: Date }
  | { kind: 'task'; data: OrderTaskEntry; date: Date };

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function getMailDedupKey(mail: MailEntry): string {
  const messageId = (mail.messageId || '').trim().toLowerCase();
  if (messageId && !messageId.startsWith('no-id-')) {
    return `msgid:${messageId}`;
  }
  const subject = normalizeWhitespace(mail.subject || '');
  const from = normalizeWhitespace(mail.fromEmail || '');
  const date = new Date(mail.date).toISOString().slice(0, 16); // minute precision
  const snippet = normalizeWhitespace((mail.text || stripHtml(mail.html || '')).slice(0, 200));
  return `fp:${from}|${subject}|${date}|${snippet}`;
}

function getMailPriority(mail: MailEntry): number {
  let score = 0;
  if (mail.folder === 'INBOX') score += 4;
  if (mail.folder === 'Sent') score += 3;
  if (mail.folder === 'Trash') score -= 5;
  if ((mail.attachments || []).length > 0) score += 1;
  return score;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 8192;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
}

function stripHtml(html: string): string {
  if (typeof document === 'undefined') return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const el = document.createElement('div');
  el.innerHTML = html;
  return el.textContent || '';
}

function splitQuotedContent(text: string): { newContent: string; quoted: string } {
  const lines = text.split('\n');
  const patterns = [
    /^-{3,}\s*(Urspr|Original|Weitergeleitete)/i,
    /^_{3,}/,
    /^Am\s.+\sschrieb\s.+:$/,
    /^On\s.+\swrote:$/,
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    for (const pat of patterns) {
      if (pat.test(line)) {
        return {
          newContent: lines.slice(0, i).join('\n').trimEnd(),
          quoted: lines.slice(i).join('\n'),
        };
      }
    }

    if (/^Von:\s/i.test(line) || /^From:\s/i.test(line)) {
      const next = (lines[i + 1] || '').trim();
      if (/^(Gesendet|Sent|An|To|Datum|Date):\s/i.test(next)) {
        return {
          newContent: lines.slice(0, i).join('\n').trimEnd(),
          quoted: lines.slice(i).join('\n'),
        };
      }
    }
  }

  const firstQuote = lines.findIndex(l => l.startsWith('>'));
  if (firstQuote > 0 && lines.slice(firstQuote).filter(l => l.startsWith('>')).length >= 2) {
    return {
      newContent: lines.slice(0, firstQuote).join('\n').trimEnd(),
      quoted: lines.slice(firstQuote).join('\n'),
    };
  }

  return { newContent: text, quoted: '' };
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
  onImagesChange,
  onPDFAttachment,
  orderTitle,
  orderType,
  customerName,
  customerEmail,
  mails,
  specs,
  activeCategories,
  users,
  tasks: tasksProp,
  onTasksChange,
}, ref) {
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sendMode, setSendMode] = useState<'internal' | 'email' | 'task'>('email');
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [uploadedPhotos, setUploadedPhotos] = useState<{ file: File; previewUrl: string }[]>([]);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const [photoDragOver, setPhotoDragOver] = useState(false);
  const [attachedPDF, setAttachedPDF] = useState<{ blob: Blob; filename: string } | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const [taskAssigneeId, setTaskAssigneeId] = useState<string>('');
  const [localTasks, setLocalTasks] = useState<OrderTaskEntry[]>(tasksProp || []);
  const [attachmentLightbox, setAttachmentLightbox] = useState<{
    images: Array<{ id: string; url: string; filename: string; mimeType?: string | null }>;
    index: number;
  } | null>(null);
  const [imagePickerLightbox, setImagePickerLightbox] = useState<{ index: number } | null>(null);
  const [expandedMails, setExpandedMails] = useState<Set<string>>(new Set());
  const [expandedQuotes, setExpandedQuotes] = useState<Set<string>>(new Set());
  const [acknowledged, setAcknowledged] = useState(false);
  const [deletingImages, setDeletingImages] = useState(false);
  const [hiddenMailIds, setHiddenMailIds] = useState<Set<string>>(new Set());
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null);

  /** Nimmt Bilder aus Dateidialog, Drag&Drop oder Kamera entgegen. */
  const addPhotoFiles = (files: FileList | File[] | null) => {
    if (!files) return;
    const next = Array.from(files)
      .filter((f) => f.type.startsWith('image/'))
      .map((file) => ({ file, previewUrl: URL.createObjectURL(file) }));
    if (next.length > 0) setUploadedPhotos((prev) => [...prev, ...next]);
  };

  const deleteSelectedImages = async () => {
    if (!selectedImages.length || !images || !onImagesChange) return;
    if (!window.confirm(`${selectedImages.length} Datei(en) unwiderruflich löschen?`)) return;
    setDeletingImages(true);
    try {
      for (const imgId of selectedImages) {
        await fetch(`/api/orders/${orderId}/images?imageId=${imgId}`, { method: 'DELETE' });
      }
      onImagesChange(images.filter(img => !selectedImages.includes(img.id)));
      setSelectedImages([]);
    } catch (error) {
      console.error('Fehler beim Löschen:', error);
      alert('Fehler beim Löschen der Bilder');
    } finally {
      setDeletingImages(false);
    }
  };

  const isImageFile = (mime: string | null, filename: string) => {
    if (mime?.startsWith('image/')) return true;
    const ext = (filename || '').split('.').pop()?.toLowerCase();
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext || '');
  };
  const isPdfFile = (mime: string | null, filename: string) =>
    (mime || '').includes('pdf') || (filename || '').toLowerCase().endsWith('.pdf');

  const isNonImageFile = (path: string, comment?: string) => {
    const name = (comment || path || '').toLowerCase();
    return name.match(/\.(pdf|docx?|xlsx?|txt|csv|zip|rar|7z)$/);
  };

  const getFileIconForPath = (name: string): string => {
    const lower = name.toLowerCase();
    if (lower.endsWith('.pdf')) return '📄';
    if (lower.match(/\.docx?$/)) return '📝';
    if (lower.match(/\.xlsx?$/)) return '📊';
    if (lower.match(/\.(zip|rar|7z)$/)) return '📦';
    return '📎';
  };

  const dedupedMails = useMemo(() => {
    const unique = new Map<string, MailEntry>();
    for (const mail of mails || []) {
      if (hiddenMailIds.has(mail.id)) continue;
      const key = getMailDedupKey(mail);
      const existing = unique.get(key);
      if (!existing) {
        unique.set(key, mail);
        continue;
      }
      const existingScore = getMailPriority(existing);
      const currentScore = getMailPriority(mail);
      if (currentScore > existingScore) {
        unique.set(key, mail);
      }
    }
    return Array.from(unique.values());
  }, [mails, hiddenMailIds]);

  const attachmentMetaById = useMemo(() => {
    const meta = new Map<string, { filename: string; size: number; mimeType: string | null }>();
    for (const mail of mails || []) {
      for (const att of mail.attachments || []) {
        meta.set(att.id, {
          filename: att.filename,
          size: att.size,
          mimeType: att.mimeType,
        });
      }
    }
    return meta;
  }, [mails]);

  const dedupedSelectableImages = useMemo(() => {
    if (!images || images.length === 0) return [];

    const byKey = new Map<string, any>();
    for (const img of images) {
      const rawComment = (img.comment || '').trim();
      const attachmentId = typeof img.path === 'string'
        ? (img.path.match(/\/api\/attachments\/([^/?#]+)/)?.[1] || null)
        : null;

      // Für Mail-Anhänge nur "wirklich gleiche" Dateien zusammenfassen.
      // Dazu nutzen wir die Attachment-Metadaten (filename+size+mimeType).
      // Fehlen Metadaten, dedupen wir NICHT aggressiv und fallen auf die
      // eindeutige attachmentId/Pfad-Referenz zurück.
      let key: string;
      if (rawComment.toLowerCase().startsWith('mail-anhang:') && attachmentId) {
        const meta = attachmentMetaById.get(attachmentId);
        if (meta) {
          key = `mail:${meta.filename.toLowerCase()}|${meta.size}|${(meta.mimeType || '').toLowerCase()}`;
        } else {
          key = `mail-id:${attachmentId}`;
        }
      } else {
        key = `path:${(img.path || '').toLowerCase()}`;
      }

      if (!byKey.has(key)) {
        byKey.set(key, img);
      }
    }

    return Array.from(byKey.values());
  }, [images, attachmentMetaById]);

  const deleteInternalMessage = async (message: Message) => {
    if (!window.confirm('Diese Notiz wirklich löschen?')) return;
    setDeletingEntryId(message.id);
    try {
      const res = await fetch(`/api/orders/${orderId}/messages?messageId=${encodeURIComponent(message.id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Delete failed');
      onMessagesChange(messages.filter((m) => m.id !== message.id));
    } catch (error) {
      console.error('Fehler beim Löschen der Nachricht:', error);
      alert('Nachricht konnte nicht gelöscht werden.');
    } finally {
      setDeletingEntryId(null);
    }
  };

  const deleteMailEntry = async (mail: MailEntry) => {
    if (!window.confirm('Diese Mail inkl. verknüpfter Artefakte wirklich löschen?')) return;
    setDeletingEntryId(mail.id);
    try {
      const res = await fetch(`/api/mails/${encodeURIComponent(mail.id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      setHiddenMailIds((prev) => {
        const next = new Set(prev);
        next.add(mail.id);
        return next;
      });
      onMessagesChange(messages.filter((m) => !m.body.includes(`[Mail:${mail.id}]`)));
    } catch (error) {
      console.error('Fehler beim Löschen der Mail:', error);
      alert('Mail konnte nicht gelöscht werden.');
    } finally {
      setDeletingEntryId(null);
    }
  };

  const timeline = useMemo<TimelineEntry[]>(() => {
    const entries: TimelineEntry[] = [];

    for (const msg of messages) {
      const mailToken = msg.body.match(/\[Mail:([a-zA-Z0-9]+)\]/);
      if (mailToken && dedupedMails.some(m => m.id === mailToken[1])) {
        continue;
      }

      if (msg.isEmail) {
        entries.push({
          kind: 'mail-out',
          data: {
            id: msg.id,
            subject: null,
            fromName: msg.sender?.name || null,
            fromEmail: '',
            text: msg.body,
            html: null,
            date: msg.createdAt,
            folder: 'Sent',
            senderId: msg.sender?.id || null,
            attachments: [],
          },
          date: new Date(msg.createdAt),
        });
      } else {
        entries.push({ kind: 'message', data: msg, date: new Date(msg.createdAt) });
      }
    }

    for (const mail of dedupedMails) {
      const isOutgoing = mail.folder === 'Sent' || !!mail.senderId;
      entries.push({
        kind: isOutgoing ? 'mail-out' : 'mail-in',
        data: mail,
        date: new Date(mail.date),
      });
    }

    for (const task of localTasks) {
      entries.push({
        kind: 'task',
        data: task,
        date: new Date(task.createdAt),
      });
    }

    entries.sort((a, b) => a.date.getTime() - b.date.getTime());
    return entries;
  }, [messages, dedupedMails, localTasks]);

  const lastIncomingId = useMemo(() => {
    for (let i = timeline.length - 1; i >= 0; i--) {
      const e = timeline[i];
      if (e.kind === 'mail-in') return (e.data as MailEntry).id;
      if (e.kind === 'message' && (e.data as Message).senderType === 'customer') return (e.data as Message).id;
    }
    return null;
  }, [timeline]);

  const handleAcknowledge = async () => {
    try {
      await fetch(`/api/orders/${orderId}/acknowledge`, { method: 'POST' });
      setAcknowledged(true);
    } catch {}
  };

  const handleCompleteTask = async (taskId: string) => {
    try {
      const res = await fetch(`/api/orders/${orderId}/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'done' }),
      });
      if (res.ok) {
        const updated = localTasks.map(t =>
          t.id === taskId ? { ...t, status: 'done', completedAt: new Date().toISOString() } : t
        );
        setLocalTasks(updated);
        onTasksChange?.(updated);
      }
    } catch {}
  };

  useImperativeHandle(ref, () => ({
    attachPDF: (blob: Blob, filename: string) => {
      setAttachedPDF({ blob, filename });
    }
  }));

  const sendMessage = async () => {
    if (!newMessage.trim() || sending) return;

    if (sendMode === 'task') {
      if (!taskAssigneeId) {
        alert('Bitte einen Kollegen auswählen.');
        return;
      }
      setSending(true);
      try {
        const noteRefs: string[] = [];
        if (selectedImages.length > 0 && images) {
          for (const imgId of selectedImages) {
            const img = images.find((i) => i.id === imgId);
            if (!img?.path) continue;
            noteRefs.push(`🖼️ ${img.path}`);
          }
        }
        if (attachedPDF) {
          noteRefs.push(`📄 ${attachedPDF.filename}`);
        }
        const note = noteRefs.length > 0 ? '📎 Anhänge:\n' + noteRefs.join('\n') : undefined;

        const res = await fetch(`/api/orders/${orderId}/tasks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: newMessage.trim(), assigneeId: taskAssigneeId, note }),
        });
        if (res.ok) {
          const created: OrderTaskEntry = await res.json();
          const updated = [...localTasks, created];
          setLocalTasks(updated);
          onTasksChange?.(updated);
          setNewMessage('');
          setTaskAssigneeId('');
          setSelectedImages([]);
          setAttachedPDF(null);
        } else {
          let errorText = 'Unbekannter Fehler';
          try {
            const errorBody = await res.json();
            errorText = errorBody?.error || errorText;
          } catch { /* keine JSON-Antwort */ }
          alert(`Aufgabe konnte nicht erstellt werden: ${errorText}`);
        }
      } catch (error) {
        console.error('Fehler beim Erstellen der Aufgabe:', error);
        alert('Fehler beim Erstellen der Aufgabe');
      } finally {
        setSending(false);
      }
      return;
    }

    const isEmail = sendMode === 'email';

    if (isEmail && !window.confirm('Nachricht als E-Mail an den Kunden senden?')) {
      return;
    }

    setSending(true);
    try {
      let messageBody = newMessage.trim();
      const bodyRefs: string[] = [];
      // addToGallery nur bei frisch hochgeladenen Fotos: Bilder aus selectedImages
      // stammen aus der Galerie des Auftrags und kaemen sonst bei jedem Update
      // erneut hinein.
      const requestAttachments: { filename: string; content: string; contentType: string; addToGallery?: boolean }[] = [];

      if (selectedImages.length > 0 && images) {
        let imgIndex = 0;
        for (const id of selectedImages) {
          const img = images.find((i) => i.id === id);
          if (!img?.path) continue;
          imgIndex += 1;
          const filename = `bild-${imgIndex}.jpg`;
          if (img.path.startsWith('/api/attachments/') || (!img.path.startsWith('data:') && !img.path.startsWith('http') && !img.path.startsWith('blob:'))) {
            try {
              const src = img.path.startsWith('/') ? img.path : img.path;
              const compressed = await compressImageSource(src);
              requestAttachments.push({ filename, content: compressed.base64, contentType: compressed.contentType });
              bodyRefs.push(`🖼️ ${filename}`);
            } catch {
              bodyRefs.push(`🖼️ ${img.path}`);
            }
          } else if (img.path.startsWith('data:') || img.path.startsWith('blob:') || img.path.startsWith('http')) {
            try {
              const compressed = await compressImageSource(img.path);
              requestAttachments.push({ filename, content: compressed.base64, contentType: compressed.contentType });
              bodyRefs.push(`🖼️ ${filename}`);
            } catch {
              bodyRefs.push(`🖼️ ${img.path}`);
            }
          }
        }
      }

      if (uploadedPhotos.length > 0) {
        for (let i = 0; i < uploadedPhotos.length; i++) {
          const filename = `foto-${i + 1}.jpg`;
          try {
            const compressed = await compressImageFile(uploadedPhotos[i].file);
            requestAttachments.push({ filename, content: compressed.base64, contentType: compressed.contentType, addToGallery: true });
            bodyRefs.push(`🖼️ ${filename}`);
          } catch (error) {
            console.error('Foto konnte nicht verarbeitet werden:', error);
          }
        }
      }

      if (attachedPDF) {
        const buf = await attachedPDF.blob.arrayBuffer();
        const base64 = arrayBufferToBase64(buf);
        requestAttachments.push({ filename: attachedPDF.filename, content: base64, contentType: 'application/pdf' });
        bodyRefs.push(`📄 ${attachedPDF.filename}`);
      }

      if (bodyRefs.length > 0) {
        messageBody += '\n\n📎 Anhänge:\n' + bodyRefs.join('\n');
      }

      const payload: Record<string, unknown> = {
        body: messageBody,
        senderType: 'staff',
        senderId: currentUserId,
        sendEmail: isEmail && !!customerEmail,
      };
      if (requestAttachments.length > 0) {
        payload.attachments = requestAttachments;
      }

      const response = await fetch(`/api/orders/${orderId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const createdMessage = await response.json();
        onMessagesChange([...messages, createdMessage]);
        setNewMessage('');
        setSelectedImages([]);
        uploadedPhotos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
        setUploadedPhotos([]);
        setAttachedPDF(null);
        fetch(`/api/orders/${orderId}/acknowledge`, { method: 'POST' }).catch(() => {});
      } else {
        let errorText = 'Unbekannter Fehler';
        try {
          const errorBody = await response.json();
          errorText = errorBody?.error || errorText;
        } catch { /* keine JSON-Antwort */ }
        alert(
          isEmail
            ? `E-Mail konnte nicht gesendet werden: ${errorText}`
            : `Nachricht konnte nicht gespeichert werden: ${errorText}`
        );
      }
    } catch (error) {
      console.error('Fehler beim Senden:', error);
      alert('Fehler beim Senden der Nachricht');
    } finally {
      setSending(false);
    }
  };

  const optimizeText = async () => {
    if (!newMessage.trim() || optimizing) return;
    setOptimizing(true);
    try {
      const res = await fetch('/api/compose-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: newMessage, customerName, orderTitle, language: 'de' }),
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

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleString('de-DE', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  };

  const getDisplayBody = (message: Message): string => {
    let body = message.body;
    body = body.replace(/\n\n📎 Anhänge:\n[\s\S]*?(?=\n\n|$)/, '').replace(/\n$/, '').trim();
    return body.replace(/\s*\[Mail:[a-zA-Z0-9]+\]\s*$/, '').trim();
  };

  const getMessageAttachments = (message: Message) => {
    const result: Array<{ id: string; url: string; filename: string; mimeType: string | null; size?: number; isImage: boolean; isPdf: boolean }> = [];
    const mailMatch = message.body.match(/\[Mail:([a-zA-Z0-9]+)\]/);
    if (mailMatch && mails?.length) {
      const mail = mails.find((m) => m.id === mailMatch[1]);
      if (mail?.attachments?.length) {
        for (const a of mail.attachments) {
          const img = isImageFile(a.mimeType, a.filename);
          const pdf = isPdfFile(a.mimeType, a.filename);
          result.push({ id: a.id, url: `/api/attachments/${a.id}`, filename: a.filename, mimeType: a.mimeType, size: a.size, isImage: img, isPdf: pdf });
        }
      }
    }
    const anhangBlock = message.body.match(/📎 Anhänge:\n([\s\S]*?)(?=\n\n|$)/);
    if (anhangBlock) {
      const lines = anhangBlock[1].split('\n').filter(Boolean);
      for (const line of lines) {
        const imgMatch = line.match(/🖼️\s+(\S+)/);
        const pdfMatch = line.match(/📄\s+(.+)/);
        if (imgMatch) {
          const path = imgMatch[1];
          const id = path.startsWith('/api/') ? path.split('/').pop() || path : `path-${result.length}`;
          result.push({ id: `staff-img-${id}`, url: path, filename: path.startsWith('data:') ? 'Bild' : (path.split('/').pop() || 'Bild'), mimeType: 'image/jpeg', isImage: true, isPdf: false });
        } else if (pdfMatch) {
          result.push({ id: `staff-pdf-${pdfMatch[1]}`, url: '#', filename: pdfMatch[1].trim(), mimeType: 'application/pdf', isImage: false, isPdf: true });
        }
      }
    }
    return result;
  };

  function renderMailEntry(entry: TimelineEntry & { kind: 'mail-in' | 'mail-out' }) {
    const mail = entry.data;
    const isOut = entry.kind === 'mail-out';
    const fullText = mail.text || stripHtml(mail.html || '');
    const { newContent, quoted } = splitQuotedContent(fullText);
    const showQuoted = expandedQuotes.has(mail.id);
    const displayText = newContent || fullText;
    const expanded = expandedMails.has(mail.id);
    const preview = displayText.slice(0, 200);
    const isLong = displayText.length > 200;
    const hasAttachments = mail.attachments && mail.attachments.length > 0;

    return (
      <div
        key={`mail-${mail.id}`}
        className={`rounded-lg p-3 ${
          isOut
            ? 'bg-emerald-500/10 border border-emerald-500/20 ml-4'
            : 'bg-amber-500/10 border border-amber-500/20 mr-4'
        }`}
      >
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-2">
            <span className={`text-sm ${isOut ? 'text-emerald-400' : 'text-amber-400'}`}>
              {isOut ? '📤' : '📨'}
            </span>
            <span className="text-sm font-medium">
              {isOut ? 'Gesendet' : (mail.fromName || mail.fromEmail)}
            </span>
            <span className="text-xs text-slate-500">E-Mail</span>
          </div>
          <span className="text-xs text-slate-400">{formatDate(entry.date)}</span>
        </div>
        {mail.subject && (
          <div className="text-xs text-slate-400 mb-1">Betreff: {mail.subject}</div>
        )}
        <div className="text-sm text-slate-200 whitespace-pre-wrap">
          {expanded ? displayText : (preview + (isLong ? '…' : ''))}
        </div>
        {showQuoted && quoted && (
          <div className="mt-2 border-l-2 border-slate-600 pl-3 text-xs text-slate-400 whitespace-pre-wrap">
            {quoted}
          </div>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => deleteMailEntry(mail)}
            disabled={deletingEntryId === mail.id}
            className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
          >
            {deletingEntryId === mail.id ? 'Löscht…' : '🗑 Löschen'}
          </button>
          {isLong && (
            <button
              type="button"
              onClick={() => setExpandedMails((prev) => {
                const next = new Set(prev);
                if (next.has(mail.id)) next.delete(mail.id); else next.add(mail.id);
                return next;
              })}
              className="text-xs text-sky-400 hover:text-sky-300"
            >
              {expanded ? 'Weniger' : 'Mehr anzeigen'}
            </button>
          )}
          {quoted && (
            <button
              type="button"
              onClick={() => setExpandedQuotes((prev) => {
                const next = new Set(prev);
                if (next.has(mail.id)) next.delete(mail.id); else next.add(mail.id);
                return next;
              })}
              className="text-xs text-slate-500 hover:text-slate-300"
            >
              {showQuoted ? '▲ Zitat ausblenden' : '▼ Zitat anzeigen'}
            </button>
          )}
          {hasAttachments && (
            <div className="flex flex-wrap gap-1">
              {mail.attachments.map((a) => {
                const isImg = isImageFile(a.mimeType, a.filename);
                const isPdf = isPdfFile(a.mimeType, a.filename);
                const viewableInLightbox = isImg || isPdf;
                const viewableAtts = mail.attachments.filter((x) => isImageFile(x.mimeType, x.filename) || isPdfFile(x.mimeType, x.filename));
                const viewableIdx = viewableAtts.findIndex((x) => x.id === a.id);
                if (viewableInLightbox) {
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => {
                        setAttachmentLightbox({
                          images: viewableAtts.map((x) => ({
                            id: x.id,
                            url: `/api/attachments/${x.id}`,
                            filename: x.filename,
                            mimeType: x.mimeType,
                          })),
                          index: Math.max(0, viewableIdx),
                        });
                      }}
                      className={`group relative h-10 w-10 overflow-hidden rounded border border-slate-700 bg-slate-800 ${isPdf ? 'flex items-center justify-center' : ''}`}
                      title={a.filename}
                    >
                      {isImg ? (
                        <img src={`/api/attachments/${a.id}`} className="h-full w-full object-cover" alt={a.filename} />
                      ) : (
                        <span className="text-lg">📄</span>
                      )}
                    </button>
                  );
                }
                return (
                  <a
                    key={a.id}
                    href={`/api/attachments/${a.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 py-0.5 px-2 rounded border border-slate-700 bg-slate-800/50 text-xs text-slate-300 hover:bg-slate-800"
                  >
                    📎 {a.filename}
                  </a>
                );
              })}
            </div>
          )}
          {!isOut && mail.id === lastIncomingId && !acknowledged && (
            <button
              type="button"
              onClick={handleAcknowledge}
              className="ml-auto text-xs px-2.5 py-1 rounded-lg border border-emerald-600/40 bg-emerald-600/10 text-emerald-400 hover:bg-emerald-600/20 transition-colors"
            >
              ✓ Erledigt
            </button>
          )}
          {!isOut && mail.id === lastIncomingId && acknowledged && (
            <span className="ml-auto text-xs text-emerald-500/60 italic">Erledigt</span>
          )}
        </div>
      </div>
    );
  }

  function renderMessageEntry(entry: TimelineEntry & { kind: 'message' }) {
    const message = entry.data;
    const attachments = getMessageAttachments(message);
    const formatSize = (bytes?: number) =>
      bytes != null
        ? bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
        : '';

    return (
      <div
        key={`msg-${message.id}`}
        className={`rounded-lg border-dashed p-2.5 text-sm ${
          message.senderType === 'staff'
            ? 'bg-violet-500/5 border border-violet-500/25 ml-6'
            : 'bg-slate-700/20 border border-slate-600/40 mr-6'
        }`}
      >
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-1.5">
            <span className={`text-xs ${message.senderType === 'staff' ? 'text-violet-400' : 'text-slate-400'}`}>
              📝
            </span>
            <span className="text-xs font-medium text-slate-300">
              {message.senderType === 'staff' ? message.sender?.name || 'Mitarbeiter' : 'Kunde'}
            </span>
            <span className="text-[10px] text-slate-500 italic">Notiz</span>
          </div>
          <span className="text-[10px] text-slate-500">{formatDate(message.createdAt)}</span>
        </div>
        <div className="mb-1.5 flex justify-end">
          <button
            type="button"
            onClick={() => deleteInternalMessage(message)}
            disabled={deletingEntryId === message.id}
            className="text-[10px] text-red-400 hover:text-red-300 disabled:opacity-50"
          >
            {deletingEntryId === message.id ? 'Löscht…' : '🗑 Löschen'}
          </button>
        </div>
        <div className="text-xs text-slate-300 whitespace-pre-wrap">{getDisplayBody(message)}</div>
        {attachments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {attachments.map((a) => {
              const viewableInLightbox = (a.isImage || a.isPdf) && a.url && !a.url.startsWith('#');
              const viewableAtts = attachments.filter((x) => (x.isImage || x.isPdf) && x.url && !x.url.startsWith('#'));
              const viewableIdx = viewableAtts.findIndex((x) => x.id === a.id);
              if (viewableInLightbox) {
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => {
                      setAttachmentLightbox({
                        images: viewableAtts.map((x) => ({ id: x.id, url: x.url, filename: x.filename, mimeType: x.mimeType })),
                        index: Math.max(0, viewableIdx),
                      });
                    }}
                    className={`group relative h-8 w-8 overflow-hidden rounded border border-slate-700 bg-slate-800 hover:border-emerald-500/60 ${a.isPdf ? 'flex items-center justify-center' : ''}`}
                    title={a.filename}
                  >
                    {a.isImage ? (
                      <img src={a.url} className="h-full w-full object-cover" alt={a.filename} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    ) : (
                      <span className="text-sm">📄</span>
                    )}
                  </button>
                );
              }
              return a.url.startsWith('/api/') ? (
                <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 py-0.5 px-2 rounded border border-slate-700 bg-slate-800/50 text-xs text-slate-300 hover:bg-slate-800">
                  📄 {a.filename} {a.size != null ? <span className="text-slate-500">{formatSize(a.size)}</span> : null}
                </a>
              ) : (
                <span key={a.id} className="inline-flex items-center gap-1 py-0.5 px-2 rounded border border-slate-700 bg-slate-800/50 text-xs text-slate-300">
                  📄 {a.filename} {a.size != null ? <span className="text-slate-500">{formatSize(a.size)}</span> : null}
                </span>
              );
            })}
          </div>
        )}
        {message.senderType === 'customer' && message.id === lastIncomingId && !acknowledged && (
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={handleAcknowledge}
              className="text-xs px-2.5 py-1 rounded-lg border border-emerald-600/40 bg-emerald-600/10 text-emerald-400 hover:bg-emerald-600/20 transition-colors"
            >
              ✓ Erledigt
            </button>
          </div>
        )}
        {message.senderType === 'customer' && message.id === lastIncomingId && acknowledged && (
          <div className="mt-2 flex justify-end">
            <span className="text-xs text-emerald-500/60 italic">Erledigt</span>
          </div>
        )}
      </div>
    );
  }

  function parseTaskAttachments(note: string | null) {
    if (!note) return { text: '', attachments: [] as { type: 'image' | 'pdf'; path: string; filename: string }[] };
    const lines = note.split('\n');
    const textLines: string[] = [];
    const attachments: { type: 'image' | 'pdf'; path: string; filename: string }[] = [];
    let inAttachBlock = false;
    for (const line of lines) {
      if (line.startsWith('📎 Anhänge:')) { inAttachBlock = true; continue; }
      if (inAttachBlock) {
        const imgMatch = line.match(/🖼️\s+(\S+)/);
        const pdfMatch = line.match(/📄\s+(.+)/);
        if (imgMatch) {
          const path = imgMatch[1];
          attachments.push({ type: 'image', path, filename: path.split('/').pop() || 'Bild' });
        } else if (pdfMatch) {
          attachments.push({ type: 'pdf', path: '#', filename: pdfMatch[1].trim() });
        }
      } else {
        textLines.push(line);
      }
    }
    return { text: textLines.join('\n').trim(), attachments };
  }

  function renderTaskEntry(entry: TimelineEntry & { kind: 'task' }) {
    const task = entry.data;
    const isDone = task.status === 'done';
    const canComplete = !isDone && task.assignee.id === currentUserId;
    const { text: noteText, attachments: taskAttachments } = parseTaskAttachments(task.note);

    return (
      <div
        key={`task-${task.id}`}
        className={`rounded-lg border p-3 ${
          isDone
            ? 'bg-slate-800/30 border-slate-700/50'
            : 'bg-orange-500/10 border-orange-500/25'
        }`}
      >
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-2">
            <span className="text-sm">{isDone ? '✅' : '📋'}</span>
            <span className="text-sm font-medium text-orange-300">Aufgabe</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
              isDone ? 'bg-emerald-600/20 text-emerald-400' : 'bg-orange-600/20 text-orange-400'
            }`}>
              {isDone ? 'Erledigt' : 'Offen'}
            </span>
          </div>
          <span className="text-xs text-slate-400">{formatDate(new Date(task.createdAt))}</span>
        </div>
        <div className="text-sm text-slate-200">{task.title}</div>
        {noteText && <div className="text-xs text-slate-400 mt-1">{noteText}</div>}
        {taskAttachments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {taskAttachments.map((a, i) => {
              const viewableAtts = taskAttachments.filter(x => (x.type === 'image' || x.type === 'pdf') && x.path && !x.path.startsWith('#'));
              const viewableIdx = viewableAtts.findIndex(x => x.path === a.path);
              const viewable = (a.type === 'image' || a.type === 'pdf') && a.path && !a.path.startsWith('#');
              return viewable ? (
                <button
                  key={`task-att-${i}`}
                  type="button"
                  onClick={() => {
                    setAttachmentLightbox({
                      images: viewableAtts.map(x => ({ id: x.path, url: x.path, filename: x.filename, mimeType: x.type === 'pdf' ? 'application/pdf' : 'image/jpeg' })),
                      index: Math.max(0, viewableIdx),
                    });
                  }}
                  className={`group relative h-10 w-10 overflow-hidden rounded border border-slate-700 bg-slate-800 hover:border-orange-500/60 ${a.type === 'pdf' ? 'flex items-center justify-center' : ''}`}
                  title={a.filename}
                >
                  {a.type === 'image' ? (
                  <img src={a.path} className="h-full w-full object-cover" alt={a.filename} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                ) : (
                  <span className="text-lg">📄</span>
                )}
                </button>
              ) : (
                <span key={`task-att-${i}`} className="inline-flex items-center gap-1 py-0.5 px-2 rounded border border-slate-700 bg-slate-800/50 text-xs text-slate-300">
                  📄 {a.filename}
                </span>
              );
            })}
          </div>
        )}
        <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
          <span>Von {task.creator.name} → {task.assignee.name}</span>
          {canComplete && (
            <button
              type="button"
              onClick={() => handleCompleteTask(task.id)}
              className="px-2.5 py-1 rounded-lg border border-emerald-600/40 bg-emerald-600/10 text-emerald-400 hover:bg-emerald-600/20 transition-colors"
            >
              ✓ Erledigt
            </button>
          )}
          {isDone && task.completedAt && (
            <span className="text-emerald-500/60 italic">
              Erledigt am {formatDate(new Date(task.completedAt))}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Legende */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 px-1">
        <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-amber-400" /> Eingehende Mail</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-emerald-400" /> Gesendete Mail</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded border border-dashed border-violet-400" /> Interne Notiz</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-orange-400" /> Aufgabe</span>
      </div>

      {/* Offene Aufgaben */}
      {localTasks.filter(t => t.status === 'open').length > 0 && (
        <div className="rounded-lg border border-orange-500/30 bg-orange-500/5 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm">📋</span>
            <span className="text-sm font-semibold text-orange-300">Offene Aufgaben</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-600/20 text-orange-400 border border-orange-600/30">
              {localTasks.filter(t => t.status === 'open').length}
            </span>
          </div>
          {localTasks.filter(t => t.status === 'open').map(task => {
            const { text: noteText, attachments: att } = parseTaskAttachments(task.note);
            const canComplete = task.assignee.id === currentUserId;
            return (
              <div key={`open-${task.id}`} className="flex items-start justify-between gap-2 rounded border border-slate-700/40 bg-slate-900/40 p-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-slate-200">{task.title}</div>
                  {noteText && <div className="text-xs text-slate-400 mt-0.5">{noteText}</div>}
                  {att.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {att.map((a, i) => {
                        const viewableAtts = att.filter(x => (x.type === 'image' || x.type === 'pdf') && x.path && !x.path.startsWith('#'));
                        const viewableIdx = viewableAtts.findIndex(x => x.path === a.path);
                        const viewable = (a.type === 'image' || a.type === 'pdf') && a.path && !a.path.startsWith('#');
                        return viewable ? (
                          <button
                            key={`ot-att-${i}`}
                            type="button"
                            onClick={() => {
                              setAttachmentLightbox({
                                images: viewableAtts.map(x => ({ id: x.path, url: x.path, filename: x.filename, mimeType: x.type === 'pdf' ? 'application/pdf' : 'image/jpeg' })),
                                index: Math.max(0, viewableIdx),
                              });
                            }}
                            className={`h-8 w-8 overflow-hidden rounded border border-slate-700 bg-slate-800 ${a.type === 'pdf' ? 'flex items-center justify-center' : ''}`}
                            title={a.filename}
                          >
                            {a.type === 'image' ? (
                              <img src={a.path} className="h-full w-full object-cover" alt={a.filename} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                            ) : (
                              <span className="text-sm">📄</span>
                            )}
                          </button>
                        ) : (
                          <span key={`ot-att-${i}`} className="text-xs text-slate-400">📄 {a.filename}</span>
                        );
                      })}
                    </div>
                  )}
                  <div className="text-[10px] text-slate-500 mt-1">
                    Von {task.creator.name} → {task.assignee.name} · {formatDate(new Date(task.createdAt))}
                  </div>
                </div>
                {canComplete && (
                  <button
                    type="button"
                    onClick={() => handleCompleteTask(task.id)}
                    className="flex-shrink-0 text-xs px-2 py-1 rounded-lg border border-emerald-600/40 bg-emerald-600/10 text-emerald-400 hover:bg-emerald-600/20 transition-colors"
                  >
                    ✓ Erledigt
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Timeline */}
      <div className="space-y-3 max-h-[32rem] overflow-y-auto">
        {timeline.length === 0 ? (
          <div className="text-slate-500 text-sm text-center py-4">
            Noch keine Kommunikation
          </div>
        ) : (
          timeline.map((entry) => {
            if (entry.kind === 'message') return renderMessageEntry(entry as TimelineEntry & { kind: 'message' });
            if (entry.kind === 'task') return renderTaskEntry(entry as TimelineEntry & { kind: 'task' });
            return renderMailEntry(entry as TimelineEntry & { kind: 'mail-in' | 'mail-out' });
          })
        )}
      </div>

      {/* Compose */}
      <div className="rounded-lg border border-slate-700 p-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">Neue Nachricht</div>
          <div className="flex items-center gap-1 rounded-lg border border-slate-700 overflow-hidden">
            <button
              type="button"
              onClick={() => setSendMode('internal')}
              className={`px-3 py-1.5 text-xs transition-colors ${sendMode === 'internal' ? 'bg-sky-600 text-white' : 'bg-slate-900 text-slate-300 hover:bg-slate-800'}`}
            >
              Interne Notiz
            </button>
            <button
              type="button"
              onClick={() => setSendMode('email')}
              className={`px-3 py-1.5 text-xs transition-colors ${sendMode === 'email' ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-slate-300 hover:bg-slate-800'}`}
            >
              E-Mail an Kunde
            </button>
            {users && users.length > 0 && (
              <button
                type="button"
                onClick={() => setSendMode('task')}
                className={`px-3 py-1.5 text-xs transition-colors ${sendMode === 'task' ? 'bg-orange-600 text-white' : 'bg-slate-900 text-slate-300 hover:bg-slate-800'}`}
              >
                Aufgabe
              </button>
            )}
          </div>
        </div>

        {sendMode === 'task' && users && users.length > 0 && (
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-400">Zuweisen an:</label>
            <select
              value={taskAssigneeId}
              onChange={(e) => setTaskAssigneeId(e.target.value)}
              className="flex-1 rounded bg-slate-950 border border-slate-700 px-2 py-1.5 text-sm"
            >
              <option value="">Kollege wählen…</option>
              {users.filter(u => u.id !== currentUserId).map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
        )}

        {sendMode === 'email' && !customerEmail && (
          <div className="text-xs text-amber-400 bg-amber-400/10 rounded px-2 py-1">
            Kein Kunden-E-Mail hinterlegt. Nachricht kann nur intern gespeichert werden.
          </div>
        )}

        {/* Bilder lassen sich auch direkt auf das Textfeld ziehen. */}
        <div
          className="relative"
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes('Files')) return;
            e.preventDefault();
            setPhotoDragOver(true);
          }}
          onDragLeave={(e) => {
            // Nur zuruecksetzen, wenn der Zeiger den Bereich wirklich verlaesst,
            // nicht beim Wechsel auf ein Kindelement.
            if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
            setPhotoDragOver(false);
          }}
          onDrop={(e) => {
            if (!e.dataTransfer.types.includes('Files')) return;
            e.preventDefault();
            setPhotoDragOver(false);
            addPhotoFiles(e.dataTransfer.files);
          }}
        >
          <textarea
            placeholder={sendMode === 'task' ? 'Aufgabenbeschreibung…' : sendMode === 'internal' ? 'Interne Notiz (nur für Team sichtbar)…' : 'Nachricht an Kunden…'}
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (newMessage.trim()) sendMessage(); }
            }}
            className={`w-full rounded bg-slate-950 border px-3 py-2 text-sm resize-none transition-colors ${photoDragOver ? 'border-sky-500' : 'border-slate-700'}`}
            rows={3}
          />
          {photoDragOver && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded bg-sky-950/70 text-sm text-sky-200">
              Bilder hier ablegen
            </div>
          )}
        </div>
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2 flex-wrap">
            <VoiceInputButton
              onTranscript={(text) => setNewMessage((prev) => { const sep = prev.trim() ? '\n' : ''; return prev + sep + text; })}
              language="de"
              disabled={sending}
            />
            {sendMode === 'email' && (
              <>
                {/* Natives Label statt JS-Klick: oeffnet den Dateidialog zuverlaessig.
                    Bewusst OHNE `capture`: das wuerde am Handy direkt die Kamera
                    erzwingen, die Auswahl aus der Galerie verhindern und `multiple`
                    aushebeln. Ohne capture fragt das Handy "Kamera oder Galerie?" —
                    und aus der Galerie lassen sich mehrere Bilder auf einmal waehlen. */}
                <label
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-all bg-slate-700 text-slate-200 ${sending ? 'opacity-50 pointer-events-none' : 'cursor-pointer hover:bg-slate-600'}`}
                  title="Fotos aufnehmen oder aus der Galerie/vom Rechner auswählen (mehrere möglich)"
                >
                  📷 Foto
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    disabled={sending}
                    className="sr-only"
                    onChange={(e) => {
                      addPhotoFiles(e.target.files);
                      if (photoInputRef.current) photoInputRef.current.value = '';
                    }}
                  />
                </label>
                <button
                  onClick={() => {
                    const staffFull = users?.find(u => u.id === currentUserId)?.name || 'Dein Ansprechpartner';
                    const staffFirst = staffFull.split(' ')[0];
                    const custFirst = (customerName || 'du').split(' ')[0];
                    // Ohne "Bei Fragen melde dich gerne" - bewusst keine Einladung
                    // zu Rueckfragen, die wir nicht bedienen wollen.
                    const defaultTpl = 'Hallo {kundenname},\n\nhier ein kurzes Update zu deinem Auftrag.\n\n\n\nViele Grüße\n{mitarbeiter}';
                    const tpl = (typeof window !== 'undefined' && localStorage.getItem('update-template')) || defaultTpl;
                    const text = tpl.replace(/\{kundenname\}/g, custFirst).replace(/\{mitarbeiter\}/g, staffFirst);
                    setNewMessage(text);
                  }}
                  disabled={sending}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-all bg-sky-700 hover:bg-sky-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Update-Nachricht an Kunden generieren"
                >
                  📝 Update
                </button>
                <button
                  onClick={optimizeText}
                  disabled={!newMessage.trim() || optimizing || sending}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-all bg-purple-700 hover:bg-purple-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Text via N8N optimieren"
                >
                  {optimizing ? <><span>⏳</span> Optimiere…</> : <><span>✨</span> Optimieren</>}
                </button>
              </>
            )}
            <div className="text-xs text-slate-500">{newMessage.length}/500</div>
            {selectedImages.length > 0 && (
              <div className="text-xs bg-sky-600 text-white px-2 py-0.5 rounded">{selectedImages.length} Bild(er)</div>
            )}
            {uploadedPhotos.map((p, idx) => (
              <div key={p.previewUrl} className="relative">
                <img src={p.previewUrl} alt={`Foto ${idx + 1}`} className="h-8 w-8 rounded object-cover border border-slate-600" />
                <button
                  onClick={() => {
                    setUploadedPhotos((prev) => {
                      const next = [...prev];
                      const [removed] = next.splice(idx, 1);
                      if (removed) URL.revokeObjectURL(removed.previewUrl);
                      return next;
                    });
                  }}
                  className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-600 text-white text-[10px] leading-4"
                  title="Foto entfernen"
                >
                  ×
                </button>
              </div>
            ))}
            {attachedPDF && (
              <div className="flex items-center gap-2 text-xs bg-green-600 text-white px-2 py-0.5 rounded">
                <span>📄 {attachedPDF.filename}</span>
                <button onClick={() => setAttachedPDF(null)} className="hover:bg-green-700 px-1 rounded" title="PDF entfernen">×</button>
              </div>
            )}
          </div>
          <button
            onClick={sendMessage}
            disabled={sending || !newMessage.trim() || newMessage.length > 500 || (sendMode === 'email' && !customerEmail) || (sendMode === 'task' && !taskAssigneeId)}
            className={`rounded px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${
              sendMode === 'email'
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                : sendMode === 'task'
                  ? 'bg-orange-600 hover:bg-orange-500 text-white'
                  : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
            }`}
          >
            {sending ? 'Sendet…' : sendMode === 'task' ? 'Aufgabe erstellen' : sendMode === 'email' ? 'E-Mail senden' : 'Notiz speichern'}
          </button>
        </div>
      </div>

      {/* Bild-Anhänge & PDF */}
      {(dedupedSelectableImages.length > 0) || (specs && specs.length > 0) ? (
        <div className="rounded-lg border border-slate-700 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">📎 Dateien als Anhang hinzufügen</div>
            {selectedImages.length > 0 && (
              <div className="flex items-center gap-2">
                {onImagesChange && (
                  <button
                    onClick={deleteSelectedImages}
                    disabled={deletingImages}
                    className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
                  >
                    {deletingImages ? 'Lösche…' : `🗑 ${selectedImages.length} löschen`}
                  </button>
                )}
                <button onClick={() => setSelectedImages([])} className="text-xs text-slate-400 hover:text-slate-300">Auswahl zurücksetzen</button>
              </div>
            )}
          </div>
          {dedupedSelectableImages.length > 0 && (
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2 max-h-40 overflow-y-auto">
              {dedupedSelectableImages.map((img, idx) => {
                const nonImage = isNonImageFile(img.path, img.comment);
                const icon = nonImage ? getFileIconForPath(img.comment || img.path) : null;
                const selected = selectedImages.includes(img.id);
                return (
                  <div key={img.id} className="relative group">
                    {nonImage ? (
                      <div
                        className={`w-full h-16 flex flex-col items-center justify-center rounded cursor-pointer border-2 transition-colors bg-slate-800 ${
                          selected ? 'border-sky-500 shadow-lg shadow-sky-500/25' : 'border-slate-600 hover:border-slate-400'
                        }`}
                        title={img.comment || 'Datei als Anhang auswählen'}
                        onClick={() => setSelectedImages(prev => prev.includes(img.id) ? prev.filter(id => id !== img.id) : [...prev, img.id])}
                      >
                        <span className="text-xl">{icon}</span>
                        <span className="text-[9px] text-slate-400 truncate max-w-full px-1">
                          {(img.comment || '').replace('Mail-Anhang: ', '').replace('Hochgeladen: ', '').split('/').pop()?.slice(0, 12)}
                        </span>
                      </div>
                    ) : (
                      <img
                        src={img.path}
                        alt={img.comment || 'Bild als Anhang auswählen'}
                        className={`w-full h-16 object-cover rounded cursor-pointer border-2 transition-colors ${
                          selected ? 'border-sky-500 shadow-lg shadow-sky-500/25' : 'border-slate-600 hover:border-slate-400'
                        }`}
                        title={img.comment || 'Bild als Anhang auswählen'}
                        onClick={() => setSelectedImages(prev => prev.includes(img.id) ? prev.filter(id => id !== img.id) : [...prev, img.id])}
                      />
                    )}
                    <button
                      type="button"
                      className="absolute top-0.5 right-0.5 p-1 rounded bg-black/50 hover:bg-black/70 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Im Vollbild ansehen"
                      onClick={(e) => {
                        e.stopPropagation();
                        setImagePickerLightbox({ index: idx });
                      }}
                    >
                      🔍
                    </button>
                    {selected && (
                      <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-sky-600 rounded-full flex items-center justify-center">
                        <span className="text-white text-xs">✓</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {specs && specs.length > 0 && orderTitle && orderType && customerName && activeCategories && (
            <div className="border-t border-slate-600 pt-3">
              <div className="text-sm font-medium mb-3">📄 Datenblatt-PDF</div>
              <DatasheetPDFGenerator
                orderId={orderId}
                orderTitle={orderTitle}
                orderType={orderType}
                customerName={customerName}
                specs={specs}
                activeCategories={activeCategories}
                assigneeName={undefined}
                finalAmount={undefined}
                attachImages={dedupedSelectableImages.filter(img => selectedImages.includes(img.id)).map(img => ({ id: img.id, path: img.path, comment: img.comment, position: img.position })) || []}
                buttonText="📧 Datenblatt-PDF anhängen"
                stringCount={specs.find(s => s.key === 'string_count')?.value || '–'}
                onPDFGenerated={(pdfBlob, filename) => setAttachedPDF({ blob: pdfBlob, filename })}
              />
            </div>
          )}
          <div className="text-xs text-slate-500">
            Klicke auf Bilder, um sie als Anhang auszuwählen.
            {images && images.length > dedupedSelectableImages.length
              ? ` (${images.length - dedupedSelectableImages.length} Duplikate ausgeblendet)`
              : ''}
          </div>
        </div>
      ) : null}

      {/* Lightbox (Mail/Task-Anhänge) */}
      {attachmentLightbox && attachmentLightbox.images.length > 0 && (
        <ImageCarouselModal
          images={attachmentLightbox.images.map((a, i) => ({ id: a.id, path: a.url, comment: a.filename, position: i, attach: false, scope: 'attachment', mimeType: a.mimeType || undefined, filename: a.filename }))}
          index={Math.min(attachmentLightbox.index, attachmentLightbox.images.length - 1)}
          scopes={[]}
          onClose={() => setAttachmentLightbox(null)}
          onUpdate={async () => {}}
          onDelete={async () => {}}
        />
      )}

      {/* Lightbox Picker (Bilder als Anhang auswählen) */}
      {imagePickerLightbox !== null && dedupedSelectableImages.length > 0 && (
        <ImageCarouselModal
          images={dedupedSelectableImages.map((img, i) => ({
            id: img.id,
            path: img.path,
            comment: img.comment,
            position: i,
            attach: selectedImages.includes(img.id),
            scope: undefined,
          }))}
          index={Math.min(imagePickerLightbox.index, dedupedSelectableImages.length - 1)}
          scopes={[]}
          pickerMode
          onClose={() => setImagePickerLightbox(null)}
          onUpdate={async (id, patch) => {
            if ('attach' in patch) {
              setSelectedImages(prev =>
                patch.attach ? [...prev, id] : prev.filter(x => x !== id)
              );
            }
          }}
          onDelete={async () => {}}
        />
      )}
    </div>
  );
});

export default MessageSystem;
