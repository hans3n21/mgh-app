/**
 * Next.js Instrumentation — läuft einmal beim Serverstart (dev und production).
 * Node-spezifischer Code liegt in instrumentation-node.ts; der Guard sorgt
 * dafür, dass er nicht ins Edge-Runtime-Bundle (Middleware) gelangt.
 */
export async function register() {
	if (process.env.NEXT_RUNTIME === 'nodejs') {
		const { startMailSyncWorker } = await import('./instrumentation-node');
		startMailSyncWorker();
	}
}
