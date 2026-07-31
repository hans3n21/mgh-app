import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import Navigation from '@/components/Navigation';
import SessionProvider from '@/components/SessionProvider';
import GlobalMobileNav from '@/components/GlobalMobileNav';
import FeedbackButton from '@/components/FeedbackButton';
import { ensureDailyBackup } from '@/lib/backup-auto';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/signin');
  }

  // Automatisches tägliches Backup (non-blocking, läuft im Hintergrund)
  // Nur im Production-Modus oder wenn explizit aktiviert
  if (process.env.NODE_ENV === 'production' || process.env.ENABLE_AUTO_BACKUP === 'true') {
    ensureDailyBackup().catch((error) => {
      // Silent fail - Backup-Fehler sollten die App nicht blockieren
      console.error('Auto-backup error:', error);
    });
  }

  // Daten für CreateOrderButton laden
  const [customersRaw, users] = await Promise.all([
    prisma.customer.findMany({
      select: { id: true, name: true, email: true, phone: true },
      orderBy: { name: 'asc' },
    }),
    prisma.user.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ]);
  
  // Transformiere null zu undefined für Navigation-Komponente
  const customers = customersRaw.map(c => ({
    id: c.id,
    name: c.name,
    email: c.email ?? undefined,
    phone: c.phone ?? undefined,
  }));

  return (
    <SessionProvider session={session}>
      <div className="min-h-screen min-w-0 bg-slate-950 text-slate-100 overflow-x-hidden">
        <Navigation user={session.user} customers={customers} users={users} />
        {/* px-3 am Handy statt px-4: jeder Pixel hier kostet doppelt, weil die
            Seiten-Kaesten und Inhaltskarten darin nochmal polstern. */}
        <main className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-8 py-3 sm:py-4">
          {children}
        </main>
        <GlobalMobileNav />
        <FeedbackButton />
      </div>
    </SessionProvider>
  );
}
