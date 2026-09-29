import { promises as fs } from 'fs';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { resolveFilesPath } from '@/lib/files-root';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };

// Screenshots koennen Kundendaten zeigen: nur fuer Admins, wie die Feedbackliste.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (session?.user?.role !== 'admin') return Response.json({ error: 'Zugriff verweigert' }, { status: 403 });

  const { id } = await params;
  const feedback = await prisma.feedback.findUnique({ where: { id }, select: { screenshotPath: true } });
  const absPath = feedback?.screenshotPath ? resolveFilesPath(feedback.screenshotPath) : null;
  const bytes = absPath ? await fs.readFile(absPath).catch(() => null) : null;
  if (!feedback?.screenshotPath || !bytes) return Response.json({ error: 'Kein Screenshot' }, { status: 404 });

  const extension = feedback.screenshotPath.split('.').pop() ?? '';
  return new Response(new Uint8Array(bytes), {
    headers: { 'Content-Type': TYPES[extension] ?? 'application/octet-stream', 'Cache-Control': 'private, max-age=3600' },
  });
}
