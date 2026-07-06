import { prisma } from '@/lib/prisma';

export type DhlEnvironment = 'sandbox' | 'production';

export interface DhlConfig {
	environment: DhlEnvironment;
	clientId: string;
	clientSecret: string;
	portalUsername: string;
	portalPassword: string;
	// DHL country/routing code for the return, e.g. "deu" — NOT a per-business
	// address; the actual destination address is configured once by the
	// customer in the DHL Business Customer Portal under "Returns Settings".
	receiverId: string;
}

export interface ReturnLabelCustomer {
	name: string;
	street: string;
	houseNumber: string;
	postalCode: string;
	city: string;
	country: string;
	email?: string;
	phone?: string;
}

export interface ReturnLabelRequest {
	customer: ReturnLabelCustomer;
	weightInGrams?: number;
}

export interface ReturnLabelResult {
	trackingNumber: string;
	labelPdfBase64: string;
}

const BASE_URLS: Record<DhlEnvironment, string> = {
	sandbox: 'https://api-sandbox.dhl.com',
	production: 'https://api-eu.dhl.com',
};

const DHL_SETTING_KEYS = {
	environment: 'dhl:environment',
	clientId: 'dhl:clientId',
	clientSecret: 'dhl:clientSecret',
	portalUsername: 'dhl:portalUsername',
	portalPassword: 'dhl:portalPassword',
	receiverId: 'dhl:receiverId',
} as const;

export async function getDhlConfig(): Promise<DhlConfig> {
	const rows = await prisma.systemSetting.findMany({
		where: { key: { in: Object.values(DHL_SETTING_KEYS) } },
	});
	const map = new Map(rows.map((r) => [r.key, r.value]));

	const environment: DhlEnvironment = map.get(DHL_SETTING_KEYS.environment) === 'production' ? 'production' : 'sandbox';

	return {
		environment,
		clientId: map.get(DHL_SETTING_KEYS.clientId) || '',
		clientSecret: map.get(DHL_SETTING_KEYS.clientSecret) || '',
		portalUsername: map.get(DHL_SETTING_KEYS.portalUsername) || '',
		portalPassword: map.get(DHL_SETTING_KEYS.portalPassword) || '',
		receiverId: map.get(DHL_SETTING_KEYS.receiverId) || 'deu',
	};
}

export function isDhlConfigComplete(config: DhlConfig): boolean {
	return !!(config.clientId && config.clientSecret && config.portalUsername && config.portalPassword && config.receiverId);
}

// Module-scope token cache. Single-instance app, no Redis — same pragmatism as
// the rest of the codebase. DHL's documented token lifetime is inconsistent
// across their own docs (5 min vs 30 min seen in different reference pages) —
// cache conservatively and re-verify against a real sandbox response before
// relying on this for production.
let cachedToken: { environment: DhlEnvironment; clientId: string; token: string; expiresAt: number } | null = null;

async function getAccessToken(config: DhlConfig): Promise<string> {
	if (
		cachedToken &&
		cachedToken.environment === config.environment &&
		cachedToken.clientId === config.clientId &&
		Date.now() < cachedToken.expiresAt
	) {
		return cachedToken.token;
	}

	// Matches DHL's documented OAuth2 ROPC form exactly (body-encoded
	// client_id/client_secret, no extra headers). As of 2026-07-06 this
	// consistently gets back 401 "Invalid client identifier" against a
	// freshly-registered developer.dhl.com app (env "Customer (Integration)
	// Testing") — tried with client_id/secret in the body, as HTTP Basic Auth,
	// and with an extra `dhl-api-key` header; all three gave the byte-identical
	// error, which points away from a request-shape bug and towards either (a)
	// new-key propagation delay on DHL's side, or (b) the business account
	// itself not yet having the Returns product provisioned even though the
	// app shows "aktiviert". Re-verify against the sandbox before trusting this.
	const tokenUrl = `${BASE_URLS[config.environment]}/parcel/de/account/auth/ropc/v1/token`;
	const body = new URLSearchParams({
		grant_type: 'password',
		username: config.portalUsername,
		password: config.portalPassword,
		client_id: config.clientId,
		client_secret: config.clientSecret,
	});

	const res = await fetch(tokenUrl, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: body.toString(),
	});

	if (!res.ok) {
		const detail = await res.text().catch(() => '');
		throw new Error(`DHL-Login fehlgeschlagen (${res.status}): ${detail || res.statusText}`);
	}

	const data = await res.json();
	const token: string | undefined = data.access_token;
	const expiresInSeconds: number = typeof data.expires_in === 'number' ? data.expires_in : 240;
	if (!token) {
		throw new Error('DHL-Login lieferte keinen access_token in der Antwort');
	}

	// 30s safety margin before expiry.
	cachedToken = {
		environment: config.environment,
		clientId: config.clientId,
		token,
		expiresAt: Date.now() + Math.max(expiresInSeconds - 30, 30) * 1000,
	};
	return token;
}

/**
 * Creates a DHL return label: the customer is the physical shipper, the
 * workshop is the receiver (resolved server-side by DHL from the account's
 * "Returns Settings" + receiverId, not sent as an address in this request).
 *
 * FIELD MAPPING NOT YET VERIFIED AGAINST A LIVE SANDBOX RESPONSE — the shape
 * below matches DHL's published example requests for the Parcel DE Returns
 * API (receiverId as a country/routing code like "deu", shipper name1/
 * addressStreet/addressHouse/postalCode/city), but must be confirmed with a
 * real sandbox call (see plan doc) before this is trusted for production use.
 */
export async function createReturnLabel(config: DhlConfig, request: ReturnLabelRequest): Promise<ReturnLabelResult> {
	const token = await getAccessToken(config);
	const url = `${BASE_URLS[config.environment]}/parcel/de/shipping/returns/v1/orders?labelType=SHIPMENT_LABEL`;

	const res = await fetch(url, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`,
			'dhl-api-key': config.clientId,
		},
		body: JSON.stringify({
			receiverId: config.receiverId,
			shipper: {
				name1: request.customer.name,
				addressStreet: request.customer.street,
				addressHouse: request.customer.houseNumber,
				postalCode: request.customer.postalCode,
				city: request.customer.city,
				country: request.customer.country,
				email: request.customer.email,
				phone: request.customer.phone,
			},
			weight: request.weightInGrams ? { uom: 'g', value: request.weightInGrams } : undefined,
		}),
	});

	if (!res.ok) {
		const detail = await res.text().catch(() => '');
		throw new Error(`DHL-Label konnte nicht erstellt werden (${res.status}): ${detail || res.statusText}`);
	}

	const data = await res.json();
	const trackingNumber: string | undefined = data.shipmentNo || data.trackingNumber || data.id;
	const labelPdfBase64: string | undefined = data.label?.b64 || data.labelData;

	if (!trackingNumber || !labelPdfBase64) {
		throw new Error('DHL-Antwort enthielt keine Tracking-Nummer oder kein Label-PDF — Response-Format prüfen');
	}

	return { trackingNumber, labelPdfBase64 };
}
