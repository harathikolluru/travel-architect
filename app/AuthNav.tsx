import Link from 'next/link';
import { connection } from 'next/server';
import { auth, authEnabled, signOut } from '@/app/auth';
import styles from './auth-nav.module.css';

/**
 * Top-right account controls.
 *
 * Must render per-request: the OAuth env vars are injected by the Container App
 * at runtime, not at image build time. Prerendering this baked "Sign-in not
 * configured" into the static HTML of the deployed landing page.
 */
export default async function AuthNav() {
  await connection();

  if (!authEnabled()) {
    return (
      <nav className={styles.nav}>
        <span className={styles.hint} title="Set AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET in .env">
          Sign-in not configured
        </span>
      </nav>
    );
  }

  const session = await auth();

  if (!session?.user) {
    return (
      <nav className={styles.nav}>
        <Link href="/signin" className={styles.signIn}>
          Sign in
        </Link>
      </nav>
    );
  }

  return (
    <nav className={styles.nav}>
      <Link href="/trips" className={styles.tripsLink}>
        Your trips
      </Link>
      <span className={styles.who}>{session.user.name ?? session.user.email}</span>
      <form
        action={async () => {
          'use server';
          await signOut({ redirectTo: '/' });
        }}
      >
        <button type="submit" className={styles.signOut}>
          Sign out
        </button>
      </form>
    </nav>
  );
}
