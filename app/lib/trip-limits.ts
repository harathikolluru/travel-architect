/**
 * Trip length and date bounds, shared by the API and the planner form so the
 * two cannot disagree.
 *
 * 14 days is a product ceiling, not a technical one. Each day is generated, so
 * cost and latency scale with length (~8 min and ~$3 at 14 days), and a single
 * destination runs out of geographically distinct neighbourhoods well before
 * three weeks — past that the agent starts revisiting the same areas with
 * weaker stops. Longer trips are usually multi-city anyway, which is deferred.
 */
export { MAX_TRIP_DAYS } from '@travel-architect/contracts';

/** Inclusive day count between two YYYY-MM-DD dates. */
export function tripDays(startISO: string, endISO: string): number {
  const start = Date.parse(`${startISO}T00:00:00.000Z`);
  const end = Date.parse(`${endISO}T00:00:00.000Z`);
  return Math.round((end - start) / 86_400_000) + 1;
}

/** Today in UTC, as YYYY-MM-DD. Used as the earliest selectable date. */
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
