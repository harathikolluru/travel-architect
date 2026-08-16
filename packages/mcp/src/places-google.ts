// Google Places (New) v1 — OPTIONAL enrichment layer.
//
// Everything works without this; OSM is the base source. Google exists to fix
// the two gaps the spike found (docs/spike-data-layer.md):
//   • attraction opening hours — OSM gives 0–13%, Google is far denser
//   • small-town coverage — Sedona had 4 usable restaurants on OSM alone
//
// When GOOGLE_PLACES_API_KEY is unset every function here no-ops, and callers
// fall back to OSM-only behaviour.

import type { BoundingBox, PlaceSpec } from '@travel-architect/contracts';

const ENDPOINT = 'https://places.googleapis.com/v1/places:searchNearby';

const FIELDS = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.primaryType',
  'places.types',
  'places.regularOpeningHours',
  'places.priceLevel',
  'places.servesVegetarianFood',
].join(',');

const PRICE_LEVEL: Record<string, number> = {
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

/** Google types that are reliably enclosed. */
const INDOOR_TYPES = new Set([
  'restaurant', 'cafe', 'museum', 'art_gallery', 'aquarium',
  'shopping_mall', 'movie_theater', 'library', 'bar',
]);

export function isGoogleEnabled(): boolean {
  const k = process.env.GOOGLE_PLACES_API_KEY ?? '';
  // Guard against a trailing-comment value leaking in from .env.example.
  return k.length > 0 && !k.includes('#');
}

interface GooglePlace {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  primaryType?: string;
  types?: string[];
  regularOpeningHours?: { weekdayDescriptions?: string[] };
  priceLevel?: string;
  servesVegetarianFood?: boolean;
}

function centerOf(b: BoundingBox): { lat: number; lng: number } {
  return { lat: (b.north + b.south) / 2, lng: (b.east + b.west) / 2 };
}

/** Metres from bbox centre to its corner — the circle that covers the box. */
function radiusOf(b: BoundingBox): number {
  const latSpan = (b.north - b.south) * 111_000;
  const lngSpan =
    (b.east - b.west) * 111_000 * Math.cos(((b.north + b.south) / 2) * (Math.PI / 180));
  const r = Math.sqrt(latSpan ** 2 + lngSpan ** 2) / 2;
  return Math.min(Math.max(r, 500), 50_000); // API accepts 0–50 km
}

function toPlace(g: GooglePlace, category: 'attraction' | 'restaurant'): PlaceSpec | null {
  const name = g.displayName?.text;
  const loc = g.location;
  if (!name || !loc) return null;

  const hours = g.regularOpeningHours?.weekdayDescriptions;
  const types = g.types ?? [];

  return {
    externalId: `google/${g.id}`,
    name,
    address: g.formattedAddress,
    lat: loc.latitude,
    lng: loc.longitude,
    category,
    openingHoursRaw: hours?.join('; '),
    cuisineTags: types.filter((t) => t.endsWith('_restaurant')).map((t) => t.replace('_restaurant', '')),
    dietaryTags: g.servesVegetarianFood ? ['vegetarian'] : [],
    priceLevel: g.priceLevel ? PRICE_LEVEL[g.priceLevel] : undefined,
    isIndoor: types.some((t) => INDOOR_TYPES.has(t)),
    dataCoverageFlag: hours ? 'rich' : 'thin',
  };
}

async function searchNearby(
  bbox: BoundingBox,
  includedTypes: string[],
  category: 'attraction' | 'restaurant',
): Promise<PlaceSpec[]> {
  const key = process.env.GOOGLE_PLACES_API_KEY!;
  const center = centerOf(bbox);

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': FIELDS,
    },
    body: JSON.stringify({
      includedTypes,
      // 20 is the API maximum per call.
      maxResultCount: 20,
      locationRestriction: {
        circle: {
          center: { latitude: center.lat, longitude: center.lng },
          radius: radiusOf(bbox),
        },
      },
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(`Google Places HTTP ${res.status}: ${body?.error?.message ?? 'rejected'}`);
  }

  const json = (await res.json()) as { places?: GooglePlace[] };
  return (json.places ?? [])
    .map((g) => toPlace(g, category))
    .filter((p): p is PlaceSpec => p !== null);
}

export async function fetchRestaurants(bbox: BoundingBox): Promise<PlaceSpec[]> {
  if (!isGoogleEnabled()) return [];
  return searchNearby(bbox, ['restaurant'], 'restaurant');
}

export async function fetchAttractions(bbox: BoundingBox): Promise<PlaceSpec[]> {
  if (!isGoogleEnabled()) return [];
  return searchNearby(bbox, ['tourist_attraction', 'museum', 'park'], 'attraction');
}
