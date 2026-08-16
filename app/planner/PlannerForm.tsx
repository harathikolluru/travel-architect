'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import styles from './planner.module.css';

const INTERESTS = ['History', 'Food', 'Art', 'Nature', 'Architecture', 'Nightlife', 'Markets', 'Museums'];
const DIETS = [
  ['', 'No restriction'],
  ['vegetarian', 'Vegetarian'],
  ['vegan', 'Vegan'],
  ['pescatarian', 'Pescatarian'],
  ['halal', 'Halal'],
  ['gluten-free', 'Gluten-free'],
];

export default function PlannerForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const form = new FormData(e.currentTarget);
    const payload = {
      destination: String(form.get('destination') ?? '').trim(),
      startDate: String(form.get('start') ?? ''),
      endDate: String(form.get('end') ?? ''),
      pace: String(form.get('pace') ?? 'moderate'),
      interests: form.getAll('interests').map(String),
      diet: String(form.get('diet') ?? ''),
    };

    setSubmitting(true);
    try {
      const res = await fetch('/api/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Could not start planning');
      router.push(`/itinerary/${body.planId}`);
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={onSubmit}>
      <div className={styles.field}>
        <label htmlFor="destination">Destination</label>
        <input
          id="destination"
          name="destination"
          type="text"
          placeholder="e.g. Denver, Colorado"
          required
        />
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label htmlFor="start">Start date</label>
          <input id="start" name="start" type="date" required />
        </div>
        <div className={styles.field}>
          <label htmlFor="end">End date</label>
          <input id="end" name="end" type="date" required />
        </div>
      </div>

      <div className={styles.field}>
        <label>Pace</label>
        <div className={styles.chips}>
          {['Relaxed', 'Moderate', 'Packed'].map((p) => (
            <label key={p} className={styles.chip}>
              <input
                type="radio"
                name="pace"
                value={p.toLowerCase()}
                defaultChecked={p === 'Moderate'}
              />
              {p}
            </label>
          ))}
        </div>
      </div>

      <div className={styles.field}>
        <label>
          Interests <span className={styles.optional}>(optional)</span>
        </label>
        <div className={styles.chips}>
          {INTERESTS.map((i) => (
            <label key={i} className={styles.chip}>
              <input type="checkbox" name="interests" value={i.toLowerCase()} />
              {i}
            </label>
          ))}
        </div>
      </div>

      <div className={styles.field}>
        <label htmlFor="diet">
          Dietary preference <span className={styles.optional}>(optional)</span>
        </label>
        <select id="diet" name="diet">
          {DIETS.map(([value, label]) => (
            <option key={label} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <button type="submit" className={styles.submit} disabled={submitting}>
        {submitting ? 'Starting…' : 'Generate my itinerary →'}
      </button>
      <p className={styles.note}>
        Planning takes a few minutes — we look up real places, hours, and weather rather than
        guessing.
      </p>
    </form>
  );
}
