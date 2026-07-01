export type Attachment = {
	id: string;
	filename: string;
	mimeType: string | null;
	url: string;
	cid?: string | null;
	size?: number;
};

export type Message = {
	id: string;
	subject: string;
	fromName: string;
	fromEmail: string;
	accountId?: string | null;
	accountLabel?: string | null;
	toName?: string | null;
	toEmail?: string | null;
	folder?: string | null;
	createdAt: string; // ISO string
	hasAttachments: boolean;
	attachmentsCount: number;
	attachments?: Attachment[];
	lang: 'DE' | 'EN';
	assignedTo?: string | null;
	isRead: boolean;
	snippet: string;
	text?: string | null;
	html?: string;
	threadId?: string;
	leadId?: string | null;
	starred?: boolean;
	tags?: string[];
	threadCount?: number;
	threadHasUnread?: boolean;
	orderId?: string | null;
	detailLoaded?: boolean;
};

export type InboxFilter = 'all' | 'assigned' | 'unassigned' | 'with_attachments' | 'unread' | 'with_order';

// Folder is now a free string (raw IMAP path, e.g. "INBOX", "Sent", "[Gmail]/All Mail")
export type InboxFolder = string;
