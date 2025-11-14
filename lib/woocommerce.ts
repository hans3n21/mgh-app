import { prisma } from './prisma';

type WooSyncMode = 'full' | 'deposit' | 'balance';
interface CreateWooOptions {
  mode?: WooSyncMode;
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
  const mode: WooSyncMode = options.mode || 'full';

  // Betrag ermitteln (Basis = Endbetrag in Cent)
  let baseCents: number | undefined = options.amountCents ?? undefined;
  if (baseCents == null) {
    // Fallback: Summe aus Items (total angenommen in Euro) → Cent
    const sumEuro = (order.items || []).reduce((s, it) => s + (Number(it.total) || 0), 0);
    baseCents = Math.round(sumEuro * 100);
  }

  // Anzahlung/Restzahlung: immer 50% des Endbetrags, auch wenn amountCents übergeben wurde
  let totalCents = baseCents ?? 0; // gewünschter Brutto-Endbetrag des jeweiligen Schritts
  if (mode === 'deposit' || mode === 'balance') {
    totalCents = Math.round(totalCents * 0.5);
  }

  let feeNameMode = 'Werkstattauftrag';
  if (mode === 'deposit') feeNameMode = 'Anzahlung 50%';
  if (mode === 'balance') feeNameMode = 'Restzahlung';

  const composedName = `${feeNameMode} · ${label}${model ? ' – ' + model : ''}${secondary ? ' · ' + secondary : ''}${options.customLabel ? ' · ' + options.customLabel : ''} · ${order.id}`;

  const payload: any = {
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
    fee_lines: [{ name: composedName, total: totalCents != null ? (totalCents / 100).toFixed(2) : '0' }],
    meta_data: [{ key: 'internal_order_id', value: order.id }],
  };

  const endpoint = `${base.replace(/\/$/, '')}/wp-json/wc/v3/orders`;
  const productIdEnv = sanitizeEnv(process.env.WC_PRODUCT_ID_WORKORDER);

  // Baue Positionsdaten: bevorzugt line_items mit Produkt, sonst fee_lines
  let bodyPayload: any = { ...payload };
  // Optional: Betrag als Brutto behandeln und in Netto+Steuer aufsplitten
  const forceGrossToNet = sanitizeEnv(process.env.WC_FORCE_GROSS_TO_NET) === 'true';
  const vatRate = (() => {
    const s = sanitizeEnv(process.env.WC_VAT_RATE);
    const n = s ? parseFloat(s) : 0.19;
    return isNaN(n) ? 0.19 : n;
  })();
  let netCents = totalCents;
  let taxCents = 0;
  if (forceGrossToNet) {
    netCents = Math.round(totalCents / (1 + vatRate));
    taxCents = totalCents - netCents;
  }

  if (productIdEnv && totalCents != null) {
    const productId = parseInt(productIdEnv, 10);
    if (!isNaN(productId)) {
      delete bodyPayload.fee_lines;
      bodyPayload.line_items = [{
        product_id: productId,
        quantity: 1,
        name: composedName,
        total: ((forceGrossToNet ? netCents : totalCents) / 100).toFixed(2),
        ...(forceGrossToNet ? { total_tax: (taxCents / 100).toFixed(2) } : {}),
      }];
    }
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


