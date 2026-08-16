// The planner handoff contract. The agent's save tools and the app both
// validate against these — one source of truth for the shape of an
// itinerary, so a malformed plan can never reach the database.
//
// Grounding rule (PRD, non-negotiable): every place, address, opening hour,
// and weather value originates from an MCP source. The model supplies
// sequencing, rationale, and prose only. Schemas here enforce structure;
// the save handlers enforce provenance.

import { z } from 'zod';

export const PACES = ['relaxed', 'moderate', 'packed'] as const;
export const SLOT_TYPES = ['activity', 'meal'] as const;
export const PLACE_CATEGORIES = ['attraction', 'restaurant'] as const;
export const COVERAGE = ['rich', 'thin'] as const;
export const REPLAN_TRIGGERS = [
  'weather_change',
  'day_complete',
  'slot_swap',
  'pref_change',
  'dates_change',
] as const;

/** Stops per day, by pace. cluster-itinerary must not exceed the ceiling. */
export const PACE_BOUNDS: Record<(typeof PACES)[number], { min: number; max: number }> = {
  relaxed: { min: 2, max: 3 },
  moderate: { min: 3, max: 4 },
  packed: { min: 4, max: 5 },
};

/** Day colors used by both the map layer and the itinerary panel. */
export const DAY_COLORS = ['#2563eb', '#ea580c', '#16a34a', '#7c3aed', '#be123c', '#0f5f63', '#ca8a04'] as const;

// ── Geo primitives ──────────────────────────────────────────────────────

export const CoordinateSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const BoundingBoxSchema = z.object({
  north: z.number().min(-90).max(90),
  south: z.number().min(-90).max(90),
  east: z.number().min(-180).max(180),
  west: z.number().min(-180).max(180),
});

export const OpeningHourSchema = z.object({
  day: z.number().int().min(0).max(6), // 0 = Sunday, matching Places API
  open: z.string().regex(/^\d{2}:\d{2}$/),
  close: z.string().regex(/^\d{2}:\d{2}$/),
});

// ── Place ───────────────────────────────────────────────────────────────

/**
 * A place as returned by the places-clusterer MCP server. `externalId` is
 * required — a place with no upstream identifier cannot be verified, and
 * an unverifiable place must never enter a plan.
 */
export const PlaceSpecSchema = z.object({
  externalId: z.string().min(1),
  name: z.string().min(1),
  address: z.string().optional(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  category: z.enum(PLACE_CATEGORIES),
  /** Structured hours, when the source provides them in a parseable form. */
  openingHours: z.array(OpeningHourSchema).optional(),
  /**
   * Source hours verbatim (e.g. OSM's `Mo-Sa 10:00-18:00; PH off`). Displayed
   * as-is and never parsed into day ranges — a wrong parse would assert hours
   * we cannot stand behind, which violates the grounding rule.
   */
  openingHoursRaw: z.string().optional(),
  cuisineTags: z.array(z.string()).default([]),
  dietaryTags: z.array(z.string()).default([]),
  priceLevel: z.number().int().min(1).max(4).optional(),
  isIndoor: z.boolean(),
  dataCoverageFlag: z.enum(COVERAGE).default('rich'),
});

// ── cluster-itinerary Skill output ──────────────────────────────────────

export const ClusteredPlaceSchema = PlaceSpecSchema.extend({
  sequenceOrder: z.number().int().positive(),
});

export const DayClusterSchema = z.object({
  dayNumber: z.number().int().positive(),
  clusterCentroidLat: z.number().min(-90).max(90),
  clusterCentroidLng: z.number().min(-180).max(180),
  neighbourhoodLabel: z.string().min(1),
  places: z.array(ClusteredPlaceSchema).min(1),
  /** Set on days frozen by a day_complete re-plan trigger. */
  status: z.enum(['planned', 'complete']).default('planned'),
});

export const ExcludedPlaceSchema = z.object({
  name: z.string(),
  reason: z.string(),
});

export const ClusterOutputSchema = z.object({
  days: z.array(DayClusterSchema).min(1),
  excludedPlaces: z.array(ExcludedPlaceSchema).default([]),
  coverageWarning: z.string().nullable().default(null),
});

// ── generate-day-plan Skill output ──────────────────────────────────────

export const ItinerarySlotSpecSchema = z
  .object({
    slotType: z.enum(SLOT_TYPES),
    sequenceOrder: z.number().int().positive(),
    scheduledTime: z.string().regex(/^\d{2}:\d{2}$/, 'local wall time, e.g. "10:00"'),
    place: PlaceSpecSchema,
    /** P0.7 — required. A slot with no alternative is not a viable slot. */
    backupPlace: PlaceSpecSchema,
    rationale: z.string().min(10).max(160),
    backupRationale: z.string().min(5).max(160),
    isIndoorAlternative: z.boolean().default(false),
  })
  .refine((s) => s.place.externalId !== s.backupPlace.externalId, {
    message: 'backup must be a different place than the primary',
    path: ['backupPlace'],
  })
  .refine((s) => !s.isIndoorAlternative || s.backupPlace.isIndoor, {
    message: 'a weather-driven alternative must have an indoor backup',
    path: ['backupPlace'],
  });

export const WeatherSpecSchema = z.object({
  forecastDate: z.iso.date(),
  condition: z.string().min(1),
  tempMin: z.number(),
  tempMax: z.number(),
  precipitationProbability: z.number().min(0).max(1),
  windSpeed: z.number().optional(),
  isIndoorDay: z.boolean(),
});

export const DayPlanSpecSchema = z.object({
  dayNumber: z.number().int().positive(),
  date: z.iso.date(),
  neighbourhoodLabel: z.string().min(1),
  clusterCentroidLat: z.number().min(-90).max(90),
  clusterCentroidLng: z.number().min(-180).max(180),
  weather: WeatherSpecSchema,
  slots: z.array(ItinerarySlotSpecSchema).min(2).max(5),
});

// ── Packing list ────────────────────────────────────────────────────────

export const PackingItemSpecSchema = z.object({
  itemName: z.string().min(1),
  /** P0.5 — every item ties back to something in the forecast. */
  reason: z.string().min(5).max(120),
  triggeredByDayNumber: z.number().int().positive().optional(),
});

// ── Full planner output ─────────────────────────────────────────────────

export const PlannerOutputSchema = z
  .object({
    destination: z.string().min(1),
    destinationLat: z.number().min(-90).max(90),
    destinationLng: z.number().min(-180).max(180),
    startDate: z.iso.date(),
    endDate: z.iso.date(),
    pace: z.enum(PACES),
    days: z.array(DayPlanSpecSchema).min(1).max(7),
    packingItems: z.array(PackingItemSpecSchema).min(1),
    coverageWarning: z.string().nullable().default(null),
  })
  .refine((p) => p.days.every((d) => d.slots.length <= PACE_BOUNDS[p.pace].max), {
    message: 'a day exceeds the stop ceiling for the stated pace',
    path: ['days'],
  })
  .refine(
    (p) => {
      const seen = new Set(p.days.map((d) => d.dayNumber));
      return seen.size === p.days.length;
    },
    { message: 'duplicate dayNumber', path: ['days'] },
  );

// ── Re-plan diff ────────────────────────────────────────────────────────

export const ReplanEntrySpecSchema = z.object({
  dayNumber: z.number().int().positive(),
  sequenceOrder: z.number().int().positive(),
  wasName: z.string().min(1),
  place: PlaceSpecSchema,
  backupPlace: PlaceSpecSchema,
  scheduledTime: z.string().regex(/^\d{2}:\d{2}$/),
  rationale: z.string().min(10).max(160),
  replanReason: z.string().min(5).max(160),
});

/** Slots to drop, e.g. when a pace change means a day now holds fewer stops. */
export const ReplanRemovalSchema = z.object({
  dayNumber: z.number().int().positive(),
  sequenceOrder: z.number().int().positive(),
  wasName: z.string().min(1),
  reason: z.string().min(5).max(160),
});

export const ReplanOutputSchema = z
  .object({
    triggerType: z.enum(REPLAN_TRIGGERS),
    affectedDayNumbers: z.array(z.number().int().positive()).min(1),
    /** Shown verbatim in the UI diff banner and the email digest. */
    diffSummary: z.string().min(10).max(400),
    /** Slots to add or replace. */
    entries: z.array(ReplanEntrySpecSchema).max(24).default([]),
    /** Slots to delete. */
    removals: z.array(ReplanRemovalSchema).max(12).default([]),
  })
  .refine((r) => r.entries.length + r.removals.length > 0, {
    message: 'a re-plan must change something — omit the call entirely if nothing needs changing',
    path: ['entries'],
  });

// ── Types ───────────────────────────────────────────────────────────────

export type Coordinate = z.infer<typeof CoordinateSchema>;
export type BoundingBox = z.infer<typeof BoundingBoxSchema>;
export type OpeningHour = z.infer<typeof OpeningHourSchema>;
export type PlaceSpec = z.infer<typeof PlaceSpecSchema>;
export type ClusteredPlace = z.infer<typeof ClusteredPlaceSchema>;
export type DayCluster = z.infer<typeof DayClusterSchema>;
export type ClusterOutput = z.infer<typeof ClusterOutputSchema>;
export type ItinerarySlotSpec = z.infer<typeof ItinerarySlotSpecSchema>;
export type WeatherSpec = z.infer<typeof WeatherSpecSchema>;
export type DayPlanSpec = z.infer<typeof DayPlanSpecSchema>;
export type PackingItemSpec = z.infer<typeof PackingItemSpecSchema>;
export type PlannerOutput = z.infer<typeof PlannerOutputSchema>;
export type ReplanEntrySpec = z.infer<typeof ReplanEntrySpecSchema>;
export type ReplanRemoval = z.infer<typeof ReplanRemovalSchema>;
export type ReplanOutput = z.infer<typeof ReplanOutputSchema>;

/** Stable day color so the map and the itinerary panel never disagree. */
export function dayColor(dayNumber: number): string {
  return DAY_COLORS[(dayNumber - 1) % DAY_COLORS.length];
}

/** Haversine distance in km — used to sanity-check cluster tightness. */
export function distanceKm(a: Coordinate, b: Coordinate): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}
