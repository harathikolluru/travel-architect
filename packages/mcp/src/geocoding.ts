// Nominatim (OSM) geocoding. Free, keyless, destination-agnostic.
// Resolves a destination name to coordinates + a bounding box, which is what
// scopes every downstream Overpass query.

import type { BoundingBox } from '@travel-architect/contracts';

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const UA = 'TravelArchitect/0.1 (capstone project)';

export interface GeocodeResult {
  query: string;
  displayName: string;
  lat: number;
  lng: number;
  boundingBox: BoundingBox;
  /** Nominatim's classification: city, town, village, state, country, … */
  addressType: string;
  /** Longest bbox edge in km — the scale check the clustering logic depends on. */
  spanKm: number;
  provider: 'nominatim';
}

/**
 * The whole product assumes a destination you can cross in a day. A state or
 * country bbox produces Overpass queries that hang and "day clusters" hundreds
 * of kilometres wide, so it is rejected up front rather than half-answered.
 */
export const MAX_DESTINATION_SPAN_KM = 120;

export class DestinationTooLargeError extends Error {
  constructor(
    readonly displayName: string,
    readonly addressType: string,
    readonly spanKm: number,
  ) {
    super(
      `"${displayName}" is a ${addressType} spanning about ${Math.round(spanKm)} km — ` +
        `too large for a single itinerary. Try a specific city instead.`,
    );
    this.name = 'DestinationTooLargeError';
  }
}

function spanOf(b: BoundingBox): number {
  const ns = (b.north - b.south) * 111;
  const ew =
    (b.east - b.west) * 111 * Math.cos(((b.north + b.south) / 2) * (Math.PI / 180));
  return Math.max(ns, Math.abs(ew));
}

/**
 * Nominatim asks for ≤1 req/sec. Serializing through a single promise chain is
 * enough here — planning is not a high-throughput path.
 */
let lastCall = 0;
async function throttle(): Promise<void> {
  const wait = 1100 - (Date.now() - lastCall);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
}

export async function geocode(destination: string): Promise<GeocodeResult | null> {
  await throttle();

  const url = `${NOMINATIM}?${new URLSearchParams({
    q: destination,
    format: 'json',
    limit: '1',
    addressdetails: '0',
  })}`;

  const res = await fetch(url, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);

  const rows = (await res.json()) as Array<{
    lat: string;
    lon: string;
    display_name: string;
    addresstype?: string;
    boundingbox: [string, string, string, string]; // [south, north, west, east]
  }>;

  const hit = rows[0];
  if (!hit) return null;

  const [south, north, west, east] = hit.boundingbox.map(Number);
  const boundingBox = { north, south, east, west };
  const spanKm = spanOf(boundingBox);
  const addressType = hit.addresstype ?? 'place';

  if (spanKm > MAX_DESTINATION_SPAN_KM) {
    throw new DestinationTooLargeError(hit.display_name, addressType, spanKm);
  }

  return {
    query: destination,
    displayName: hit.display_name,
    lat: Number(hit.lat),
    lng: Number(hit.lon),
    boundingBox,
    addressType,
    spanKm,
    provider: 'nominatim',
  };
}
