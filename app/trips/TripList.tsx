'use client';

import Link from 'next/link';
import { useState } from 'react';
import styles from './trips.module.css';

export interface TripCard {
  id: string;
  destination: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;
  pace: string;
  dayCount: number;
  doneCount: number;
}

interface Props {
  active: TripCard[];
  upcoming: TripCard[];
  past: TripCard[];
  /** Server-computed so it matches the grouping; avoids a client clock skew. */
  today: string;
}

function formatRange(startISO: string, endISO: string): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', timeZone: 'UTC' };
  const start = new Date(`${startISO}T00:00:00Z`);
  const end = new Date(`${endISO}T00:00:00Z`);
  return `${start.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', {
    ...opts,
    year: 'numeric',
  })}`;
}

function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000,
  );
}

/** "in 6 days", "tomorrow", "today" — relative time reads faster than a date. */
function startsIn(today: string, startISO: string): string {
  const d = daysBetween(today, startISO);
  if (d <= 0) return 'starting today';
  if (d === 1) return 'starts tomorrow';
  if (d < 7) return `in ${d} days`;
  if (d < 14) return 'next week';
  return `in ${Math.round(d / 7)} weeks`;
}

function Card({
  trip,
  today,
  tone,
}: {
  trip: TripCard;
  today: string;
  tone: 'active' | 'upcoming' | 'past';
}) {
  const dayOfTrip = daysBetween(trip.startDate, today) + 1;

  return (
    <li className={`${styles.card} ${tone === 'past' ? styles.cardPast : ''}`}>
      <Link href={`/itinerary/${trip.id}`} className={styles.cardLink}>
        <div className={styles.cardMain}>
          <span className={styles.dest}>{trip.destination}</span>
          <span className={styles.dates}>{formatRange(trip.startDate, trip.endDate)}</span>
        </div>

        <div className={styles.tags}>
          {tone === 'active' && (
            <span className={`${styles.tag} ${styles.tagLive}`}>
              Day {Math.min(Math.max(dayOfTrip, 1), trip.dayCount)} of {trip.dayCount}
            </span>
          )}
          {tone === 'upcoming' && (
            <span className={`${styles.tag} ${styles.tagSoon}`}>
              {startsIn(today, trip.startDate)}
            </span>
          )}
          {tone !== 'active' && (
            <span className={styles.tag}>
              {trip.dayCount} {trip.dayCount === 1 ? 'day' : 'days'}
            </span>
          )}
          <span className={styles.tag}>{trip.pace}</span>
          {trip.doneCount > 0 && tone !== 'past' && (
            <span className={`${styles.tag} ${styles.tagDone}`}>
              {trip.doneCount} of {trip.dayCount} done
            </span>
          )}
        </div>
      </Link>
    </li>
  );
}

export default function TripList({ active, upcoming, past, today }: Props) {
  // Past trips are history, not a to-do list — collapsed unless asked for.
  const [showPast, setShowPast] = useState(false);

  return (
    <>
      {active.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Happening now</h2>
          <ul className={styles.list}>
            {active.map((t) => (
              <Card key={t.id} trip={t} today={today} tone="active" />
            ))}
          </ul>
        </section>
      )}

      {upcoming.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Upcoming</h2>
          <ul className={styles.list}>
            {upcoming.map((t) => (
              <Card key={t.id} trip={t} today={today} tone="upcoming" />
            ))}
          </ul>
        </section>
      )}

      {past.length > 0 && (
        <section className={styles.section}>
          <button
            type="button"
            className={styles.pastToggle}
            onClick={() => setShowPast((v) => !v)}
            aria-expanded={showPast}
          >
            <span className={showPast ? styles.caretOpen : styles.caret}>›</span>
            Past trips ({past.length})
          </button>
          {showPast && (
            <ul className={styles.list}>
              {past.map((t) => (
                <Card key={t.id} trip={t} today={today} tone="past" />
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}
