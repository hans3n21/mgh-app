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
	language: z.enum(['de', 'en']).optional(),
	mailId: z.string().optional(),
	accountId: z.string().optional(),
});

async function getAccountProfile(accountId?: string) {
	if (!accountId) return null;
	try {
		return await prisma.mailAccountProfile.findUnique({ where: { mailAccountId: accountId } });
	} catch { return null; }
}

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

		const langLabel = body.language === 'en' ? 'English' : 'Deutsch';

		const defaultSystemPrompt = `Du bist ein hilfreicher Assistent in einem Handwerksbetrieb (Gitarrenbau / Instrumentenbau).
Fasse eingehende Kundenanfragen oder Auftragsdetails übersichtlich zusammen.

Antworte immer auf ${langLabel} und formatiere deine Antwort mit Markdown:
- Nutze **## Überschriften** für Hauptbereiche
- Nutze **Bullet-Listen** (- Punkt) für Spezifikationen, Teile und Details
- Nutze **fetten Text** für wichtige Werte

Strukturiere die Zusammenfassung so:
## Kurzzusammenfassung
Ein oder zwei Sätze was der Kunde möchte.

## Spezifikationen / Teile
- Alle genannten Bauteile, Maße, Farben, Materialien als Bullet-Liste
- Falls keine konkreten Teile genannt: Allgemeine Wünsche auflisten

## Wichtige Details
- Besondere Wünsche, Deadlines, Zahlungsinfos, Lieferadressen

## Offene Fragen
- Liste alle Punkte auf die noch unklar sind oder auf eine Antwort warten
- Falls der Kunde selbst Fragen stellt, liste sie hier auf
- Falls nichts offen ist: diesen Abschnitt weglassen

Wenn kein Gitarren- oder Instrumentenbezug erkennbar ist, passe die Struktur sinnvoll an (z.B. ## Anliegen, ## Details, ## Offene Fragen).
Lasse Abschnitte weg die keine relevanten Informationen enthalten.`;

		let systemPrompt = defaultSystemPrompt;
		if (profile?.aiSystemPrompt) {
			systemPrompt = `${profile.aiSystemPrompt}\n\nFasse die folgende E-Mail strukturiert zusammen. Nutze Markdown-Formatierung. Antworte auf ${langLabel}.`;
		}
		if (profile?.backgroundInfo) {
			systemPrompt += `\n\nHintergrundwissen: ${profile.backgroundInfo}`;
		}

		const aiResult = await callAI({
			systemPrompt,
			userPrompt: `Fasse diese E-Mail zusammen:\n\n${anonymizedText}`,
			temperature: 0.3,
		});

		if (!aiResult.configured) {
			return NextResponse.json(
				{ error: aiResult.reason, fallback: false, summary: null },
				{ status: 503 }
			);
		}

		const summary = deanonymizeText(aiResult.text, tokenMap);
		return NextResponse.json({ summary, language: body.language || null, source: 'ai' });
	} catch (error) {
		if (error instanceof z.ZodError) {
			return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 });
		}
		return NextResponse.json(
			{ error: 'Internal server error', details: error instanceof Error ? error.message : String(error), fallback: true, summary: null },
			{ status: 500 }
		);
	}
}
