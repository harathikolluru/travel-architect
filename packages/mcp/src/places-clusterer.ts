// places-clusterer — the custom MCP source (PRD §6).
//
// Turns a destination name into a scoped, deduplicated, quality-assessed set of
// places. OSM is the base; Google enriches when a key is present. The value
// this adds over either raw API is the *viability gate*: it counts what it
// actually got before planning starts, so a thin destination degrades honestly
// instead of producing a plan padded with invented places.

import type { BoundingBox, PlaceSpec } from '@travel-architect/contracts';
import { distanceKm } from '@travel-architect/contracts';
import { geocode, type GeocodeResult } from './geocoding';
import * as osm from './places-osm';
import * as google from './places-google';
import { readScopeCache, writeScopeCache } from './cache';

/** Meal slots per day the planner assumes (lunch + dinner). */
const MEALS_PER_DAY = 2;
/** Every slot needs a primary and a backup (P0.7). */
const PER_SLOT = 2;

export type Viability = 'full' | 'limited' | 'insufficient';

/**
 * Municipal boundaries are not trip boundaries. Pikes Peak sits 11 km outside
 * the Colorado Springs city limit, Manitou Springs is a separate municipality,
 * and a visitor considers both part of the destination. Pad the geocoded box so
 * day-trip sights within roughly half an hour are candidates.
 */
const DESTINATION_PADDING_KM = 25;

function padBox(b: BoundingBox, km: number): BoundingBox {
  const dLat = km / 111;
  const midLat = (b.north + b.south) / 2;
  const dLng = km / (111 * Math.max(Math.cos((midLat * Math.PI) / 180), 0.01));
  return {
    north: Math.min(b.north + dLat, 90),
    south: Math.max(b.south - dLat, -90),
    east: Math.min(b.east + dLng, 180),
    west: Math.max(b.west - dLng, -180),
  };
}

export interface ClusterScope {
  geocoding: GeocodeResult;
  boundingBox: BoundingBox;
  restaurants: PlaceSpec[];
  attractions: PlaceSpec[];
  coverage: CoverageReport;
  providers: string[];
}

export interface CoverageReport {
  viability: Viability;
  /** Restaurants carrying both hours and a cuisine tag — the planner's real supply. */
  usableRestaurants: number;
  requiredRestaurants: number;
  totalRestaurants: number;
  totalAttractions: number;
  attractionsWithHours: number;
  /** Present when viability is not `full`; surfaced verbatim to the user. */
  warning: string | null;
}

function isUsableRestaurant(p: PlaceSpec): boolean {
  return p.dataCoverageFlag === 'rich' && p.cuisineTags.length > 0;
}

/**
 * Same place from two sources, or two entries for one venue in OSM. Match on
 * name + proximity rather than identifier, since the sources share no ids.
 */
function dedupe(places: PlaceSpec[]): PlaceSpec[] {
  const kept: PlaceSpec[] = [];
  for (const p of places) {
    const dupIndex = kept.findIndex(
      (k) =>
        k.name.toLowerCase() === p.name.toLowerCase() &&
        distanceKm({ lat: k.lat, lng: k.lng }, { lat: p.lat, lng: p.lng }) < 0.1,
    );
    if (dupIndex === -1) {
      kept.push(p);
      continue;
    }
    // Prefer the record that actually carries hours.
    if (kept[dupIndex].dataCoverageFlag === 'thin' && p.dataCoverageFlag === 'rich') {
      kept[dupIndex] = p;
    }
  }
  return kept;
}

function assess(
  restaurants: PlaceSpec[],
  attractions: PlaceSpec[],
  tripDays: number,
  destination: string,
): CoverageReport {
  const usable = restaurants.filter(isUsableRestaurant).length;
  const required = tripDays * MEALS_PER_DAY * PER_SLOT;
  const withHours = attractions.filter((a) => a.dataCoverageFlag === 'rich').length;

  // `limited` must still support at least one verified meal per day, otherwise
  // the plan is meal-less in practice and should say so outright.
  const minimumForLimited = tripDays;

  let viability: Viability;
  let warning: string | null = null;

  if (usable >= required) {
    viability = 'full';
  } else if (usable >= minimumForLimited) {
    viability = 'limited';
    warning =
      `Restaurant data for ${destination} is limited — ${usable} places have both ` +
      `opening hours and cuisine details, short of the ${required} a ${tripDays}-day ` +
      `trip would normally use. Expect roughly one verified meal per day; the ` +
      `remaining slots are left open rather than filled with places we cannot verify.`;
  } else {
    viability = 'insufficient';
    warning =
      `We could only verify ${usable} restaurant${usable === 1 ? '' : 's'} in ` +
      `${destination} — not enough for a ${tripDays}-day meal plan we would stand ` +
      `behind. This itinerary covers activities and weather only.`;
  }

  return {
    viability,
    usableRestaurants: usable,
    requiredRestaurants: required,
    totalRestaurants: restaurants.length,
    totalAttractions: attractions.length,
    attractionsWithHours: withHours,
    warning,
  };
}

/**
 * Resolve a destination and gather its places.
 *
 * @param destination free-text place name, e.g. "Sedona, Arizona"
 * @param tripDays    number of travel days, used to size the viability gate
 */
export async function scopeDestination(
  destination: string,
  tripDays: number,
): Promise<ClusterScope | null> {
  // A recent fetch for the same destination skips 30–90s of Overpass work.
  // The viability gate still re-runs, since it depends on tripDays.
  const cached = await readScopeCache(destination);
  if (cached) {
    return {
      geocoding: cached.geocoding,
      boundingBox: cached.geocoding.boundingBox,
      restaurants: cached.restaurants,
      attractions: cached.attractions,
      coverage: assess(
        cached.restaurants,
        cached.attractions,
        tripDays,
        cached.geocoding.displayName.split(',')[0] ?? destination,
      ),
      providers: [...cached.providers, 'cache'],
    };
  }

  const geo = await geocode(destination);
  if (!geo) return null;

  // Search wider than the city limit so nearby headline sights are candidates;
  // keep the tight box for reporting so the map still centres on the city.
  const bbox = geo.boundingBox;
  const searchBox = padBox(bbox, DESTINATION_PADDING_KM);
  const providers = ['osm'];

  const [osmRestaurants, osmAttractions] = await Promise.all([
    osm.fetchRestaurants(bbox), // restaurants stay in-city — you eat where you sleep
    osm.fetchAttractions(searchBox),
  ]);

  let restaurants = osmRestaurants;
  let attractions = osmAttractions;

  // Google is best-effort: a failure here must not take down a working OSM path.
  if (google.isGoogleEnabled()) {
    try {
      const [gr, ga] = await Promise.all([
        google.fetchRestaurants(bbox),
        google.fetchAttractions(searchBox),
      ]);
      restaurants = dedupe([...gr, ...restaurants]);
      attractions = dedupe([...ga, ...attractions]);
      providers.push('google-places');
    } catch (e) {
      console.warn(`[places-clusterer] Google enrichment failed, continuing with OSM: ${(e as Error).message}`);
    }
  } else {
    restaurants = dedupe(restaurants);
    attractions = dedupe(attractions);
  }

  await writeScopeCache(destination, { geocoding: geo, restaurants, attractions, providers });

  return {
    geocoding: geo,
    boundingBox: bbox,
    restaurants,
    attractions,
    coverage: assess(restaurants, attractions, tripDays, geo.displayName.split(',')[0] ?? destination),
    providers,
  };
}
