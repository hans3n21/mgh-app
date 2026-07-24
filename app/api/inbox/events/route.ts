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

	return new Response(new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder();
			const sub = {
				write: (line: string) => controller.enqueue(encoder.encode(line)),
				close: () => controller.close(),
			};
			subscribe(sub);
			// initial comment to establish SSE
			controller.enqueue(encoder.encode(': connected\n\n'));
		},
		cancel() {},
		pull() {},
	}), {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache, no-transform',
			Connection: 'keep-alive',
		},
	});
}


