import { NextRequest } from 'next/server';
import { subscribe, unsubscribe } from '@/lib/realtime';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
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


