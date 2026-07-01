import { NextResponse, type NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

const PUBLIC_API_PREFIXES = [
  '/api/auth',
  '/api/health',
  '/api/settings/telephony/public',
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublicApi = PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  if (isPublicApi) {
    return NextResponse.next();
  }

  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });

  if (token) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const signInUrl = new URL('/signin', request.url);
  signInUrl.searchParams.set('callbackUrl', request.nextUrl.href);
  return NextResponse.redirect(signInUrl);
}

export const config = {
  matcher: ['/app/:path*', '/api/:path*'],
};
