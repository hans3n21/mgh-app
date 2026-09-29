import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { scheduleMailAnalysis } from '@/lib/mail-ai/background';
import { readMailAiConfig } from '@/lib/mail-ai/client';
import { readModelConfig } from '@/lib/ai-training/ollama';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Hintergrundpruefung sofort anstossen (sonst erst nach dem naechsten Sync mit
// neuen Mails). Prueft die Mails der letzten 24 Stunden, eine nach der anderen.
export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 });
  if (!['admin', 'admin_no_feedback'].includes(session.user.role)) return NextResponse.json({ error: 'Nur für Admins' }, { status: 403 });
  const [pii, model] = await Promise.all([readMailAiConfig(true), readModelConfig()]);
  if (!pii.enabled && !model.enabled)
    return NextResponse.json({ error: 'Weder Analysedienst noch Sprachmodell ist aktiviert. Bitte zuerst aktivieren und speichern.' }, { status: 409 });
  scheduleMailAnalysis();
  return NextResponse.json({ started: true, pii: pii.enabled, suggestions: model.enabled });
}
