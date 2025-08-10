import SessionProvider from '@/components/SessionProvider';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider session={null}>
      {children}
    </SessionProvider>
  );
}
