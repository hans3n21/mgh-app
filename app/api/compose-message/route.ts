import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * API Route für Text-Verschönerung via N8N
 *
 * Nimmt rohen Text (z.B. Stichpunkte) und gibt schön formatierten Text zurück.
 * Nutzt N8N Webhook mit LLM (Claude/GPT/Ollama) für die Transformation.
 */
export async function POST(request: NextRequest) {
  try {
    const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL;

    // Check if N8N is configured
    if (!n8nWebhookUrl) {
      return NextResponse.json(
        {
          error: 'N8N integration not configured',
          fallback: true,
          text: null
        },
        { status: 200 } // Not an error, just not configured
      );
    }

    const body = await request.json();
    const { text, customerName, orderTitle, language = 'de' } = body;

    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: 'Text is required' },
        { status: 400 }
      );
    }

    console.log('📝 Sending text to N8N for composition:', text.slice(0, 100));

    // Call N8N webhook
    const n8nResponse = await fetch(n8nWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        rawText: text,
        customerName: customerName || null,
        orderTitle: orderTitle || null,
        language,
        timestamp: new Date().toISOString(),
      }),
    });

    if (!n8nResponse.ok) {
      const errorText = await n8nResponse.text();
      console.error('❌ N8N webhook error:', n8nResponse.status, errorText);
      return NextResponse.json(
        {
          error: 'Text composition failed',
          details: errorText,
          fallback: true,
          text: null
        },
        { status: n8nResponse.status }
      );
    }

    const result = await n8nResponse.json();
    console.log('✅ N8N composition successful');

    // Expected N8N response format:
    // { formattedText: "...", subject: "..." }
    return NextResponse.json({
      text: result.formattedText || result.text || text,
      subject: result.subject || null,
      originalText: text,
    });

  } catch (error) {
    console.error('❌ Compose-message error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
        fallback: true,
        text: null
      },
      { status: 500 }
    );
  }
}
