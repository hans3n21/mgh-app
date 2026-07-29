// Erzeugt das ausfuellbare Kunden-Datenblatt fuer einen Auftrag (oder blanko
// fuer einen Auftragstyp). Gemeinsame Grundlage fuer den Download-Button im
// Auftrag und den Mail-Anhang aus dem Posteingang — beide muessen dasselbe PDF
// liefern, sonst passt spaeter der Herkunfts-Abgleich beim Import nicht.
import { prisma } from '@/lib/prisma';
import { DATASHEET_TYPE_LABELS, isValidDatasheetType } from '@/lib/customer-datasheet';
import { generateFillableDatasheet } from '@/lib/pdf/fillable-datasheet';

export type DatasheetBuildResult = {
  bytes: Uint8Array;
  filename: string;
  type: string;
  orderId?: string;
};

export class DatasheetBuildError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'DatasheetBuildError';
  }
}

export async function buildDatasheetForOrder(options: {
  orderId?: string;
  type?: string;
}): Promise<DatasheetBuildResult> {
  const { orderId } = options;
  let type = options.type || 'GUITAR';
  let orderTitle: string | undefined;
  const values: Record<string, string> = {};

  if (orderId) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { customer: true, specs: true },
    });
    if (!order) throw new DatasheetBuildError('Order not found', 404);

    // Der Auftrag bestimmt den Typ — ein mitgegebener `type` waere hier falsch.
    type = order.type;
    orderTitle = order.title;

    if (order.customer) {
      const c = order.customer;
      if (c.name) values['customer.name'] = c.name;
      if (c.email) values['customer.email'] = c.email;
      if (c.phone) values['customer.phone'] = c.phone;
      if (c.addressLine1) values['customer.addressLine1'] = c.addressLine1;
      if (c.postalCode) values['customer.postalCode'] = c.postalCode;
      if (c.city) values['customer.city'] = c.city;
    }

    // Pro Key den ausfuehrlichsten Wert uebernehmen (es kann Duplikate geben)
    for (const spec of order.specs) {
      const key = `order.${spec.key}`;
      const current = values[key];
      if (!current || spec.value.length > current.length) {
        values[key] = spec.value;
      }
    }
  }

  if (!isValidDatasheetType(type)) {
    throw new DatasheetBuildError(`Unknown datasheet type: ${type}`, 400);
  }

  const bytes = await generateFillableDatasheet({ type, orderId, orderTitle, values });
  const label = (DATASHEET_TYPE_LABELS[type] || type).replace(/[^\w-]+/g, '-');

  return {
    bytes,
    filename: `MGH-Datenblatt-${label}${orderId ? `-${orderId}` : ''}.pdf`,
    type,
    orderId,
  };
}
