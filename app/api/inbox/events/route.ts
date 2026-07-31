import { NextRequest } from 'next/server';
import { subscribe, unsubscribe } from '@/lib/realtime';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
	const session = await auth();
	if (!session) {
		return new Response(JSON.stringify({ error: 'Unauthorized' }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	// Ausserhalb von start() gebunden, damit cancel() ihn ueberhaupt erreichen kann.
	// Vorher war cancel() leer und der Abonnent blieb fuer die gesamte Lebensdauer
	// des Prozesses im Set — bei einem Dauerprozess sammelt jeder Seiten-Neuladen,
	// jeder neue Tab und jeder Netzabbruch einen toten Eintrag an, ueber den danach
	// jedes publish() iteriert.
	let sub: { write: (line: string) => void; close: () => void } | null = null;

	return new Response(new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder();
			sub = {
				write: (line: string) => controller.enqueue(encoder.encode(line)),
				close: () => controller.close(),
			};
			subscribe(sub);
			// initial comment to establish SSE
			controller.enqueue(encoder.encode(': connected\n\n'));
		},
		cancel() {
			if (sub) {
				unsubscribe(sub);
				sub = null;
			}
		},
		pull() {},
	}), {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache, no-transform',
			Connection: 'keep-alive',
		},
	});
}


