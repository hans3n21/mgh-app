// Client-seitiger Ablauf fuer den Import eines ausgefuellten Kunden-Datenblatts.
// Wird an zwei Stellen genutzt: im Auftragsdetail (Datei vom Rechner) und im
// Posteingang (PDF-Anhang einer Mail). Beide muessen sich gleich verhalten —
// insbesondere bei der Rueckfrage, wenn das PDF laut Metadaten woanders hingehoert.

export type ImportWarning = { code: string; message: string };
export type IgnoredField = { field: string; label: string; value: string };

type ImportResponse = {
  created?: number;
  unchanged?: number;
  ignoredFields?: IgnoredField[];
  warnings?: ImportWarning[];
  needsConfirmation?: boolean;
  error?: string;
};

export type DatasheetImportOutcome =
  | { status: 'imported'; message: string; created: number }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

/** Meldung nach erfolgreichem Import — nennt verworfene Felder beim Namen. */
export function describeImportResult(data: ImportResponse): string {
  const parts = [`${data.created ?? 0} neue Vorschlaege angelegt`];
  if (data.unchanged) parts.push(`${data.unchanged} unveraendert/bereits vorhanden`);

  let text = `Datenblatt importiert: ${parts.join(', ')}.`;
  const ignored = data.ignoredFields || [];
  if (ignored.length > 0) {
    const list = ignored.map((f) => `- ${f.label}: ${f.value}`).join('\n');
    text += `\n\n${ignored.length} Angabe(n) passen nicht zu diesem Auftragstyp und wurden verworfen:\n${list}`;
  }
  return `${text}\n\nDie Vorschlaege kannst du im lila Banner pro Feld uebernehmen oder ablehnen.`;
}

function confirmText(warnings: ImportWarning[] = []): string {
  const reasons = warnings.map((w) => `- ${w.message}`).join('\n');
  return `Achtung - dieses Datenblatt passt nicht zum Auftrag:\n\n${reasons}\n\nTrotzdem importieren? Es werden nur Vorschlaege angelegt, nichts wird direkt ueberschrieben.`;
}

/**
 * Laedt das PDF hoch und legt Vorschlaege an. Bei Herkunfts-Warnung wird
 * `confirmMismatch` gefragt; erst danach wird mit `force` erneut gesendet.
 */
export async function importDatasheetPdf(options: {
  orderId: string;
  file: Blob;
  filename: string;
  confirmMismatch?: (text: string) => boolean;
}): Promise<DatasheetImportOutcome> {
  const { orderId, file, filename } = options;
  const confirmMismatch = options.confirmMismatch || ((text) => window.confirm(text));

  const post = async (force: boolean) => {
    const fd = new FormData();
    fd.append('file', file, filename);
    if (force) fd.append('force', 'true');
    const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}/datasheet/import`, {
      method: 'POST',
      body: fd,
    });
    const data: ImportResponse = await res.json().catch(() => ({}));
    return { res, data };
  };

  try {
    let { res, data } = await post(false);

    if (res.status === 409 && data?.needsConfirmation) {
      if (!confirmMismatch(confirmText(data.warnings))) return { status: 'cancelled' };
      ({ res, data } = await post(true));
    }

    if (!res.ok) {
      return { status: 'error', message: data?.error || res.statusText || 'Import fehlgeschlagen' };
    }

    return {
      status: 'imported',
      message: describeImportResult(data),
      created: data.created ?? 0,
    };
  } catch {
    return { status: 'error', message: 'Import fehlgeschlagen (Netzwerkfehler).' };
  }
}

/**
 * Datenblatt direkt aus einem Mail-Anhang uebernehmen.
 * Der Anhang wird NICHT im Browser geladen: viele Anhaenge liegen nur als
 * IMAP-Referenz vor und muessten erst vom Server nachgeholt werden — das
 * dauert und der Umweg ueber den Browser wuerde die Daten zweimal bewegen.
 */
export async function importDatasheetFromAttachment(options: {
  orderId: string;
  attachmentId: string;
  confirmMismatch?: (text: string) => boolean;
}): Promise<DatasheetImportOutcome> {
  const { orderId, attachmentId } = options;
  const confirmMismatch = options.confirmMismatch || ((text) => window.confirm(text));

  const post = async (force: boolean) => {
    const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}/datasheet/import-attachment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attachmentId, force }),
    });
    const data: ImportResponse = await res.json().catch(() => ({}));
    return { res, data };
  };

  try {
    let { res, data } = await post(false);

    if (res.status === 409 && data?.needsConfirmation) {
      if (!confirmMismatch(confirmText(data.warnings))) return { status: 'cancelled' };
      ({ res, data } = await post(true));
    }

    if (!res.ok) {
      return { status: 'error', message: data?.error || res.statusText || 'Import fehlgeschlagen' };
    }

    return {
      status: 'imported',
      message: describeImportResult(data),
      created: data.created ?? 0,
    };
  } catch {
    return { status: 'error', message: 'Import fehlgeschlagen (Netzwerkfehler).' };
  }
}
