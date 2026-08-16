import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth, signIn } from '@/app/auth';
import styles from './signin.module.css';

const PROVIDERS = [
  {
    id: 'google',
    label: 'Continue with Google',
    envKey: 'AUTH_GOOGLE_ID',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z" />
        <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24z" />
        <path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.6V6.7H1.4a12 12 0 0 0 0 10.8l4-3.1z" />
        <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.7l4 3.1C6.3 6.9 8.9 4.8 12 4.8z" />
      </svg>
    ),
  },
  {
    id: 'microsoft-entra-id',
    label: 'Continue with Microsoft',
    envKey: 'AUTH_MICROSOFT_ENTRA_ID_ID',
    icon: (
      <svg viewBox="0 0 23 23" width="18" height="18" aria-hidden="true">
        <path fill="#F25022" d="M1 1h10v10H1z" />
        <path fill="#7FBA00" d="M12 1h10v10H12z" />
        <path fill="#00A4EF" d="M1 12h10v10H1z" />
        <path fill="#FFB900" d="M12 12h10v10H12z" />
      </svg>
    ),
  },
];

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const session = await auth();
  const { callbackUrl, error } = await searchParams;

  if (session?.user) redirect(callbackUrl ?? '/');

  const available = PROVIDERS.filter((p) => process.env[p.envKey]);

  return (
    <main className={styles.wrap}>
      <div className={styles.card}>
        <Link href="/" className={styles.logo}>✈️ Travel Architect</Link>
        <h1 className={styles.title}>Sign in</h1>
        <p className={styles.sub}>Your trips are saved to your account.</p>

        {error && (
          <p className={styles.error}>
            {error === 'OAuthAccountNotLinked'
              ? 'That email is already registered with a different provider. Use the one you signed up with.'
              : 'Sign-in failed. Please try again.'}
          </p>
        )}

        {available.length === 0 ? (
          <p className={styles.error}>
            No sign-in providers are configured. Set <code>AUTH_GOOGLE_ID</code> /{' '}
            <code>AUTH_GOOGLE_SECRET</code> (see <code>.env.example</code>).
          </p>
        ) : (
          <div className={styles.providers}>
            {available.map((p) => (
              <form
                key={p.id}
                action={async () => {
                  'use server';
                  await signIn(p.id, { redirectTo: callbackUrl ?? '/' });
                }}
              >
                <button type="submit" className={styles.provider}>
                  {p.icon}
                  {p.label}
                </button>
              </form>
            ))}
          </div>
        )}

        <p className={styles.legal}>
          We only use your account to save your itineraries. No posting, no contacts.
        </p>
      </div>
    </main>
  );
}
