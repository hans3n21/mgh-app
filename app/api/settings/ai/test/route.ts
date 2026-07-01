import { NextResponse } from 'next/server';
import { callAI } from '@/lib/ai/chat';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await callAI({
      systemPrompt: 'Du bist ein hilfreicher Assistent.',
      userPrompt: 'Antworte nur mit "OK".',
      temperature: 0,
    });

    if (!result.configured) {
      return NextResponse.json({ ok: false, error: result.reason }, { status: 400 });
    }

    return NextResponse.json({ ok: true, model: 'configured', response: result.text });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Fehler beim Test' }, { status: 500 });
  }
}
