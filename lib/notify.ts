import { prisma } from '@/lib/prisma';

type NotifyInput = {
	userId: string;
	type: 'task_assigned' | 'order_assigned' | 'order_mail';
	title: string;
	body?: string | null;
	href?: string | null;
};

/**
 * Legt eine In-App-Benachrichtigung an (Badge im Header).
 * Fehler werden geschluckt — eine fehlgeschlagene Benachrichtigung darf nie
 * die eigentliche Aktion (Aufgabe anlegen, Mail syncen, …) kaputt machen.
 */
export async function notify(input: NotifyInput): Promise<void> {
	try {
		await prisma.notification.create({
			data: {
				userId: input.userId,
				type: input.type,
				title: input.title.slice(0, 200),
				body: input.body?.slice(0, 500) ?? null,
				href: input.href ?? null,
			},
		});
	} catch (error) {
		console.warn('[notify] Benachrichtigung fehlgeschlagen:', error instanceof Error ? error.message : error);
	}
}
