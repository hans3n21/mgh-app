// Anhangsinhalt serverseitig laden — egal ob schon persistiert oder noch nur
// als IMAP-Referenz vorhanden. Nicht persistierte Anhaenge werden dabei einmal
// heruntergeladen und gespeichert, damit spaetere Zugriffe (Vorschau, erneuter
// Import) sofort bedient werden.
import { loadAttachmentForEmail, persistAttachment } from './attachments';

export type LoadedAttachment = {
  filename: string;
  content: Buffer;
  contentType: string;
};

export async function loadAttachmentBytes(attachmentId: string): Promise<LoadedAttachment | null> {
  // No-op, wenn bereits persistiert. Holt sonst per IMAP nach und speichert.
  await persistAttachment(attachmentId);
  return loadAttachmentForEmail(attachmentId);
}
