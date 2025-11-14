type EventPayload = { type: string; data: any };

type Subscriber = {
	write: (line: string) => void;
	close: () => void;
};

declare global {
	// eslint-disable-next-line no-var
	var __inboxSubscribers: Set<Subscriber> | undefined;
}

const subscribers: Set<Subscriber> = (globalThis as any).__inboxSubscribers || new Set();
(globalThis as any).__inboxSubscribers = subscribers;

export function subscribe(sub: Subscriber) {
	subscribers.add(sub);
}

export function unsubscribe(sub: Subscriber) {
	subscribers.delete(sub);
}

export function publish(event: EventPayload) {
	const line = `event: ${event.type}\n` + `data: ${JSON.stringify(event.data)}\n\n`;
	subscribers.forEach((s) => {
		try { s.write(line); } catch {}
	});
}


