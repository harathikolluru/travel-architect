// Saved trips.
//
// Plans live in Postgres against the signed-in user and are never deleted, but
// until this page existed the only route back to one was the URL you happened
// to be on. Sign out or close the tab and a four-minute agent run became
// unreachable.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma } from '@travel-architect/db';
import { auth, authEnabled } from '@/app/auth';
import AuthNav from '../AuthNav';
import TripList, { type TripCard } from './TripList';
import styles from './trips.module.css';

export const runtime = 'nodejs';

/** Dates are stored at UTC midnight, so compare on the date part only. */
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function TripsPage() {
  let userId: string | null = null;

  if (authEnabled()) {
    const session = await auth();
    if (!session?.user?.id) redirect('/signin?callbackUrl=%2Ftrips');
    userId = session.user.id;
  } else {
    const demo = await prisma.user.findUnique({
      where: { email: 'demo@travel-architect.local' },
    });
    userId = demo?.id ?? null;
  }

  // A plan with no days is one whose agent run never finished. Listing those
  // just reminds people something broke, so only completed plans appear here.
  const rows = userId
    ? await prisma.tripPlan.findMany({
        where: { userId, days: { some: {} } },
        orderBy: { startDate: 'asc' },
        include: { days: { select: { id: true, isComplete: true } } },
      })
    : [];

  const today = isoDate(new Date());

  const trips: TripCard[] = rows.map((t) => ({
    id: t.id,
    destination: t.destination,
    startDate: isoDate(t.startDate),
    endDate: isoDate(t.endDate),
    pace: t.pace.toLowerCase(),
    dayCount: t.days.length,
    doneCount: t.days.filter((d) => d.isComplete).length,
  }));

  const active = trips.filter((t) => t.startDate <= today && t.endDate >= today);
  const upcoming = trips.filter((t) => t.startDate > today);
  // Most recent first — the trip you just returned from is the one you'd revisit.
  const past = trips.filter((t) => t.endDate < today).reverse();

  const hasAny = trips.length > 0;

  return (
    <main className={styles.wrap}>
      <AuthNav />

      <div className={styles.inner}>
        <header className={styles.header}>
          <h1 className={styles.title}>Your trips</h1>
          <Link href="/planner" className={styles.newBtn}>
            + Plan a new trip
          </Link>
        </header>

        {!hasAny ? (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>No trips yet</p>
            <p className={styles.emptyBody}>
              Plan one and it will be saved here — you can come back to it any time.
            </p>
            <Link href="/planner" className={styles.newBtn}>
              Plan my first trip →
            </Link>
          </div>
        ) : (
          <TripList active={active} upcoming={upcoming} past={past} today={today} />
        )}
      </div>
    </main>
  );
}
