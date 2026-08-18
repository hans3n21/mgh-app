import { prisma } from './prisma';

// Raten-Modi (Anzahlung/Restzahlung) wurden bewusst entfernt: Rechnungen gehen
// nur noch über den vollen Endbetrag in den Shop. Der interne Zahlungsstand
// (Angezahlt/Bezahlt) lebt unabhängig davon am Auftrag.
interface CreateWooOptions {
  amountCents?: number; // optional, falls angegeben wird dieser Betrag verwendet
  customLabel?: string; // optionaler Zusatz für Fee-Namen (z.B. Extrakosten-Grund)
}

function sanitizeEnv(v?: string | null): string | undefined {
  if (typeof v !== 'string') return undefined;
  const trimmed = v.trim().replace(/^['"]|['"]$/g, '');
  return trimmed;
}

function basicAuthHeader(): string {
  const key = sanitizeEnv(process.env.WC_CONSUMER_KEY);
  const secret = sanitizeEnv(process.env.WC_CONSUMER_SECRET);
  if (!key || !secret) {
    throw new Error('WC_CONSUMER_KEY/SECRET fehlen');
  }
  const token = Buffer.from(`${key}:${secret}`).toString('base64');
  return `Basic ${token}`;
}

export async function createWooOrderForInternal(orderId: string, options: CreateWooOptions = {}): Promise<{ wooOrderId: string }> {
  const base = sanitizeEnv(process.env.WC_BASE_URL);
  const key = sanitizeEnv(process.env.WC_CONSUMER_KEY);
  const secret = sanitizeEnv(process.env.WC_CONSUMER_SECRET);
  if (!base) throw new Error('WC_BASE_URL fehlt');
  if (!key || !secret) throw new Error('WC_CONSUMER_KEY/SECRET fehlen');

  const orderRaw = await prisma.order.findUnique({
    where: { id: orderId },
    include: { customer: true, specs: true, items: true },
  });
  if (!orderRaw) throw new Error('Order nicht gefunden');
  const order = orderRaw; // Type narrowing

  const [firstName, ...rest] = (order.customer?.name || '').split(' ');
  const lastName = rest.join(' ');
  const addressLine1 = (order.customer as any)?.addressLine1 || '';
  const postalCode   = (order.customer as any)?.postalCode || '';
  const city         = (order.customer as any)?.city || '';
  const country      = (order.customer as any)?.country || 'DE';

  const typeLabel: Record<string, string> = {
    GUITAR: 'Gitarrenbau', BODY: 'Body', NECK: 'Hals', REPAIR: 'Reparatur', PICKGUARD: 'Pickguard', PICKUPS: 'Tonabnehmer', ENGRAVING: 'Gravur', FINISH_ONLY: 'Oberfläche',
  };

  function primaryModelForType(): string | null {
    const kv: Record<string, string> = Object.fromEntries(order.specs.map(s => [s.key, s.value]));
    switch (order.type) {
      case 'GUITAR':
      case 'BODY':
        return kv['body_shape'] || null;
      case 'NECK':
        return kv['headstock_type'] || null;
      case 'PICKGUARD':
        return kv['pg_model'] || null;
      default:
        return null;
    }
  }

  function secondaryDetailForType(): string | null {
    const kv: Record<string, string> = Object.fromEntries(order.specs.map(s => [s.key, s.value]));
    if (order.type === 'PICKGUARD') {
      return kv['pg_material'] || null;
    }
    return null;
  }

  const label = typeLabel[order.type] || order.type;
  const model = primaryModelForType();
  const secondary = secondaryDetailForType();

  // Betrag ermitteln (Basis = Endbetrag in Cent)
  let baseCents: number | undefined = options.amountCents ?? undefined;
  if (baseCents == null) {
    // Fallback: Summe aus Items (total angenommen in Euro) → Cent
    const sumEuro = (order.items || []).reduce((s, it) => s + (Number(it.total) || 0), 0);
    baseCents = Math.round(sumEuro * 100);
  }

  const totalCents = baseCents ?? 0; // Brutto-Endbetrag

  const composedName = `Werkstattauftrag · ${label}${model ? ' – ' + model : ''}${secondary ? ' · ' + secondary : ''}${options.customLabel ? ' · ' + options.customLabel : ''} · ${order.id}`;

  const payload: any = {
    created_via: 'MGH-App',
    payment_method: 'bacs',
    payment_method_title: 'Banküberweisung',
    set_paid: false,
    status: 'pending',
    customer_note: `Interne Auftrags-ID: ${order.id} (${order.title})` + (model ? `\nModell: ${model}` : ''),
    billing: {
      first_name: firstName || order.customer?.name || 'Kunde',
      last_name: lastName || '',
      email: order.customer?.email || '',
      phone: order.customer?.phone || '',
      address_1: addressLine1,
      city,
      postcode: postalCode,
      country,
    },
    shipping: {
      first_name: firstName || order.customer?.name || 'Kunde',
      last_name: lastName || '',
      address_1: addressLine1,
      city,
      postcode: postalCode,
      country,
    },
    meta_data: [
      { key: 'internal_order_id', value: order.id },
      { key: '_wc_order_attribution_source_type', value: 'utm' },
      { key: '_wc_order_attribution_utm_source', value: 'MGH-App' },
      { key: '_wc_order_attribution_utm_medium', value: 'internal-app' },
      { key: '_wc_order_attribution_utm_campaign', value: 'workshop-order' },
      { key: '_wc_order_attribution_session_entry', value: 'MGH-App' },
    ],
  };

  const endpoint = `${base.replace(/\/$/, '')}/wp-json/wc/v3/orders`;
  const productIdEnv = sanitizeEnv(process.env.WC_PRODUCT_ID_WORKORDER);

  // Baue Positionsdaten: bevorzugt line_items mit Produkt, sonst fee_lines.
  // App-Betraege sind Endpreise inkl. MwSt.; WooCommerce erwartet hier Netto + Steuer.
  const bodyPayload: any = { ...payload };
  const grossToNetSetting = sanitizeEnv(process.env.WC_FORCE_GROSS_TO_NET);
  const forceGrossToNet = grossToNetSetting !== 'false';
  const vatRate = (() => {
    const s = sanitizeEnv(process.env.WC_VAT_RATE);
    const n = s ? parseFloat(s) : 0.19;
    return isNaN(n) ? 0.19 : n;
  })();
  const formatCents = (cents: number) => (cents / 100).toFixed(2);

  let netCents = totalCents;
  let taxCents = 0;
  if (forceGrossToNet) {
    netCents = Math.round(totalCents / (1 + vatRate));
    taxCents = totalCents - netCents;
  }

  bodyPayload.fee_lines = [{
    name: composedName,
    total: formatCents(forceGrossToNet ? netCents : totalCents),
    ...(forceGrossToNet ? { total_tax: formatCents(taxCents) } : {}),
  }];

  if (productIdEnv && totalCents != null) {
    const productId = parseInt(productIdEnv, 10);
    if (!isNaN(productId)) {
      delete bodyPayload.fee_lines;
      bodyPayload.line_items = [{
        product_id: productId,
        quantity: 1,
        name: composedName,
        subtotal: formatCents(forceGrossToNet ? netCents : totalCents),
        total: formatCents(forceGrossToNet ? netCents : totalCents),
        ...(forceGrossToNet ? {
          subtotal_tax: formatCents(taxCents),
          total_tax: formatCents(taxCents),
        } : {}),
      }];
    }
  }

  // Versand als eigene Versandposition. Am Auftrag gepflegt (Order.shippingCents),
  // kommt OBENDRAUF auf den Endbetrag. Nicht bei Extra-Bestellungen (customLabel).
  const shippingCents = order.shippingCents ?? 0;
  if (shippingCents > 0 && !options.customLabel) {
    let shippingNetCents = shippingCents;
    let shippingTaxCents = 0;
    if (forceGrossToNet) {
      shippingNetCents = Math.round(shippingCents / (1 + vatRate));
      shippingTaxCents = shippingCents - shippingNetCents;
    }
    bodyPayload.shipping_lines = [{
      method_id: 'flat_rate',
      method_title: 'Versand',
      total: formatCents(shippingNetCents),
      ...(forceGrossToNet ? { total_tax: formatCents(shippingTaxCents) } : {}),
    }];
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(bodyPayload),
  });

  if (!res.ok) {
    const t1 = await res.text();
    // Fallback: Auth via Query-Params (manche Hosts blocken Authorization-Header)
    const url = new URL(endpoint);
    url.searchParams.set('consumer_key', key);
    url.searchParams.set('consumer_secret', secret);
    const res2 = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyPayload),
    });
    if (!res2.ok) {
      const t2 = await res2.text();
      throw new Error(`WooCommerce Order failed: primary ${res.status} ${t1} | fallback ${res2.status} ${t2}`);
    }
    const data2 = await res2.json();
    return { wooOrderId: String(data2.id) };
  }

  const data = await res.json();
  return { wooOrderId: String(data.id) };
}


