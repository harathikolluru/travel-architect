'use client';

import { useEffect, useRef, useState } from 'react';
import styles from '../itinerary.module.css';

interface Candidate {
  externalId: string;
  name: string;
  address: string | null;
  category: string;
  cuisineTags: string[];
  isIndoor: boolean;
  openingHours: string | null;
  /** Straight-line miles from the centre of this day's existing stops. */
  milesFromDay: number | null;
}

/**
 * Searches the places already fetched for this destination rather than asking
 * the agent to find one. The user knows what they want; the job is to confirm
 * it is real and add it instantly. Everything here still carries an OSM id, so
 * a user-added stop is as verifiable as an agent-chosen one.
 */
export default function AddStop({
  planId,
  dayNumber,
  defaultTime,
  onAdded,
  onCancel,
}: {
  planId: string;
  dayNumber: number;
  defaultTime: string;
  onAdded: (result?: { slotId: string; warning: string }) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState('');
  const [time, setTime] = useState(defaultTime);
  const [results, setResults] = useState<Candidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Debounced so typing does not fire a request per keystroke.
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/plans/${planId}/places/search?q=${encodeURIComponent(query.trim())}` +
            `&dayNumber=${dayNumber}`,
        );
        const body = await res.json();
        if (!cancelled) setResults(body.places ?? []);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, planId, dayNumber]);

  async function add(place: Candidate) {
    setAdding(place.externalId);
    setError(null);
    try {
      const res = await fetch(`/api/plans/${planId}/days/${dayNumber}/slots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ externalId: place.externalId, scheduledTime: time }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Could not add that stop');
      onAdded(
        body.warning
          ? {
              slotId: body.slotId,
              warning:
                body.warning.message +
                (body.warning.hours ? ` Usually ${body.warning.hours}.` : ''),
            }
          : undefined,
      );
    } catch (e) {
      setError((e as Error).message);
      setAdding(null);
    }
  }

  return (
    <div className={styles.addPanel}>
      <div className={styles.addRow}>
        <input
          ref={inputRef}
          type="text"
          className={styles.addSearch}
          placeholder="Search places in this destination…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <input
          type="time"
          className={styles.addTime}
          value={time}
          onChange={(e) => setTime(e.target.value)}
          aria-label="Time"
        />
        <button type="button" className={styles.addCancel} onClick={onCancel}>
          Cancel
        </button>
      </div>

      {error && <p className={styles.addError}>{error}</p>}

      {query.trim().length >= 2 && (
        <ul className={styles.addResults}>
          {searching && results.length === 0 && (
            <li className={styles.addHint}>Searching…</li>
          )}
          {!searching && results.length === 0 && (
            <li className={styles.addHint}>
              No verified places match &ldquo;{query.trim()}&rdquo; here.
            </li>
          )}
          {results.map((p) => (
            <li key={p.externalId}>
              <button
                type="button"
                className={styles.addResult}
                onClick={() => add(p)}
                disabled={adding !== null}
              >
                <span className={styles.addResultName}>
                  {p.category === 'restaurant' ? '🍽️' : '🏛️'} {p.name}
                </span>
                {/* Chains put several identical-looking rows in the list; the
                    address and distance are what tell them apart. */}
                {(p.address || p.milesFromDay !== null) && (
                  <span className={styles.addResultAddr}>
                    {p.milesFromDay !== null && (
                      <span
                        className={
                          p.milesFromDay <= 2 ? styles.distNear : styles.distFar
                        }
                      >
                        {p.milesFromDay < 0.1 ? '<0.1' : p.milesFromDay} mi
                      </span>
                    )}
                    {p.address && (p.milesFromDay !== null ? ` · ${p.address}` : p.address)}
                  </span>
                )}
                <span className={styles.addResultMeta}>
                  {p.openingHours ?? 'Hours unconfirmed'}
                  {p.cuisineTags.length > 0 && ` · ${p.cuisineTags.join(', ')}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
