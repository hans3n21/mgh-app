import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { stripQuotedContent } from '@/lib/mail/stripQuotedContent';

interface RouteParams { params: Promise<{ id: string }> }

const CONTEXT_CHARS = 120;
const MAX_RESULTS = 50;
// DB match is on raw text (incl. quoted history), so over-fetch candidates
// before filtering down to fresh-content-only matches.
const CANDIDATE_LIMIT = 300;

function countOccurrences(source: string, query: string): number {
	if (!source || !query) return 0;
	const lower = source.toLowerCase();
	const lowerQuery = query.toLowerCase();
	let count = 0;
	let cursor = 0;
	while (true) {
		const found = lower.indexOf(lowerQuery, cursor);
		if (found === -1) break;
		count++;
		cursor = found + lowerQuery.length;
	}
	return count;
}

/** Extract a ±CONTEXT_CHARS window around the first match, trimmed to word boundaries, split into highlight segments. */
function buildSnippet(source: string, query: string) {
	if (!source || !query) return null;
	const lower = source.toLowerCase();
	const lowerQuery = query.toLowerCase();
	const idx = lower.indexOf(lowerQuery);
	if (idx === -1) return null;

	let start = Math.max(0, idx - CONTEXT_CHARS);
	let end = Math.min(source.length, idx + query.length + CONTEXT_CHARS);
	if (start > 0) {
		const spaceAfterStart = source.indexOf(' ', start);
		if (spaceAfterStart !== -1 && spaceAfterStart < idx) start = spaceAfterStart + 1;
	}
	if (end < source.length) {
		const spaceBeforeEnd = source.lastIndexOf(' ', end);
		if (spaceBeforeEnd !== -1 && spaceBeforeEnd > idx + query.length) end = spaceBeforeEnd;
	}

	const excerpt = source.slice(start, end);
	const lowerExcerpt = excerpt.toLowerCase();
	const segments: { text: string; match: boolean }[] = [];
	let cursor = 0;
	while (cursor < excerpt.length) {
		const found = lowerExcerpt.indexOf(lowerQuery, cursor);
		if (found === -1) {
			segments.push({ text: excerpt.slice(cursor), match: false });
			break;
		}
		if (found > cursor) segments.push({ text: excerpt.slice(cursor, found), match: false });
		segments.push({ text: excerpt.slice(found, found + query.length), match: true });
		cursor = found + query.length;
	}

	return {
		truncatedStart: start > 0,
		truncatedEnd: end < source.length,
		segments,
	};
}

export async function GET(req: NextRequest, { params }: RouteParams) {
	try {
		const session = await auth();
		if (!session?.user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const { id } = await params;
		const { searchParams } = new URL(req.url);
		const q = (searchParams.get('q') || '').trim();

		if (!q) {
			return NextResponse.json({ query: '', results: [] });
		}

		const customer = await prisma.customer.findUnique({
			where: { id },
			select: { id: true, email: true },
		});
		if (!customer) {
			return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
		}

		// Scope by email, not just customerId: most mails are only ever linked
		// to a customer via matching sender/recipient address, not the FK.
		const scope: Array<Record<string, unknown>> = [{ customerId: customer.id }];
		if (customer.email) {
			scope.push({ fromEmail: { equals: customer.email, mode: 'insensitive' } });
			scope.push({ toEmail: { equals: customer.email, mode: 'insensitive' } });
		}

		const candidates = await prisma.mail.findMany({
			where: {
				isDeleted: false,
				OR: scope,
				AND: {
					OR: [
						{ subject: { contains: q, mode: 'insensitive' } },
						{ text: { contains: q, mode: 'insensitive' } },
					],
				},
			},
			orderBy: { date: 'desc' },
			take: CANDIDATE_LIMIT,
			select: {
				id: true,
				subject: true,
				text: true,
				date: true,
				folder: true,
				orderId: true,
				fromEmail: true,
				fromName: true,
				toEmail: true,
			},
		});

		// A long reply thread quotes the entire prior conversation in every
		// message, so a naive text search hits the same quoted paragraph once
		// per reply. Match only against each mail's own fresh content (plus
		// subject) so a thread shows up once, at the mail that actually says it.
		const results = candidates
			.map((mail) => {
				const { freshContent } = stripQuotedContent(mail.text || '');
				const snippet = buildSnippet(freshContent, q) ?? buildSnippet(mail.subject || '', q);
				const matchCount = countOccurrences(freshContent, q) + countOccurrences(mail.subject || '', q);
				return {
					id: mail.id,
					subject: mail.subject,
					date: mail.date,
					folder: mail.folder,
					orderId: mail.orderId,
					fromEmail: mail.fromEmail,
					fromName: mail.fromName,
					toEmail: mail.toEmail,
					snippet,
					matchCount,
				};
			})
			.filter((result) => result.matchCount > 0)
			.slice(0, MAX_RESULTS);

		return NextResponse.json({ query: q, results });
	} catch (error) {
		console.error('Failed to search customer mails:', error instanceof Error ? error.message : String(error));
		return NextResponse.json({ error: 'Failed to search mails' }, { status: 500 });
	}
}
