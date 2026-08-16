// Persistent cache for place lookups.
//
// Overpass has no SLA, rate-limits, and takes 30–90s for a city-sized bbox.
// A city's museums and restaurants do not meaningfully change week to week, so
// re-querying on every plan is slow for us and rude to a free public service.

import type { PlaceSpec } from '@travel-architect/contracts';
import type { GeocodeResult } from './geocoding';

/** How long a cached fetch stays usable. */
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface CachedScope {
  geocoding: GeocodeResult;
  restaurants: PlaceSpec[];
  attractions: PlaceSpec[];
  providers: string[];
}

/**
 * The cache is injected rather than imported so `packages/mcp` stays free of a
 * Prisma dependency — it is a data-source package, not a persistence one.
 */
export interface ScopeCacheStore {
  get(key: string, maxAgeMs: number): Promise<CachedScope | null>;
  set(key: string, value: CachedScope): Promise<void>;
}

let store: ScopeCacheStore | null = null;

export function registerScopeCache(s: ScopeCacheStore): void {
  store = s;
}

/** Case- and whitespace-insensitive, so "Denver, CO " hits the same row. */
export function cacheKeyFor(destination: string): string {
  return destination.trim().toLowerCase().replace(/\s+/g, ' ');
}

export async function readScopeCache(destination: string): Promise<CachedScope | null> {
  if (!store) return null;
  try {
    return await store.get(cacheKeyFor(destination), TTL_MS);
  } catch {
    // A cache failure must never break planning.
    return null;
  }
}

export async function writeScopeCache(
  destination: string,
  value: CachedScope,
): Promise<void> {
  if (!store) return;
  try {
    await store.set(cacheKeyFor(destination), value);
  } catch {
    // Non-fatal — the plan already has its data.
  }
}
