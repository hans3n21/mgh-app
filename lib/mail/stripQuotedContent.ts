/**
 * Strips quoted email history from plain text.
 *
 * Email chains typically carry the full previous conversation inline.
 * This accumulates PII from multiple senders/messages in a single record.
 * We strip that history before PII extraction so each mail only exposes
 * its own new content.
 *
 * Display (in the UI) still uses the full original text — only the
 * PII-extraction / AI pipeline gets the stripped version.
 */

// Regex patterns that mark the start of quoted content.
// Order matters: more specific patterns first.
const QUOTE_STARTERS = [
  // "> " line prefix (standard quoting, any RFC-compliant client)
  /^>+\s/m,

  // Gmail/Thunderbird English: "On Mon, 1 Jan 2024 at 12:00, Name <email> wrote:"
  /^On .{5,100} wrote:\s*$/m,

  // German Gmail / Apple Mail: "Am Mo., 1. Jan. 2024 um 12:00 Uhr schrieb Name <email>:"
  /^Am .{5,100} schrieb .{1,80}:\s*$/m,

  // Outlook German reply header block: "Von: ... Gesendet: ..."
  /^Von:\s+.+\nGesendet:\s+/m,

  // Outlook English reply header block: "From: ... Sent: ..."
  /^From:\s+.+\nSent:\s+/m,

  // Outlook separator line
  /^_{10,}\s*$/m,

  // Explicit separators
  /^-{3,}\s*(Ursprüngliche Nachricht|Original Message|Forwarded message)\s*-{3,}/im,

  // Apple Mail: "Betreff: ... Von: ... Datum: ..."
  /^Betreff:\s+.+\nVon:\s+.+\nDatum:\s+/m,
];

export interface StrippedContent {
  /** Only the new/fresh content of this message (no quoted history). */
  freshContent: string;
  /** True if any quoted section was detected and removed. */
  hadQuotes: boolean;
}

/**
 * Returns the fresh (non-quoted) part of a plain-text email body.
 *
 * @param text  Full plain-text body as stored / received.
 */
export function stripQuotedContent(text: string): StrippedContent {
  if (!text?.trim()) {
    return { freshContent: text ?? '', hadQuotes: false };
  }

  // Find the earliest position where any quote pattern starts.
  let cutAt = text.length;
  for (const pattern of QUOTE_STARTERS) {
    const match = pattern.exec(text);
    if (match && match.index < cutAt) {
      cutAt = match.index;
    }
  }

  if (cutAt === text.length) {
    // Nothing found — return as-is.
    return { freshContent: text, hadQuotes: false };
  }

  const freshContent = text.slice(0, cutAt).trimEnd();
  return { freshContent, hadQuotes: true };
}
