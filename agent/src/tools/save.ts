// Write-side tool. Two enforcement layers live here:
//   1. Zod validates the shape at the tool boundary (contracts package).
//   2. Semantic validation below checks what Zod cannot — that every place the
//      agent used actually came from the MCP scope, not from its own memory.
// A third layer (post-run assertion) lives in run.ts.

import { tool } from '@anthropic-ai/claude-agent-sdk';
import { prisma } from '@travel-architect/db';
import { PlannerOutputSchema, dayColor, type PlannerOutput } from '@travel-architect/contracts';
import type { ClusterScope } from '@travel-architect/mcp';

const text = (value: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(value, null, 1) }],
});
const errorText = (message: string) => ({
  content: [{ type: 'text' as const, text: message }],
  isError: true,
});

/**
 * The grounding check. Every externalId in the plan must exist in the scope we
 * fetched from MCP sources. If the agent invented a plausible-sounding
 * restaurant, this is what catches it.
 */
function findUngroundedPlaces(plan: PlannerOutput, scope: ClusterScope): string[] {
  const known = new Set(
    [...scope.restaurants, ...scope.attractions].map((p) => p.externalId),
  );
  const bad: string[] = [];
  for (const day of plan.days) {
    for (const slot of day.slots) {
      if (!known.has(slot.place.externalId)) bad.push(`${slot.place.name} (${slot.place.externalId})`);
      if (!known.has(slot.backupPlace.externalId)) {
        bad.push(`${slot.backupPlace.name} (${slot.backupPlace.externalId})`);
      }
    }
  }
  return bad;
}

export function saveTools(opts: {
  planId: string;
  getScope: () => Promise<ClusterScope>;
  onSaved: (planId: string) => void;
}) {
  const saveItinerary = tool(
    'save_itinerary',
    'Persist the finished itinerary. Call exactly once, after every day is planned. Rejected if any place was not returned by search_places.',
    { plan: PlannerOutputSchema },
    async ({ plan }) => {
      const scope = await opts.getScope();

      const ungrounded = findUngroundedPlaces(plan as PlannerOutput, scope);
      if (ungrounded.length > 0) {
        return errorText(
          `REJECTED — these places were not returned by search_places and cannot be used: ` +
            `${ungrounded.join('; ')}. Every place must come from search_places results. ` +
            `Re-run search_places and rebuild the affected slots.`,
        );
      }

      const typed = plan as PlannerOutput;

      // Index the scope so we can persist the full source record, not just what
      // the agent echoed back.
      const byId = new Map(
        [...scope.restaurants, ...scope.attractions].map((p) => [p.externalId, p]),
      );

      try {
        const savedId = await prisma.$transaction(async (tx) => {
          const source = await tx.mcpPlaceSource.create({
            data: {
              destinationBbox: scope.boundingBox,
              rawPlacesCount: scope.restaurants.length + scope.attractions.length,
              coverageQuality: scope.coverage.viability === 'full' ? 'RICH' : 'THIN',
              provider: scope.providers.join('+'),
              clusterAlgorithm: 'agent-cluster-itinerary',
            },
          });

          // Upsert every place used, so re-plans reuse rows rather than duplicate.
          const placeIds = new Map<string, string>();
          const used = new Set<string>();
          for (const day of typed.days) {
            for (const slot of day.slots) {
              used.add(slot.place.externalId);
              used.add(slot.backupPlace.externalId);
            }
          }

          for (const externalId of used) {
            const spec = byId.get(externalId)!;
            const row = await tx.place.upsert({
              where: { sourceId_externalId: { sourceId: source.id, externalId } },
              create: {
                sourceId: source.id,
                externalId,
                name: spec.name,
                address: spec.address,
                lat: spec.lat,
                lng: spec.lng,
                category: spec.category === 'restaurant' ? 'RESTAURANT' : 'ATTRACTION',
                openingHours: spec.openingHoursRaw ? { raw: spec.openingHoursRaw } : undefined,
                cuisineTags: spec.cuisineTags,
                dietaryTags: spec.dietaryTags,
                priceLevel: spec.priceLevel,
                isIndoor: spec.isIndoor,
                dataCoverageFlag: spec.dataCoverageFlag === 'rich' ? 'RICH' : 'THIN',
              },
              update: {},
            });
            placeIds.set(externalId, row.id);
          }

          // Replace any previous plan content for this trip.
          await tx.dayPlan.deleteMany({ where: { planId: opts.planId } });
          await tx.packingList.deleteMany({ where: { planId: opts.planId } });

          for (const day of typed.days) {
            const weather = await tx.weatherForecast.upsert({
              where: {
                destination_forecastDate: {
                  destination: typed.destination,
                  forecastDate: new Date(`${day.weather.forecastDate}T00:00:00.000Z`),
                },
              },
              create: {
                destination: typed.destination,
                forecastDate: new Date(`${day.weather.forecastDate}T00:00:00.000Z`),
                condition: day.weather.condition,
                tempMin: day.weather.tempMin,
                tempMax: day.weather.tempMax,
                precipitationProbability: day.weather.precipitationProbability,
                windSpeed: day.weather.windSpeed,
                isIndoorDay: day.weather.isIndoorDay,
              },
              update: {
                condition: day.weather.condition,
                tempMin: day.weather.tempMin,
                tempMax: day.weather.tempMax,
                precipitationProbability: day.weather.precipitationProbability,
                isIndoorDay: day.weather.isIndoorDay,
              },
            });

            const dayRow = await tx.dayPlan.create({
              data: {
                planId: opts.planId,
                dayNumber: day.dayNumber,
                date: new Date(`${day.date}T00:00:00.000Z`),
                weatherId: weather.id,
                clusterCentroidLat: day.clusterCentroidLat,
                clusterCentroidLng: day.clusterCentroidLng,
                neighbourhoodLabel: day.neighbourhoodLabel,
              },
            });

            for (const slot of day.slots) {
              const slotRow = await tx.itinerarySlot.create({
                data: {
                  dayId: dayRow.id,
                  placeId: placeIds.get(slot.place.externalId)!,
                  backupPlaceId: placeIds.get(slot.backupPlace.externalId)!,
                  slotType: slot.slotType === 'meal' ? 'MEAL' : 'ACTIVITY',
                  sequenceOrder: slot.sequenceOrder,
                  scheduledTime: slot.scheduledTime,
                  rationale: slot.rationale,
                  backupRationale: slot.backupRationale,
                  isIndoorAlternative: slot.isIndoorAlternative,
                },
              });

              await tx.mapMarker.create({
                data: {
                  slotId: slotRow.id,
                  dayColor: dayColor(day.dayNumber),
                  sequenceLabel: `${day.dayNumber}.${slot.sequenceOrder}`,
                },
              });
            }
          }

          const list = await tx.packingList.create({ data: { planId: opts.planId } });
          const dayRows = await tx.dayPlan.findMany({ where: { planId: opts.planId } });
          const dayByNumber = new Map(dayRows.map((d) => [d.dayNumber, d.id]));

          await tx.packingItem.createMany({
            data: typed.packingItems.map((item, i) => ({
              listId: list.id,
              itemName: item.itemName,
              reason: item.reason,
              dayId: item.triggeredByDayNumber ? dayByNumber.get(item.triggeredByDayNumber) : undefined,
              sortOrder: i,
            })),
          });

          await tx.tripPlan.update({
            where: { id: opts.planId },
            data: { status: 'ACTIVE', geocodingId: undefined },
          });

          return opts.planId;
        });

        opts.onSaved(savedId);
        return text({
          saved: true,
          planId: savedId,
          days: typed.days.length,
          slots: typed.days.reduce((n, d) => n + d.slots.length, 0),
        });
      } catch (e) {
        return errorText(`Save failed: ${(e as Error).message}`);
      }
    },
  );

  return { saveItinerary };
}
