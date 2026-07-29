// Welches Postfach verschickt eine Auftrags-Mail?
//
// Das globale Standardkonto ist hier bewusst NICHT die erste Wahl: bei uns steht
// dort der-trashcontainer.de, und das hat an Auftragskunden nichts verloren.
// Ohne diese Regel ging eine Kundenmail zu einem Gitarrenauftrag ueber die
// Containerfirma raus (ORD-2026-049, 29.07.2026).
import { prisma } from '@/lib/prisma';

/** Auftragstyp -> Absender-Domain. Alles nicht Aufgefuehrte laeuft ueber MGH. */
const DOMAIN_BY_ORDER_TYPE: Record<string, string> = {
  PICKGUARD: 'dein-pickguard.de',
};
const DEFAULT_ORDER_DOMAIN = 'mgh-guitars.de';

export type AccountChoiceReason =
  /** Ausdruecklich im Dialog gewaehlt */
  | 'explicit'
  /** Der Kunde hat an diese Adresse geschrieben - dorthin wird geantwortet */
  | 'incoming'
  /** Aus dem Auftragstyp abgeleitet */
  | 'order_type'
  /** Nichts passte - globales Standardkonto */
  | 'fallback';

export type SelectedMailAccount = {
  id: string;
  name: string;
  email: string;
  reason: AccountChoiceReason;
};

export async function pickAccountForOrder(options: {
  orderId: string;
  orderType?: string | null;
  customerId?: string | null;
  /** Ausdrueckliche Wahl aus der Oberflaeche */
  preferredAccountId?: string | null;
}): Promise<SelectedMailAccount | null> {
  const { orderId, orderType, customerId, preferredAccountId } = options;
  const pick = (a: { id: string; name: string; email: string }, reason: AccountChoiceReason) =>
    ({ id: a.id, name: a.name, email: a.email, reason });

  // 1) Ausdrueckliche Wahl schlaegt alles.
  if (preferredAccountId) {
    const chosen = await prisma.mailAccount.findFirst({
      where: { id: preferredAccountId, isActive: true },
      select: { id: true, name: true, email: true },
    });
    if (chosen) return pick(chosen, 'explicit');
  }

  // 2) Hat der KUNDE uns geschrieben? Dann von genau der Adresse antworten,
  //    an die er geschrieben hat.
  //    Bewusst nur eingehende Mails vom Kunden selbst:
  //    - eigene Sendungen als Signal wuerden eine einmal falsch gewaehlte
  //      Adresse fuer immer festschreiben,
  //    - fremde Eingaenge zum Auftrag (PayPal-Benachrichtigung, Lieferant)
  //      wuerden den Absender per Zufall bestimmen.
  const customer = customerId
    ? await prisma.customer.findUnique({ where: { id: customerId }, select: { email: true } })
    : null;
  if (customer?.email) {
    const lastFromCustomer = await prisma.mail.findFirst({
      where: {
        senderId: null,
        fromEmail: { equals: customer.email, mode: 'insensitive' },
        OR: [{ orderId }, ...(customerId ? [{ customerId }] : [])],
      },
      orderBy: { date: 'desc' },
      select: { account: { select: { id: true, name: true, email: true, isActive: true } } },
    });
    if (lastFromCustomer?.account?.isActive) return pick(lastFromCustomer.account, 'incoming');
  }

  // 3) Sonst nach Auftragstyp.
  const domain = (orderType && DOMAIN_BY_ORDER_TYPE[orderType]) || DEFAULT_ORDER_DOMAIN;
  const byDomain = await prisma.mailAccount.findFirst({
    where: { isActive: true, email: { endsWith: `@${domain}`, mode: 'insensitive' } },
    select: { id: true, name: true, email: true },
  });
  if (byDomain) return pick(byDomain, 'order_type');

  // 4) Notnagel, damit der Versand nicht komplett scheitert.
  const fallback =
    (await prisma.mailAccount.findFirst({
      where: { isDefault: true, isActive: true },
      select: { id: true, name: true, email: true },
    })) ??
    (await prisma.mailAccount.findFirst({
      where: { isActive: true },
      select: { id: true, name: true, email: true },
    }));
  return fallback ? pick(fallback, 'fallback') : null;
}

/** Aktive Konten fuer die Auswahl in der Oberflaeche. */
export async function listActiveMailAccounts() {
  return prisma.mailAccount.findMany({
    where: { isActive: true },
    select: { id: true, name: true, email: true },
    orderBy: { name: 'asc' },
  });
}
