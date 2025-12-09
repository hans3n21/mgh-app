import type { Attachment, Mail } from '@prisma/client';
import type { ParsedData } from './parseMail';

export type OrderTypeKey =
  | 'GUITAR'
  | 'BODY'
  | 'NECK'
  | 'REPAIR'
  | 'PICKGUARD'
  | 'PICKUPS'
  | 'ENGRAVING'
  | 'FINISH_ONLY';

export type OrderTypeSuggestion = { key: OrderTypeKey; score: number; reasons: string[] };

function textFromMail(mail: Pick<Mail, 'subject' | 'text' | 'html'> & { attachmentsNames?: string[] }): string {
  const parts = [mail.subject || '', mail.text || '', typeof mail.html === 'string' ? mail.html : '', ...(mail.attachmentsNames || [])];
  return parts.join('\n').toLowerCase();
}

function scoreIf(re: RegExp, text: string, add: number, reason: string, acc: { score: number; reasons: string[] }) {
  if (re.test(text)) {
    acc.score += add;
    acc.reasons.push(reason);
  }
}

function attachmentHints(attachments: Pick<Attachment, 'mimeType' | 'filename'>[] | undefined): string[] {
  if (!attachments || attachments.length === 0) return [];
  const out: string[] = [];
  for (const a of attachments) {
    const mime = (a.mimeType || '').toLowerCase();
    const name = (a.filename || '').toLowerCase();
    if (/(svg|eps|ai|dxf)$/.test(name) || /svg\+xml/.test(mime) || /vnd\.dxf/.test(mime)) out.push('vector');
    if (/pdf/.test(mime) || name.endsWith('.pdf')) out.push('pdf');
    if (/image\//.test(mime)) out.push('image');
  }
  return out;
}

export function suggestOrderTypes(mail: Pick<Mail, 'subject' | 'text' | 'html'> & { attachments?: Pick<Attachment, 'mimeType' | 'filename'>[] }, parsedData: ParsedData): OrderTypeSuggestion[] {
  const text = textFromMail({ ...mail, attachmentsNames: (mail.attachments || []).map(a => a.filename || '') });
  const hints = attachmentHints(mail.attachments);
  const pd = parsedData || {};

  const base: Record<OrderTypeKey, { score: number; reasons: string[] }> = {
    GUITAR: { score: 0, reasons: [] },
    BODY: { score: 0, reasons: [] },
    NECK: { score: 0, reasons: [] },
    REPAIR: { score: 0, reasons: [] },
    PICKGUARD: { score: 0, reasons: [] },
    PICKUPS: { score: 0, reasons: [] },
    ENGRAVING: { score: 0, reasons: [] },
    FINISH_ONLY: { score: 0, reasons: [] },
  };

  // ParsedData instrumentType → starker Hinweis
  const it = String(pd.instrumentType || '').toLowerCase();
  if (it) {
    const map: Record<string, OrderTypeKey> = {
      guitar: 'GUITAR',
      bass: 'GUITAR',
      neck: 'NECK',
      body: 'BODY',
      pickup: 'PICKUPS',
      pickguard: 'PICKGUARD',
      laser: 'ENGRAVING',
      repair: 'REPAIR',
    };
    const key = map[it];
    if (key) {
      base[key].score += 3;
      base[key].reasons.push(`instrumentType=${it}`);
    }
  }

  // Schlüsselwörter im Text/Betreff
  scoreIf(/\b(repair|reparatur|bruch|riss)\b/i, text, 2, 'keyword:repair', base.REPAIR);
  scoreIf(/\b(neck|hals|headstock)\b/i, text, 2, 'keyword:neck', base.NECK);
  scoreIf(/\b(body|korpus)\b/i, text, 2, 'keyword:body', base.BODY);
  scoreIf(/\b(pickguard|schlagbrett)\b/i, text, 2, 'keyword:pickguard', base.PICKGUARD);
  scoreIf(/\b(pickup|humbucker|single\s*coil)\b/i, text, 2, 'keyword:pickup', base.PICKUPS);
  scoreIf(/\b(engrave|engraving|gravur|laser)\b/i, text, 2, 'keyword:engraving', base.ENGRAVING);
  scoreIf(/\b(gitarre|guitar|tele|strat|les\s*paul|sg|bass)\b/i, text, 1.5, 'keyword:guitar', base.GUITAR);
  scoreIf(/\b(lack|lackierung|finish|nitro|poly)\b/i, text, 1.5, 'keyword:finish', base.FINISH_ONLY);

  // Attachments-Hinweise
  if (hints.includes('vector')) {
    base.ENGRAVING.score += 1.0;
    base.ENGRAVING.reasons.push('attachment:vector');
  }
  if (hints.includes('pdf')) {
    base.GUITAR.score += 0.2;
    base.PICKGUARD.score += 0.2;
    base.PICKUPS.score += 0.2;
  }
  if (hints.includes('image')) {
    base.FINISH_ONLY.score += 0.3;
  }

  // Lackspezifisches + Gitarre → Finish-Only leicht bevorteilen
  if (base.FINISH_ONLY.score > 0 && base.GUITAR.score > 0) base.FINISH_ONLY.score += 0.5;

  const out: OrderTypeSuggestion[] = Object.entries(base)
    .map(([key, v]) => ({ key: key as OrderTypeKey, score: Number(v.score.toFixed(3)), reasons: v.reasons }))
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));

  // Fallback, wenn gar nichts erkannt wurde
  if (out.length === 0) return [{ key: 'GUITAR', score: 0.1, reasons: ['fallback'] }];
  return out.slice(0, 5);
}

export default suggestOrderTypes;


