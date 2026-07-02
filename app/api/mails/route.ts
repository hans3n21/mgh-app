import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { parseMail } from '@/lib/mail/parseMail';
import { auth } from '@/lib/auth';
import { TRASH_FOLDER_CANDIDATES } from '@/lib/mail/folders';

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
			where.OR = [
				{ subject:   { contains: q, mode: 'insensitive' } },
				{ fromEmail: { contains: q, mode: 'insensitive' } },
				{ fromName:  { contains: q, mode: 'insensitive' } },
				{ toEmail:   { contains: q, mode: 'insensitive' } },
				{ text:      { contains: q, mode: 'insensitive' } },
			];
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
		const rawMails: any[] = summary
			? await prisma.mail.findMany({
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
			: await prisma.mail.findMany({
				where,
				orderBy: { date: 'desc' },
				include: { attachments: true, order: { select: { id: true, title: true } } },
				skip: paginate ? skip : undefined,
				take,
			});
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
		console.error('Failed to fetch mails:', error instanceof Error ? error.message : String(error));
		return NextResponse.json({ error: 'Failed to fetch mails' }, { status: 500 });
	}
}
