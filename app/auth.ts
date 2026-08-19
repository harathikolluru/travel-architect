// Auth.js v5 — OAuth only (Google, Microsoft Entra ID).
//
// AUTH_SECRET and AUTH_URL are provisioned by the student platform; only the
// provider client IDs/secrets need setting. A provider with no credentials is
// simply not registered, so the app runs with whatever subset is configured.

import NextAuth from 'next-auth';
import { PrismaAdapter } from '@auth/prisma-adapter';
import Google from 'next-auth/providers/google';
import MicrosoftEntraID from 'next-auth/providers/microsoft-entra-id';
import { prisma } from '@travel-architect/db';
import type { Provider } from 'next-auth/providers';

function configuredProviders(): Provider[] {
  const providers: Provider[] = [];

  if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
    providers.push(
      Google({
        clientId: process.env.AUTH_GOOGLE_ID,
        clientSecret: process.env.AUTH_GOOGLE_SECRET,
        allowDangerousEmailAccountLinking: true,
        authorization: { params: { prompt: 'select_account' } },
      }),
    );
  }

  if (process.env.AUTH_MICROSOFT_ENTRA_ID_ID && process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET) {
    const tenant = process.env.AUTH_MICROSOFT_ENTRA_ID_TENANT?.trim();
    providers.push(
      MicrosoftEntraID({
        clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
        clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
        // Omitting `issuer` leaves the provider on its 'common' default, which
        // accepts both work/school and personal Microsoft accounts. Only pin an
        // issuer when a specific tenant is requested.
        ...(tenant ? { issuer: `https://login.microsoftonline.com/${tenant}/v2.0` } : {}),
        allowDangerousEmailAccountLinking: true,
      }),
    );
  }

  return providers;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: configuredProviders(),
  session: { strategy: 'database' },
  pages: { signIn: '/signin' },
  callbacks: {
    session({ session, user }) {
      if (session.user) session.user.id = user.id;
      return session;
    },
  },
  trustHost: true,
});

/** True when at least one OAuth provider is configured. */
export function authEnabled(): boolean {
  return configuredProviders().length > 0;
}
