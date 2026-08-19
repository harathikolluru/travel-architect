// Candidate lookup for manual edits.
//
// The cached scope for a large city is substantial — New York is ~21,000 places
// and a 5 MB JSON blob. Calling scopeDestination() per keystroke meant fetching
// and deserializing that every time, which made the search feel broken. This
// keeps the parsed result in process, so only the first search after a cold
// start pays the cost.

import type { PlaceSpec } from '@travel-architect/contracts';
import { cacheKeyFor, scopeDestination } from '@travel-architect/mcp';
// Registers the Postgres-backed Overpass cache. Without it these routes refetch
// live — 49s for a search, and a hard failure when Overpass rate-limits.
import '@/app/lib/mcp-setup';

interface Entry {
  places: PlaceSpec[];
  loadedAt: number;
}

/** Short — the cache exists to survive a burst of typing, not to persist. */
const TTL_MS = 10 * 60 * 1000;
const MAX_RESULTS = 20;

const memo = new Map<string, Entry>();

async function load(destination: string): Promise<PlaceSpec[]> {
  const key = cacheKeyFor(destination);
  const hit = memo.get(key);
  if (hit && Date.now() - hit.loadedAt < TTL_MS) return hit.places;

  // tripDays only sizes the viability gate, which we ignore here.
  const scope = await scopeDestination(destination, 1);
  const places = scope ? [...scope.attractions, ...scope.restaurants] : [];

  // One destination at a time is plenty; these blobs are large.
  memo.clear();
  memo.set(key, { places, loadedAt: Date.now() });
  return places;
}

export async function findCandidates(
  destination: string,
  query: string,
  opts: { category?: 'attraction' | 'restaurant' } = {},
): Promise<PlaceSpec[]> {
  const all = await load(destination);
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return [];

  const pool = opts.category ? all.filter((p) => p.category === opts.category) : all;

  return pool
    .filter((p) => p.name.toLowerCase().includes(needle))
    // Names that start with the query first — closer to what was typed.
    .sort((a, b) => {
      const aStarts = a.name.toLowerCase().startsWith(needle) ? 0 : 1;
      const bStarts = b.name.toLowerCase().startsWith(needle) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
      return a.name.length - b.name.length;
    })
    .slice(0, MAX_RESULTS);
}

/** Exact lookup for the add endpoint, so it does not re-parse the blob either. */
export async function findCandidateById(
  destination: string,
  externalId: string,
): Promise<PlaceSpec | undefined> {
  const all = await load(destination);
  return all.find((p) => p.externalId === externalId);
}
