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
// the rest of the codebase. Confirmed against a real sandbox response (2026-07-07):
// expires_in came back as 240s, so the 30s safety margin below is a reasonable cushion.
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

	// portalUsername/portalPassword are the ROPC "resource owner" credentials.
	// In sandbox these are DHL's fixed public test values (user-valid /
	// SandboxPasswort2023!), NOT the real Geschaeftskundenportal login --
	// verified against DHL's own docs and a live sandbox call (2026-07-07).
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
 * Field mapping confirmed against a real sandbox response (2026-07-07):
 * `shipmentNo` + `label.b64` are exactly what DHL returns. Only send the
 * Bearer token here -- adding a `dhl-api-key` header alongside it makes DHL
 * reject the request with "Invalid combination of credentials: Use EITHER
 * Bearer Token or (Apikey and Basic Auth)."
 */
export async function createReturnLabel(config: DhlConfig, request: ReturnLabelRequest): Promise<ReturnLabelResult> {
	const token = await getAccessToken(config);
	const url = `${BASE_URLS[config.environment]}/parcel/de/shipping/returns/v1/orders?labelType=SHIPMENT_LABEL`;

	const res = await fetch(url, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`,
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
