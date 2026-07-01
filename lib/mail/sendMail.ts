import { getDefaultAccount } from './account';

export type SendMailArgs = {
  to: string;
  cc?: string[];
  bcc?: string[];
  subject: string;
  text: string;
  html?: string;
  attachments?: Array<{ filename: string; path?: string; content?: Buffer | string; contentType?: string | null }>;
  inReplyTo?: string | null;
  accountId?: string;
};

export async function sendMail(args: SendMailArgs): Promise<{ messageId: string; mode: 'sent' | 'dry-run' }> {
  let host: string | undefined;
  let port: number | undefined;
  let user: string | undefined;
  let pass: string | undefined;
  let from: string | undefined;

  const account = await getDefaultAccount();
  if (account?.smtpHost && account?.smtpUser && account?.smtpPass) {
    host = account.smtpHost;
    port = account.smtpPort || 587;
    user = account.smtpUser;
    pass = account.smtpPass;
    from = account.email || user;
  } else if (process.env.MAIL_HOST && process.env.MAIL_USER && process.env.MAIL_PASS) {
    host = process.env.MAIL_HOST;
    port = process.env.MAIL_PORT ? parseInt(process.env.MAIL_PORT, 10) : 587;
    user = process.env.MAIL_USER;
    pass = process.env.MAIL_PASS;
    from = process.env.MAIL_FROM || user;
  }

  if (!host || !port || !user || !pass || !from) {
    console.warn('SMTP not configured – dry run (neither MailAccount nor env vars found)');
    return { messageId: `dry-${Date.now()}`, mode: 'dry-run' };
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
    html: args.html,
    inReplyTo: args.inReplyTo || undefined,
    references: args.inReplyTo ? [args.inReplyTo] : undefined,
    attachments: args.attachments?.map(a => ({ filename: a.filename, content: a.content, contentType: a.contentType || undefined, path: a.path })),
  });

  return { messageId: info?.messageId || '', mode: 'sent' };
}
