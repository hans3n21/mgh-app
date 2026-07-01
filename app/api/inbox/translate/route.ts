import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { anonymizeText, deanonymizeText } from '@/lib/pii/anonymize';
import { prisma } from '@/lib/prisma';
import { callAI } from '@/lib/ai/chat';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
	text: z.string().min(1),
	sourceLang: z.enum(['de', 'en']).optional(),
	targetLang: z.enum(['de', 'en']),
	mailId: z.string().optional(),
	accountId: z.string().optional(),
});

async function getAccountProfile(accountId?: string) {
	if (!accountId) return null;
	try {
		return await prisma.mailAccountProfile.findUnique({ where: { mailAccountId: accountId } });
	} catch { return null; }
}

const LANG_LABELS: Record<string, string> = {
	de: 'Deutsch',
	en: 'Englisch',
};

export async function POST(request: NextRequest) {
	try {
		const session = await auth();
		if (!session) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const bodyRaw = await request.json().catch(() => ({}));
		const body = Body.parse(bodyRaw);
		const profile = await getAccountProfile(body.accountId);

		const { anonymizedText, tokenMap } = await anonymizeText(body.text, body.mailId);

		const targetLabel = LANG_LABELS[body.targetLang] || body.targetLang;
		let systemPrompt = `Du bist ein professioneller Übersetzer. Übersetze die E-Mail präzise nach ${targetLabel}. Behalte den originalen Ton und Stil bei.`;
		if (profile?.aiSystemPrompt) {
			systemPrompt = `${profile.aiSystemPrompt}\n\nÜbersetze die folgende E-Mail nach ${targetLabel}.`;
		}
		if (profile?.backgroundInfo) {
			systemPrompt += `\n\nHintergrundwissen: ${profile.backgroundInfo}`;
		}

		const aiResult = await callAI({
			systemPrompt,
			userPrompt: `Übersetze diese E-Mail nach ${targetLabel}:\n\n${anonymizedText}`,
			temperature: 0.2,
		});

		if (!aiResult.configured) {
			return NextResponse.json(
				{ error: aiResult.reason, fallback: false, text: null },
				{ status: 503 }
			);
		}

		const text = deanonymizeText(aiResult.text, tokenMap);
		return NextResponse.json({ text, sourceLang: body.sourceLang || null, targetLang: body.targetLang, source: 'ai' });
	} catch (error) {
		if (error instanceof z.ZodError) {
			return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 });
		}
		return NextResponse.json(
			{ error: 'Internal server error', details: error instanceof Error ? error.message : String(error), fallback: true, text: null },
			{ status: 500 }
		);
	}
}
