// Read-side tools. Everything the agent can learn about the world comes
// through here, and every one of these hits a real MCP source — never model
// memory. That separation is the grounding rule (PRD §5, P0.2).

import { z } from 'zod';
import { tool } from '@anthropic-ai/claude-agent-sdk';
import { prisma } from '@travel-architect/db';
import {
  ForecastOutOfRangeError,
  getForecast,
  scopeDestination,
  type ClusterScope,
} from '@travel-architect/mcp';
import { distanceKm } from '@travel-architect/contracts';

const NO_FORECAST_GUIDANCE =
  'Do not call this tool again — the answer will not change. Plan without weather ' +
  'adaptation: set isIndoorDay false and use the condition "forecast unavailable". ' +
  'OMIT tempMin, tempMax and precipitationProbability entirely — leave the fields out ' +
  'rather than supplying a seasonal average or any other estimate. Temperatures are in ' +
  'Celsius, and a value you did not receive is a fabrication even if it is plausible. ' +
  'Base the packing list on the destination and season, saying so explicitly, and never ' +
  'state a temperature or rain chance in a rationale.';

const text = (value: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(value, null, 1) }],
});
const errorText = (message: string) => ({
  content: [{ type: 'text' as const, text: message }],
  isError: true,
});

/**
 * One scope fetch per run, shared by every tool below. Overpass has no SLA and
 * rate-limits, so re-fetching per tool call would be both slow and rude.
 */
export function createScopeCache(planId: string) {
  let cached: ClusterScope | null = null;

  return async function getScope(): Promise<ClusterScope> {
    if (cached) return cached;
    const plan = await prisma.tripPlan.findUniqueOrThrow({ where: { id: planId } });
    const days = Math.max(
      1,
      Math.round((plan.endDate.getTime() - plan.startDate.getTime()) / 86_400_000) + 1,
    );
    const scope = await scopeDestination(plan.destination, days);
    if (!scope) throw new Error(`Could not resolve destination "${plan.destination}"`);
    cached = scope;
    return scope;
  };
}

export function sourceTools(planId: string, getScope: () => Promise<ClusterScope>) {
  const getTripConstraints = tool(
    'get_trip_constraints',
    "The traveller's trip parameters: destination, dates, pace, interests, dietary preference, must-visit places, and budget band.",
    {},
    async () => {
      const plan = await prisma.tripPlan.findUniqueOrThrow({ where: { id: planId } });
      const days =
        Math.round((plan.endDate.getTime() - plan.startDate.getTime()) / 86_400_000) + 1;
      return text({
        destination: plan.destination,
        startDate: plan.startDate.toISOString().slice(0, 10),
        endDate: plan.endDate.toISOString().slice(0, 10),
        tripDays: days,
        pace: plan.pace.toLowerCase(),
        stopsPerDay: { RELAXED: '2-3', MODERATE: '3-4', PACKED: '4-5' }[plan.pace],
        interests: plan.interests,
        dietaryPreference: plan.dietaryPreference ?? 'none',
        mustVisit: plan.mustVisit,
        budgetBand: plan.budgetBand ?? 'any',
      });
    },
  );

  const getDestinationCoverage = tool(
    'get_destination_coverage',
    'How much verified place data exists for this destination. CALL THIS FIRST — if viability is "insufficient" you must not invent restaurants to fill the gap.',
    {},
    async () => {
      const scope = await getScope();
      return text({
        resolved: scope.geocoding.displayName,
        boundingBox: scope.boundingBox,
        providers: scope.providers,
        ...scope.coverage,
      });
    },
  );

  const searchPlaces = tool(
    'search_places',
    'Candidate places for this destination, from live MCP sources. Filter by category, dietary tag, or proximity to a point. Only places returned here may appear in the plan.',
    {
      category: z.enum(['attraction', 'restaurant']),
      dietaryTag: z
        .string()
        .optional()
        .describe('e.g. vegetarian, vegan — matches cuisine or dietary tags'),
      nearLat: z.number().optional(),
      nearLng: z.number().optional(),
      radiusKm: z.number().optional().describe('only with nearLat/nearLng; default 2'),
      requireOpeningHours: z
        .boolean()
        .optional()
        .describe('restrict to places with confirmed hours; attractions rarely have them'),
      limit: z.number().int().min(1).max(60).optional(),
    },
    async ({ category, dietaryTag, nearLat, nearLng, radiusKm, requireOpeningHours, limit }) => {
      const scope = await getScope();
      let places = category === 'restaurant' ? scope.restaurants : scope.attractions;

      if (requireOpeningHours) {
        places = places.filter((p) => p.dataCoverageFlag === 'rich');
      }

      if (dietaryTag) {
        const needle = dietaryTag.toLowerCase();
        places = places.filter(
          (p) =>
            p.dietaryTags.some((t) => t.toLowerCase().includes(needle)) ||
            p.cuisineTags.some((t) => t.toLowerCase().includes(needle)),
        );
      }

      if (nearLat !== undefined && nearLng !== undefined) {
        const r = radiusKm ?? 2;
        places = places
          .map((p) => ({ p, d: distanceKm({ lat: nearLat, lng: nearLng }, { lat: p.lat, lng: p.lng }) }))
          .filter((x) => x.d <= r)
          .sort((a, b) => a.d - b.d)
          .map((x) => x.p);
      }

      // Restaurants: confirmed hours first — arriving at a closed restaurant is
      // a real failure. Attractions: NO ranking. OSM carries no usable
      // prominence signal, and every proxy tried (hours, address, wikidata)
      // ranked small well-tagged galleries above Union Station and the Botanic
      // Gardens. An arbitrary order the agent must read is better than a
      // confident order that is wrong.
      if (category === 'restaurant') {
        places = [...places].sort((a, b) => {
          const rank = (p: (typeof places)[number]) =>
            (p.dataCoverageFlag === 'rich' ? 2 : 0) + (p.cuisineTags.length > 0 ? 1 : 0);
          return rank(b) - rank(a);
        });
      }

      // Attractions need a wider window than restaurants: the agent is picking
      // landmarks out of an unranked list, so it must see more of it.
      const capped = places.slice(0, limit ?? (category === 'attraction' ? 60 : 25));
      const thin = capped.filter((p) => p.dataCoverageFlag === 'thin').length;
      return text({
        returned: capped.length,
        totalMatching: places.length,
        note:
          category === 'attraction'
            ? `Unranked — the source has no prominence signal, so read the whole list and ` +
              `choose what a visitor would actually want to see. ${thin} of these have no ` +
              `opening hours; that is normal (only ~4% do) and is NOT a reason to skip a ` +
              `notable place. Include it and show "Hours unconfirmed".`
            : undefined,
        places: capped.map((p) => ({
          externalId: p.externalId,
          name: p.name,
          lat: p.lat,
          lng: p.lng,
          category: p.category,
          cuisineTags: p.cuisineTags,
          dietaryTags: p.dietaryTags,
          isIndoor: p.isIndoor,
          openingHours: p.openingHoursRaw ?? 'unconfirmed',
          priceLevel: p.priceLevel,
          address: p.address,
        })),
      });
    },
  );

  const getWeather = tool(
    'get_weather_forecast',
    'Daily forecast for the trip dates. is_indoor_day means outdoor stops need indoor backups that day.',
    {},
    async () => {
      const plan = await prisma.tripPlan.findUniqueOrThrow({ where: { id: planId } });
      const scope = await getScope();
      try {
        const days = await getForecast({
          lat: scope.geocoding.lat,
          lng: scope.geocoding.lng,
          startDate: plan.startDate.toISOString().slice(0, 10),
          endDate: plan.endDate.toISOString().slice(0, 10),
        });
        if (days.length === 0) {
          return text({ forecastAvailable: false, days: [], guidance: NO_FORECAST_GUIDANCE });
        }
        return text({ forecastAvailable: true, days });
      } catch (e) {
        if (e instanceof ForecastOutOfRangeError) {
          // Not a failure — the trip is simply too far out. Say so once, plainly,
          // so the agent proceeds instead of retrying a deterministic 400.
          return text({
            forecastAvailable: false,
            reason: e.message,
            days: [],
            guidance: NO_FORECAST_GUIDANCE,
          });
        }
        return errorText(`Weather lookup failed: ${(e as Error).message}`);
      }
    },
  );

  const getCurrentPlan = tool(
    'get_current_plan',
    'The itinerary as it stands now — every day, slot, place, and rationale. Call this before re-planning so you know what you are changing.',
    {},
    async () => {
      const days = await prisma.dayPlan.findMany({
        where: { planId },
        orderBy: { dayNumber: 'asc' },
        include: {
          weather: true,
          slots: {
            orderBy: { sequenceOrder: 'asc' },
            include: { place: true, backupPlace: true },
          },
        },
      });

      return text({
        days: days.map((d) => ({
          dayNumber: d.dayNumber,
          date: d.date.toISOString().slice(0, 10),
          neighbourhood: d.neighbourhoodLabel,
          isComplete: d.isComplete,
          weather: d.weather && {
            condition: d.weather.condition,
            tempMax: d.weather.tempMax,
            precipitationProbability: d.weather.precipitationProbability,
            isIndoorDay: d.weather.isIndoorDay,
          },
          slots: d.slots.map((s) => ({
            sequenceOrder: s.sequenceOrder,
            time: s.scheduledTime,
            slotType: s.slotType.toLowerCase(),
            place: s.place.name,
            placeExternalId: s.place.externalId,
            isIndoor: s.place.isIndoor,
            backup: s.backupPlace?.name,
            backupExternalId: s.backupPlace?.externalId,
            rationale: s.rationale,
            wasSwapped: s.wasSwapped,
          })),
        })),
      });
    },
  );

  return [getTripConstraints, getDestinationCoverage, searchPlaces, getWeather, getCurrentPlan];
}
