import { getDhlConfig, isDhlConfigComplete, createReturnLabel } from '../lib/shipping/dhl';

async function main() {
	const config = await getDhlConfig();
	console.log('config loaded:', { ...config, clientSecret: '[hidden]', portalPassword: '[hidden]' });
	console.log('complete:', isDhlConfigComplete(config));

	const result = await createReturnLabel(config, {
		customer: {
			name: 'Max Mustermann',
			street: 'Musterstraße',
			houseNumber: '1',
			postalCode: '53113',
			city: 'Bonn',
			country: 'DE',
		},
		weightInGrams: 500,
	});
	console.log('SUCCESS');
	console.log('trackingNumber:', result.trackingNumber);
	console.log('label PDF bytes:', Buffer.from(result.labelPdfBase64, 'base64').length);
}

main().catch((e) => {
	console.error('FAILED:', e instanceof Error ? e.message : e);
	process.exit(1);
});
