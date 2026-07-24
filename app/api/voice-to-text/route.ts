import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const whisperUrl = process.env.WHISPER_API_URL || 'http://localhost:9000';

    // Check if Whisper is configured
    if (!whisperUrl) {
      return NextResponse.json(
        { error: 'Whisper API not configured. Set WHISPER_API_URL in .env' },
        { status: 503 }
      );
    }

    // Get the audio file from the request
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File;

    if (!audioFile) {
      return NextResponse.json(
        { error: 'No audio file provided' },
        { status: 400 }
      );
    }

    // Prepare form data for Whisper API
    const whisperFormData = new FormData();
    whisperFormData.append('audio_file', audioFile);

    // Language from request or default to German
    const language = formData.get('language') || 'de';

    // Call Whisper API
    const whisperResponse = await fetch(
      `${whisperUrl}/asr?task=transcribe&language=${language}&output=json`,
      {
        method: 'POST',
        body: whisperFormData,
      }
    );

    if (!whisperResponse.ok) {
      const errorText = await whisperResponse.text();
      console.error('Whisper API error:', whisperResponse.status);
      return NextResponse.json(
        { error: 'Voice-to-text conversion failed', details: errorText },
        { status: whisperResponse.status }
      );
    }

    const result = await whisperResponse.json();
    return NextResponse.json({
      text: result.text || '',
      language: language,
    });

  } catch (error) {
    console.error('❌ Voice-to-text error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
