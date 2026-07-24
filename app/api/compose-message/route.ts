import { NextRequest, NextResponse } from 'next/server';
import { anonymizeText, deanonymizeText } from '@/lib/pii/anonymize';
import { prisma } from '@/lib/prisma';
import { callAI } from '@/lib/ai/chat';
import { auth } from '@/lib/auth';
import {
  buildPriceValidationHints,
  formatPriceItem,
  isPickguardInquiry,
  isPriceQuestion,
  matchPickguardOfferPrice,
  matchPriceItems,
  type MatchedPriceItem,
  type PricePromptItem,
} from '@/lib/ai/price-matcher';

async function getAccountProfile(accountId?: string) {
  if (!accountId) return null;
  try {
    return await prisma.mailAccountProfile.findUnique({ where: { mailAccountId: accountId } });
  } catch { return null; }
}

// Pickguard "S/M/L/XL"-Preiseintraege buendeln 3 Materialstufen (Standard/Sparkle/
// Tortoise-Pearl-Special) in einer einzigen priceText-Zeile. Ohne die Groessen-/
// Materialstufen-Erkennung aus matchPickguardOfferPrice() weiter unten wuerde hier
// die komplette mehrdeutige Zeile in den Prompt wandern und das Modell muesste raten,
// welcher der 3 Preise zum genannten Material passt (siehe app/api/ai/transform/route.ts).
function isPickguardSizePriceItem(item: PricePromptItem) {
  return /^(xl|l|m|s)\s+pickguard$/i.test((item.label ?? '').trim());
}

function buildPricePromptSection(priceHits: MatchedPriceItem[], hasPriceQuestion: boolean) {
  if (priceHits.length > 0) {
    const priceText = priceHits
      .map((hit, i) => {
        const categoryPath = [hit.item.mainCategory, hit.item.category].filter(Boolean).join(' / ');
        const description = hit.item.description?.trim() ? ` - ${hit.item.description.trim()}` : '';
        const price = hit.recommendedPriceText ?? formatPriceItem(hit.item);
        const note = hit.contextNote ? `\n   Hinweis: ${hit.contextNote}` : '';
        return `${i + 1}. ${hit.item.label}${categoryPath ? ` (${categoryPath})` : ''}: ${price}${description}${note}`;
      })
      .join('\n');

    return (
      `\n\nAktuelle Preislisten-Eintraege aus PriceItem:\n${priceText}\n` +
      'Verwende fuer konkrete Preise ausschliesslich diese aktiven PriceItem-Eintraege. ' +
      'Leite Preise nicht aus Hintergrundwissen, alten Prompt-Texten oder KnowledgeEntry ab. ' +
      'Wenn die passende Position oder wichtige Details fehlen, frage nach statt einen Preis zu raten.'
    );
  }

  if (hasPriceQuestion) {
    return (
      '\n\nEs wurde eine Preisfrage erkannt, aber keine passende aktive PriceItem-Position gefunden. ' +
      'Nenne keinen geratenen Preis und leite keinen Preis aus Hintergrundwissen oder KnowledgeEntry ab. ' +
      'Frage nach den fehlenden Details oder verweise auf eine individuelle Pruefung.'
    );
  }

  return '';
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { text, mode = 'reply', customerName, orderTitle, language = 'de', mailId, accountId, originalMailText, userName } = body;

    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }

    const priceLookupText = `${text} ${typeof originalMailText === 'string' ? originalMailText : ''}`;
    const hasPriceQuestion = isPriceQuestion(priceLookupText);
    const shouldPreparePickguardOffer = isPickguardInquiry(priceLookupText);
    const shouldLookupPrices = hasPriceQuestion || shouldPreparePickguardOffer;
    const priceItemsPromise: Promise<PricePromptItem[]> = shouldLookupPrices
      ? prisma.priceItem.findMany({
          where: { active: true },
          orderBy: [
            { mainCategory: 'asc' },
            { category: 'asc' },
            { label: 'asc' },
          ],
          select: {
            id: true,
            mainCategory: true,
            category: true,
            label: true,
            description: true,
            unit: true,
            price: true,
            min: true,
            max: true,
            priceText: true,
            active: true,
          },
        })
      : Promise.resolve([]);

    const [profile, priceItems] = await Promise.all([
      getAccountProfile(accountId),
      priceItemsPromise,
    ]);
    let priceHits = shouldLookupPrices ? matchPriceItems(priceLookupText, priceItems) : [];
    if (shouldPreparePickguardOffer) {
      const pickguardRecommendation = matchPickguardOfferPrice(priceLookupText, priceItems);
      if (pickguardRecommendation) {
        priceHits = [
          pickguardRecommendation,
          ...priceHits.filter((hit) => !isPickguardSizePriceItem(hit.item)),
        ];
      }
    }
    const pricePromptSection = buildPricePromptSection(priceHits, hasPriceQuestion);
    const { anonymizedText, tokenMap } = await anonymizeText(text, mailId);

    // originalMailText ebenfalls anonymisieren (gleiche mailId → gleiche Entities)
    let anonymizedOriginal: string | undefined;
    let mergedTokenMap = { ...tokenMap };
    if (originalMailText && typeof originalMailText === 'string') {
      const { anonymizedText: anonOrig, tokenMap: origMap } = await anonymizeText(originalMailText, mailId);
      anonymizedOriginal = anonOrig;
      // Beide Maps mergen – bullets-Map hat Vorrang bei Konflikten
      mergedTokenMap = { ...origMap, ...tokenMap };
    }

    const langLabel = language === 'en' ? 'English' : 'Deutsch';

    const addContextToken = (label: string, value?: string) => {
      const trimmed = value?.trim();
      if (!trimmed) return null;

      let index = 1;
      let placeholder = `{{${label}_${index}}}`;
      while (mergedTokenMap[placeholder]) {
        index += 1;
        placeholder = `{{${label}_${index}}}`;
      }

      mergedTokenMap[placeholder] = trimmed;
      return placeholder;
    };

    const customerPlaceholder = addContextToken('NAME', customerName);
    const orderPlaceholder = addContextToken('ORDER', orderTitle);
    const userPlaceholder = addContextToken('USER', userName);

    const contextParts: string[] = [];
    if (customerPlaceholder) contextParts.push(`Kunde: ${customerPlaceholder}`);
    if (orderPlaceholder) contextParts.push(`Auftrag: ${orderPlaceholder}`);
    const context = contextParts.length > 0 ? `\n\nKontext: ${contextParts.join(', ')}` : '';

    let systemPrompt: string;
    let userPrompt: string;

    if (mode === 'bullets') {
      // Stichpunkte → fertiger Fließtext für eine E-Mail-Antwort
      const nameRules = [
        customerPlaceholder ? `Sprich den Kunden mit ${customerPlaceholder} an.` : 'Beginne mit einer passenden Anrede.',
        userPlaceholder ? `Schließe mit ${userPlaceholder} als Absender ab (Grußformel + Name).` : 'Keine Grußformel nötig.',
      ].join(' ');

      systemPrompt = profile?.aiSystemPrompt
        ? `${profile.aiSystemPrompt}\n\nFormuliere die folgenden Stichpunkte zu einem professionellen E-Mail-Antworttext auf ${langLabel}. ${nameRules}`
        : `Du bist ein hilfreicher Mitarbeiter in einem Handwerksbetrieb. Formuliere die folgenden Stichpunkte zu einem professionellen, fließenden E-Mail-Antworttext auf ${langLabel}. Schreibe in vollständigen Sätzen. ${nameRules}`;
      if (profile?.backgroundInfo) systemPrompt += `\n\nHintergrundwissen: ${profile.backgroundInfo}`;
      systemPrompt += pricePromptSection;

      const originalContext = anonymizedOriginal
        ? `\n\nZur Orientierung – die ursprüngliche Nachricht des Kunden (nur als Kontext, nicht wiederholen):\n"""\n${anonymizedOriginal.slice(0, 800)}\n"""`
        : '';
      userPrompt = `Formuliere folgende Stichpunkte zu einem professionellen Antworttext:${context}${originalContext}\n\nStichpunkte:\n${anonymizedText}`;
    } else {
      // Standard: Antwort auf eine eingegangene Nachricht verfassen
      systemPrompt = profile?.aiSystemPrompt
        ? `${profile.aiSystemPrompt}\n\nVerfasse eine Antwort auf ${langLabel}. Antworte direkt, ohne Einleitung.`
        : `Du bist ein hilfreicher Mitarbeiter. Verfasse eine professionelle Antwort auf ${langLabel}. Antworte direkt, ohne Einleitung.`;
      if (profile?.backgroundInfo) systemPrompt += `\n\nHintergrundwissen: ${profile.backgroundInfo}`;
      systemPrompt += pricePromptSection;
      userPrompt = `Verfasse eine Antwort auf folgende Nachricht:${context}\n\n${anonymizedText}`;
    }

    const aiResult = await callAI({
      systemPrompt,
      userPrompt,
      temperature: 0.5,
    });

    if (!aiResult.configured) {
      return NextResponse.json(
        { error: aiResult.reason, fallback: false, text: null },
        { status: 503 }
      );
    }

    const rehydrated = deanonymizeText(aiResult.text, mergedTokenMap);
    return NextResponse.json({
      text: rehydrated,
      subject: null,
      originalText: text,
      source: 'ai',
      priceValidation: buildPriceValidationHints(priceHits),
    });

  } catch (error) {
    console.error('Compose-message error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error), fallback: true, text: null },
      { status: 500 }
    );
  }
}
