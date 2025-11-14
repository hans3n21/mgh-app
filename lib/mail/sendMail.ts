export type SendMailArgs = {
  to: string;
  cc?: string[];
  bcc?: string[];
  subject: string;
  text: string;
  html?: string; // HTML-Version der E-Mail
  attachments?: Array<{ filename: string; path?: string; content?: Buffer | string; contentType?: string | null }>;
  inReplyTo?: string | null; // optional für Threading
};

export async function sendMail(args: SendMailArgs): Promise<{ messageId: string }> {
  const host = process.env.MAIL_HOST;
  const port = process.env.MAIL_PORT ? parseInt(process.env.MAIL_PORT, 10) : undefined;
  const user = process.env.MAIL_USER;
  const pass = process.env.MAIL_PASS;
  const from = process.env.MAIL_FROM || user || '';

  if (!host || !port || !user || !pass || !from) {
    console.warn('SMTP not configured – dry run');
    return { messageId: `dry-${Date.now()}` };
  }

  const nodemailer = await import('nodemailer');
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  const info = await transporter.sendMail({
    from,
    to: args.to,
    cc: args.cc,
    bcc: args.bcc,
    subject: args.subject,
    text: args.text,
    html: args.html, // HTML-Version hinzufügen
    inReplyTo: args.inReplyTo || undefined,
    references: args.inReplyTo ? [args.inReplyTo] : undefined,
    attachments: args.attachments?.map(a => ({ filename: a.filename, content: a.content, contentType: a.contentType || undefined, path: a.path }))
  });

  return { messageId: info?.messageId || '' };
}


