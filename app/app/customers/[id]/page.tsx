import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import PhoneLink from '@/components/PhoneLink';
import {
	WORKFLOW_STATUS_LABEL,
	WORKFLOW_STATUS_CLASS,
	normalizeWorkflowStatus,
} from '@/lib/order-status';
import CustomerNotes from './CustomerNotes';
import CustomerMailSearch from './CustomerMailSearch';
import CustomerEmails from './CustomerEmails';

const TYPE_LABEL: Record<string, string> = {
	GUITAR: 'Gitarrenbau',
	BODY: 'Body',
	NECK: 'Hals',
	REPAIR: 'Reparatur',
	PICKGUARD: 'Pickguard',
	PICKUPS: 'Tonabnehmer',
	ENGRAVING: 'Gravur',
	FINISH_ONLY: 'Oberflächenbehandlung',
};

function formatDate(value: Date | string | null | undefined): string {
	if (!value) return '—';
	return new Date(value).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Kundenakte: Stammdaten, Aufträge, Mail-Verlauf und Notizen an einem Ort. */
export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;

	const customer = await prisma.customer.findUnique({
		where: { id },
		include: {
			orders: {
				orderBy: { createdAt: 'desc' },
				select: { id: true, title: true, type: true, status: true, createdAt: true, lastActivityAt: true, nextStep: true },
			},
		},
	});

	if (!customer) {
		return (
			<div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
				<div className="text-slate-300">Kunde nicht gefunden.</div>
				<Link href="/app/customers" className="text-sm text-sky-400 hover:text-sky-300">Zurück zur Kundenliste</Link>
			</div>
		);
	}

	// Mail-Verlauf: direkt verknüpfte Mails plus Mails von/an jede bekannte Adresse des Kunden
	const knownAddresses = Array.from(
		new Set([customer.email, ...customer.additionalEmails].filter((e): e is string => !!e))
	);
	const mails = await prisma.mail.findMany({
		where: {
			isDeleted: false,
			OR: [
				{ customerId: customer.id },
				...knownAddresses.flatMap((addr) => [
					{ fromEmail: { equals: addr, mode: 'insensitive' as const } },
					{ toEmail: { equals: addr, mode: 'insensitive' as const } },
				]),
			],
		},
		orderBy: { date: 'desc' },
		take: 10,
		select: { id: true, subject: true, date: true, folder: true, fromEmail: true, orderId: true },
	});

	const address = [customer.addressLine1, [customer.postalCode, customer.city].filter(Boolean).join(' ')]
		.filter(Boolean)
		.join(', ');

	return (
		<div className="space-y-4">
			{/* Kopf: Stammdaten */}
			<section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div>
						<div className="flex items-center gap-2">
							<Link href="/app/customers" className="rounded-lg border border-slate-700 px-2.5 py-1 text-sm hover:bg-slate-800">
								Kunden
							</Link>
							<span className="text-sm text-slate-500">/</span>
							<h1 className="text-lg font-semibold text-slate-100">{customer.name}</h1>
						</div>
						<div className="mt-2 space-y-1 text-sm text-slate-400">
							{customer.email && (
								<div>
									✉ <a href={`mailto:${customer.email}`} className="text-sky-400 hover:text-sky-300">{customer.email}</a>
								</div>
							)}
							{customer.phone && (
								<div>
									☎ <PhoneLink phone={customer.phone} className="text-sky-400 hover:text-sky-300">{customer.phone}</PhoneLink>
								</div>
							)}
							{address && <div>🏠 {address}{customer.country && customer.country !== 'DE' ? ` (${customer.country})` : ''}</div>}
							<div className="text-xs text-slate-500">Kunde seit {formatDate(customer.createdAt)}</div>
						</div>
					</div>
					{customer.email && (
						<Link
							href={`/app/posteingang?compose=1&to=${encodeURIComponent(customer.email)}`}
							className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500"
						>
							✉ Mail schreiben
						</Link>
					)}
				</div>
			</section>

			<CustomerEmails customerId={customer.id} initialEmails={customer.additionalEmails} />

			{/* Aufträge */}
			<section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
				<h3 className="mb-2 text-sm font-semibold text-slate-200">📋 Aufträge ({customer.orders.length})</h3>
				{customer.orders.length === 0 ? (
					<div className="text-sm text-slate-500">Noch keine Aufträge.</div>
				) : (
					<div className="overflow-x-auto">
						<table className="min-w-full text-sm">
							<thead>
								<tr className="text-left text-slate-400">
									<th className="py-1.5 pr-4">Auftrag</th>
									<th className="py-1.5 pr-4">Typ</th>
									<th className="py-1.5 pr-4">Status</th>
									<th className="py-1.5 pr-4">Erstellt</th>
									<th className="py-1.5 pr-4">Letzte Aktivität</th>
								</tr>
							</thead>
							<tbody>
								{customer.orders.map((order) => {
									const normalized = normalizeWorkflowStatus(order.status);
									return (
										<tr key={order.id} className="border-t border-slate-800">
											<td className="py-2 pr-4">
												<Link href={`/app/orders/${order.id}`} className="font-medium text-sky-400 hover:text-sky-300">
													{order.title}
												</Link>
												<div className="font-mono text-xs text-slate-500">{order.id}</div>
												{order.nextStep && <div className="text-xs text-sky-300/80">→ {order.nextStep}</div>}
											</td>
											<td className="py-2 pr-4">{TYPE_LABEL[order.type] ?? order.type}</td>
											<td className="py-2 pr-4">
												<span className={`rounded-full border px-2 py-0.5 text-xs ${WORKFLOW_STATUS_CLASS[normalized]}`}>
													{WORKFLOW_STATUS_LABEL[normalized]}
												</span>
											</td>
											<td className="py-2 pr-4 text-slate-400">{formatDate(order.createdAt)}</td>
											<td className="py-2 pr-4 text-slate-400">{formatDate(order.lastActivityAt)}</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				)}
			</section>

			<CustomerMailSearch customerId={customer.id} />

			{/* Mail-Verlauf */}
			<section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
				<h3 className="mb-2 text-sm font-semibold text-slate-200">📬 Letzte Mails ({mails.length})</h3>
				{mails.length === 0 ? (
					<div className="text-sm text-slate-500">Keine Mails zu diesem Kunden gefunden.</div>
				) : (
					<ul className="divide-y divide-slate-800">
						{mails.map((mail) => (
							<li key={mail.id} className="flex items-center justify-between gap-3 py-2">
								<div className="min-w-0">
									<div className="truncate text-sm text-slate-200">{mail.subject || 'Ohne Betreff'}</div>
									<div className="text-xs text-slate-500">
										{formatDate(mail.date)} · {mail.folder}
										{mail.orderId && (
											<>
												{' · '}
												<Link href={`/app/orders/${mail.orderId}`} className="text-sky-400 hover:text-sky-300">
													{mail.orderId}
												</Link>
											</>
										)}
									</div>
								</div>
							</li>
						))}
					</ul>
				)}
			</section>

			<CustomerNotes customerId={customer.id} />
		</div>
	);
}
