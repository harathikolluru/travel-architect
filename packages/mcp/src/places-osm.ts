// Overpass (OpenStreetMap) place source. Free, keyless, no SLA.
//
// Coverage varies sharply by destination size — see docs/spike-data-layer.md.
// Restaurants carry cuisine (55–86%) and opening hours (22–75%); attractions
// almost never carry hours (0–13%). Callers must treat missing hours as
// missing, never as "open".

import type { BoundingBox, PlaceSpec } from '@travel-architect/contracts';

const OVERPASS = process.env.OVERPASS_API_URL ?? 'https://overpass-api.de/api/interpreter';
const UA = 'TravelArchitect/0.1 (capstone project)';

/** tourism values that are reliably enclosed. */
const INDOOR_TOURISM = new Set(['museum', 'gallery', 'artwork', 'aquarium']);
/** tourism/leisure values that are reliably open-air. */
const OUTDOOR_TOURISM = new Set(['viewpoint', 'picnic_site', 'camp_site', 'beach']);

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

async function query(ql: string): Promise<OverpassElement[]> {
  // Overpass rate-limits and occasionally 504s under load; retry with backoff.
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(OVERPASS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
        body: new URLSearchParams({ data: ql }),
        signal: AbortSignal.timeout(180_000),
      });
      if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
      const json = (await res.json()) as { elements?: OverpassElement[] };
      return json.elements ?? [];
    } catch (e) {
      lastErr = e;
      if (attempt < 2) await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
    }
  }
  throw new Error(`Overpass failed after 3 attempts: ${(lastErr as Error)?.message}`);
}

function coords(el: OverpassElement): { lat: number; lng: number } | null {
  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  if (lat === undefined || lng === undefined) return null;
  return { lat, lng };
}

/**
 * OSM has no explicit indoor flag. Infer from feature type and the presence of
 * a building tag; leave genuinely ambiguous places as outdoor=false so the
 * weather logic errs toward offering an indoor backup rather than assuming one
 * is unnecessary.
 */
function inferIndoor(tags: Record<string, string>): boolean {
  if (tags.amenity === 'restaurant' || tags.amenity === 'cafe') return true;
  const tourism = tags.tourism ?? '';
  if (INDOOR_TOURISM.has(tourism)) return true;
  if (OUTDOOR_TOURISM.has(tourism)) return false;
  if (tags.building && tags.building !== 'no') return true;
  return false;
}

/** OSM `opening_hours` is a rich mini-language; we pass it through verbatim. */
function toPlace(
  el: OverpassElement,
  category: 'attraction' | 'restaurant',
): PlaceSpec | null {
  const tags = el.tags ?? {};
  const name = tags.name;
  if (!name) return null;
  const c = coords(el);
  if (!c) return null;

  const cuisine = tags.cuisine ? tags.cuisine.split(';').map((s) => s.trim()) : [];
  const dietary = Object.entries(tags)
    .filter(([k, v]) => k.startsWith('diet:') && v === 'yes')
    .map(([k]) => k.slice(5));

  const hasHours = Boolean(tags.opening_hours);

  return {
    externalId: `${el.type}/${el.id}`,
    name,
    address:
      [tags['addr:housenumber'], tags['addr:street'], tags['addr:city']]
        .filter(Boolean)
        .join(' ') || undefined,
    lat: c.lat,
    lng: c.lng,
    category,
    openingHoursRaw: tags.opening_hours,
    cuisineTags: cuisine,
    dietaryTags: dietary,
    priceLevel: undefined,
    isIndoor: inferIndoor(tags),
    // The honest signal: a place with no hours is thin, and the UI must say so
    // rather than imply it is open.
    dataCoverageFlag: hasHours ? 'rich' : 'thin',
  };
}

function bboxStr(b: BoundingBox): string {
  return `${b.south},${b.west},${b.north},${b.east}`;
}

export async function fetchRestaurants(bbox: BoundingBox): Promise<PlaceSpec[]> {
  const box = bboxStr(bbox);
  const els = await query(
    `[out:json][timeout:150];(` +
      `node["amenity"~"^(restaurant|cafe)$"](${box});` +
      `way["amenity"~"^(restaurant|cafe)$"](${box});` +
      `);out tags center;`,
  );
  return els
    .map((el) => toPlace(el, 'restaurant'))
    .filter((p): p is PlaceSpec => p !== null);
}

export async function fetchAttractions(bbox: BoundingBox): Promise<PlaceSpec[]> {
  const box = bboxStr(bbox);
  const els = await query(
    `[out:json][timeout:150];(` +
      `node["tourism"~"^(museum|attraction|artwork|viewpoint|gallery|aquarium|zoo)$"](${box});` +
      `way["tourism"~"^(museum|attraction|artwork|viewpoint|gallery|aquarium|zoo)$"](${box});` +
      `node["historic"](${box});` +
      `way["historic"](${box});` +
      `node["leisure"~"^(park|garden)$"](${box});` +
      `way["leisure"~"^(park|garden)$"](${box});` +
      `);out tags center;`,
  );
  return els
    .map((el) => toPlace(el, 'attraction'))
    .filter((p): p is PlaceSpec => p !== null);
}
