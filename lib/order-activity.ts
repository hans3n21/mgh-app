import { prisma } from '@/lib/prisma';

/**
 * Setzt Order.lastActivityAt auf jetzt — Basis für "Liegt seit" in der
 * Auftragsübersicht. Wird von allen Routen aufgerufen, die fachlich am
 * Auftrag arbeiten (Status, Specs, Bilder, Nachrichten, Aufgaben,
 * Mail-Zuordnung, Datenblätter, Preise).
 *
 * Fehler werden geschluckt: Ein fehlgeschlagener Aktivitäts-Stempel darf
 * nie die eigentliche Aktion kaputt machen.
 */
export async function touchOrderActivity(orderId: string | null | undefined): Promise<void> {
	if (!orderId) return;
	try {
		await prisma.order.update({
			where: { id: orderId },
			data: { lastActivityAt: new Date() },
		});
	} catch {
		// Auftrag existiert nicht (mehr) oder DB-Hickser — bewusst ignorieren.
	}
}
