export type Attachment = {
	id: string;
	filename: string;
	mimeType: string | null;
	url: string;
};

export type Message = {
	id: string;
	subject: string;
	fromName: string;
	fromEmail: string;
	createdAt: string; // ISO string
	hasAttachments: boolean;
	attachmentsCount: number;
	attachments?: Attachment[];
	lang: 'DE' | 'EN';
	assignedTo?: string | null;
	isRead: boolean;
	snippet: string;
	html?: string;
	threadId?: string;
	leadId?: string | null;
	starred?: boolean;
	tags?: string[];
};

export type InboxFilter = 'all' | 'assigned' | 'unassigned' | 'with_attachments';

