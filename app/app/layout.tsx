import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import Navigation from '@/components/Navigation';
import SessionProvider from '@/components/SessionProvider';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/signin');
  }

  // Daten für CreateOrderButton laden
  const [customers, users] = await Promise.all([
    prisma.customer.findMany({
      select: { id: true, name: true, email: true, phone: true },
      orderBy: { name: 'asc' },
    }),
    prisma.user.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  return (
    <SessionProvider session={session}>
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <Navigation user={session.user} customers={customers} users={users} />
        <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4">
          {children}
        </main>
      </div>
    </SessionProvider>
  );
}
