import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { parseMail } from '@/lib/mail/parseMail';
import { auth } from '@/lib/auth';
import { TRASH_FOLDER_CANDIDATES } from '@/lib/mail/folders';
import { SEARCH_STATEMENT_TIMEOUT_MS, SearchInterruptedError, withSearchGuard } from '@/lib/mail/searchGuard';

export async function GET(req: NextRequest) {
	try {
	const session = await auth();
	if (!session) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	}

	const { searchParams } = new URL(req.url);
	const q = (searchParams.get('q') || '').trim();
	const filter = (searchParams.get('filter') || 'all').toLowerCase();
	const group = (searchParams.get('group') || '').toLowerCase();
	const summary = searchParams.get('summary') === '1';
	const accountId = searchParams.get('accountId') || null;
	const accountIdsParam = searchParams.get('accountIds') || '';
	const accountIds = accountIdsParam
		.split(',')
		.map((v) => v.trim())
		.filter(Boolean);
	const paginate = searchParams.get('paginate') === '1';
	const rawPage = Number(searchParams.get('page') || '1');
	const rawLimit = Number(searchParams.get('limit') || '100');
	const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
	const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 500) : 100;
	const skip = (page - 1) * limit;
	// Accept raw IMAP folder paths (e.g. "INBOX", "Sent", "[Gmail]/All Mail")
	// Legacy short-names are still mapped for backwards compatibility
	const folderParam = searchParams.get('folder') || 'INBOX';
	const legacyFolderMap: Record<string, string | null> = {
		inbox: 'INBOX',
		sent: 'Sent',
		trash: 'Trash',
		all: null,
	};
	const folder = legacyFolderMap[folderParam.toLowerCase()] !== undefined
		? legacyFolderMap[folderParam.toLowerCase()]
		: folderParam;

	const includeTrash = searchParams.get('includeTrash') === '1';

	const where: any = {};
	// Never include locally deleted mails in inbox results.
	where.isDeleted = false;
	if (folder) {
		where.folder = folder;
	} else if (!includeTrash) {
		// Global search: exclude trash folders by default
		where.NOT = {
			folder: { in: TRASH_FOLDER_CANDIDATES },
		};
	}
	if (accountId) {
		where.accountId = accountId;
	} else if (accountIds.length > 0) {
		where.accountId = { in: accountIds };
	}
		if (q) {
			const searchFields: any[] = [
				{ subject:   { contains: q, mode: 'insensitive' } },
				{ fromEmail: { contains: q, mode: 'insensitive' } },
				{ fromName:  { contains: q, mode: 'insensitive' } },
				{ toEmail:   { contains: q, mode: 'insensitive' } },
			];
			// Volltext erst ab 3 Zeichen: kuerzere Begriffe treffen fast jede Mail
			// und zwingen die DB durch saemtliche Mailtexte (Tabelle: mehrere GB).
			// Auch der Trigram-Index (Migration 20260828150000) greift erst ab
			// drei Zeichen richtig. Die Meta-Felder oben sind klein und schnell.
			if (q.length >= 3) {
				searchFields.push({ text: { contains: q, mode: 'insensitive' } });
			}
			where.OR = searchFields;
		}
		if (filter === 'assigned') {
			where.orderId = { not: null };
		} else if (filter === 'unassigned') {
			where.orderId = null;
		} else if (filter === 'unread') {
			where.isRead = false;
		} else if (filter === 'with_order') {
			where.orderId = { not: null };
		}

		const take = paginate ? limit + 1 : 200;
		const runList = (client: Prisma.TransactionClient | typeof prisma): Promise<any[]> => summary
			? client.mail.findMany({
				where,
				orderBy: { date: 'desc' },
				select: {
					id: true,
					messageId: true,
					threadId: true,
					accountId: true,
					uid: true,
					folder: true,
					subject: true,
					fromEmail: true,
					fromName: true,
					replyToEmail: true,
					toEmail: true,
					toName: true,
					date: true,
					orderId: true,
					isRead: true,
					starred: true,
					tags: true,
					snippet: true,
					_count: { select: { attachments: true } },
				},
				skip: paginate ? skip : undefined,
				take,
			})
			: client.mail.findMany({
				where,
				orderBy: { date: 'desc' },
				include: { attachments: true, order: { select: { id: true, title: true } } },
				skip: paginate ? skip : undefined,
				take,
			});
		// Nur die Suche braucht das Sicherheitsnetz (Zeitlimit + Abbruch-
		// Weitergabe an Postgres, siehe lib/mail/searchGuard.ts). Die normale
		// Ordnerliste laeuft ueber den zusammengesetzten Index und ist schnell.
		const rawMails: any[] = q ? await withSearchGuard(req, runList) : await runList(prisma);
		const hasMore = paginate && rawMails.length > limit;
		const mails = paginate ? rawMails.slice(0, limit) : rawMails;

		let filteredMails = mails;
		if (filter === 'with_attachments') {
			filteredMails = mails.filter((m: any) => summary ? (m._count?.attachments ?? 0) > 0 : (m.attachments && m.attachments.length > 0));
		}

		const enrichedMails = filteredMails.map((m: any) => {
			const attachmentsCount = summary ? (m._count?.attachments ?? 0) : (m.attachments ? m.attachments.length : 0);
			const hasAttachments = attachmentsCount > 0;
			const text = m.text || '';
			const snippet = summary ? (m.snippet || '').slice(0, 200) : text.slice(0, 200);
			const parsedData = summary ? null : parseMail(m.text || '', m.html || '');
			return {
				...m,
				text: summary ? snippet : m.text,
				html: summary ? null : m.html,
				attachments: summary ? [] : (m.attachments || []),
				parsedData,
				hasAttachments,
				attachmentsCount,
				isRead: m.isRead ?? false,
			};
		});

		if (group === 'thread') {
			const threadMap = new Map<string, typeof enrichedMails>();
			for (const mail of enrichedMails) {
				const key = mail.threadId || mail.id;
				const existing = threadMap.get(key);
				if (existing) {
					existing.push(mail);
				} else {
					threadMap.set(key, [mail]);
				}
			}

			const grouped = Array.from(threadMap.values()).map((thread) => {
				thread.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
				const newest = thread[0];
				const hasUnread = thread.some((m) => !m.isRead);
				const totalAttachments = thread.reduce((sum, m: any) => sum + (summary ? (m.attachmentsCount || 0) : (m.attachments?.length || 0)), 0);
				const allAssigned = thread.every((m) => !!m.orderId);
				const anyAssigned = thread.some((m) => !!m.orderId);
				return {
					...newest,
					threadCount: thread.length,
					threadHasUnread: hasUnread,
					threadTotalAttachments: totalAttachments,
					threadAllAssigned: allAssigned,
					threadAnyAssigned: anyAssigned,
					isRead: !hasUnread ? true : newest.isRead,
				};
			});

			grouped.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
			if (paginate) {
				return NextResponse.json({
					items: grouped,
					page,
					limit,
					hasMore,
				});
			}
			return NextResponse.json(grouped);
		}

		if (paginate) {
			return NextResponse.json({
				items: enrichedMails,
				page,
				limit,
				hasMore,
			});
		}
		return NextResponse.json(enrichedMails);
	} catch (error) {
		if (error instanceof SearchInterruptedError) {
			if (error.reason === 'aborted') {
				// Der Browser hoert nicht mehr zu (Weitertippen, Ordnerwechsel).
				// Kein Fehler, nichts loggen.
				return new NextResponse(null, { status: 499 });
			}
			console.warn(`[mails] Suche nach ${SEARCH_STATEMENT_TIMEOUT_MS / 1000}s abgebrochen (statement_timeout)`);
			return NextResponse.json({
				error: 'search_timeout',
				message: `Die Suche hat laenger als ${Math.round(SEARCH_STATEMENT_TIMEOUT_MS / 1000)} Sekunden gedauert und wurde abgebrochen. Bitte den Suchbegriff eingrenzen.`,
			}, { status: 504 });
		}
		console.error('Failed to fetch mails:', error instanceof Error ? error.message : String(error));
		return NextResponse.json({ error: 'Failed to fetch mails' }, { status: 500 });
	}
}
