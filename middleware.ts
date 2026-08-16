// Route protection (Bar 6). The landing page and auth endpoints stay public;
// everything that touches a user's trips requires a session.
//
// When no OAuth provider is configured (local dev before you add credentials)
// this lets requests through, so the app is still usable.

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Signed-out visitors land on sign-in, including at the root. The landing page
// stays reachable once authenticated.
const PUBLIC_PATHS = ['/signin', '/api/health'];

function authConfigured(): boolean {
  return Boolean(
    (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) ||
      (process.env.AUTH_MICROSOFT_ENTRA_ID_ID && process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET),
  );
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Never gate framework assets — a redirect here strips the page's CSS and JS.
  if (pathname.startsWith('/_next') || pathname.includes('.')) {
    return NextResponse.next();
  }

  if (!authConfigured()) return NextResponse.next();
  if (PUBLIC_PATHS.includes(pathname) || pathname.startsWith('/api/auth')) {
    return NextResponse.next();
  }

  // Presence check only — the session cookie is verified in the route handlers,
  // which run on Node. Middleware runs on the edge, where the Prisma adapter
  // is unavailable.
  const hasSession =
    req.cookies.has('authjs.session-token') || req.cookies.has('__Secure-authjs.session-token');

  if (!hasSession) {
    const url = new URL('/signin', req.url);
    // Return them to whatever they asked for, including '/'.
    url.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Skip Next internals and any path with a file extension.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.).*)'],
};
