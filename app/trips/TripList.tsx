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
  onDelete,
}: {
  trip: TripCard;
  today: string;
  tone: 'active' | 'upcoming' | 'past';
  onDelete: (trip: TripCard) => void;
}) {
  const dayOfTrip = daysBetween(trip.startDate, today) + 1;
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <li className={`${styles.card} ${tone === 'past' ? styles.cardPast : ''}`}>
      {/* Kept out of the card's main click target: a destructive action should
          not sit next to the thing you tap to open the trip. */}
      <div className={styles.cardMenu}>
        <button
          type="button"
          className={styles.menuBtn}
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={`Options for ${trip.destination}`}
          aria-expanded={menuOpen}
        >
          ⋯
        </button>
        {menuOpen && (
          <>
            <button
              type="button"
              className={styles.menuBackdrop}
              onClick={() => setMenuOpen(false)}
              aria-label="Close menu"
            />
            <div className={styles.menu}>
              <button
                type="button"
                className={styles.menuItem}
                onClick={() => {
                  setMenuOpen(false);
                  onDelete(trip);
                }}
              >
                Delete trip
              </button>
            </div>
          </>
        )}
      </div>

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

/**
 * Deleting a trip is rare, deliberate, and the itinerary took minutes to
 * generate — so this asks once, plainly. Undo suits high-frequency actions like
 * archiving mail; here a dialog is what people expect and simpler to reason
 * about. The row is still soft-deleted server-side, so a mis-click stays
 * recoverable from the database for a day.
 */
function ConfirmDelete({
  trip,
  busy,
  onConfirm,
  onCancel,
}: {
  trip: TripCard;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className={styles.dialogBackdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-title"
      onClick={onCancel}
    >
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <h2 id="delete-title" className={styles.dialogTitle}>
          Delete this trip?
        </h2>
        <p className={styles.dialogBody}>
          <strong className={styles.dialogDest}>{trip.destination}</strong>,{' '}
          {formatRange(trip.startDate, trip.endDate)}. Its itinerary and packing list will be
          removed. This can&apos;t be undone.
        </p>
        <div className={styles.dialogActions}>
          <button type="button" className={styles.dialogCancel} onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className={styles.dialogDelete}
            onClick={onConfirm}
            disabled={busy}
            autoFocus
          >
            {busy ? 'Deleting…' : 'Delete trip'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TripList({ active, upcoming, past, today }: Props) {
  // Past trips are history, not a to-do list — collapsed unless asked for.
  const [showPast, setShowPast] = useState(false);
  const [pending, setPending] = useState<TripCard | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleted, setDeleted] = useState<Set<string>>(new Set());

  async function confirmDelete() {
    if (!pending) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/plans/${pending.id}/archive`, { method: 'POST' });
      if (res.ok) setDeleted((s) => new Set(s).add(pending.id));
    } finally {
      setBusy(false);
      setPending(null);
    }
  }

  const visible = (list: TripCard[]) => list.filter((t) => !deleted.has(t.id));
  const [a, u, p] = [visible(active), visible(upcoming), visible(past)];

  return (
    <>
      {a.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Happening now</h2>
          <ul className={styles.list}>
            {a.map((t) => (
              <Card key={t.id} trip={t} today={today} tone="active" onDelete={setPending} />
            ))}
          </ul>
        </section>
      )}

      {u.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Upcoming</h2>
          <ul className={styles.list}>
            {u.map((t) => (
              <Card key={t.id} trip={t} today={today} tone="upcoming" onDelete={setPending} />
            ))}
          </ul>
        </section>
      )}

      {p.length > 0 && (
        <section className={styles.section}>
          <button
            type="button"
            className={styles.pastToggle}
            onClick={() => setShowPast((v) => !v)}
            aria-expanded={showPast}
          >
            <span className={showPast ? styles.caretOpen : styles.caret}>›</span>
            Past trips ({p.length})
          </button>
          {showPast && (
            <ul className={styles.list}>
              {p.map((t) => (
                <Card key={t.id} trip={t} today={today} tone="past" onDelete={setPending} />
              ))}
            </ul>
          )}
        </section>
      )}

      {pending && (
        <ConfirmDelete
          trip={pending}
          busy={busy}
          onConfirm={confirmDelete}
          onCancel={() => setPending(null)}
        />
      )}
    </>
  );
}
