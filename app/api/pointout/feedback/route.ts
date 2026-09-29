import { auth } from '@/lib/auth';
import { pointOutHandlers } from '@/lib/pointout-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: 'Bitte anmelden.' }, { status: 401 });
  return pointOutHandlers(session.user.id).feedback(request);
}
