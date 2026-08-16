// Re-plan save tool (P0.8). Same three enforcement layers as save_itinerary:
// Zod at the boundary, a grounding check here, and a post-run assertion in
// run.ts. Additionally records a ReplanEvent so the diff has an audit trail.

import { tool } from '@anthropic-ai/claude-agent-sdk';
import { prisma } from '@travel-architect/db';
import { ReplanOutputSchema, dayColor, type ReplanOutput } from '@travel-architect/contracts';
import type { ClusterScope } from '@travel-architect/mcp';

const text = (value: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(value, null, 1) }],
});
const errorText = (message: string) => ({
  content: [{ type: 'text' as const, text: message }],
  isError: true,
});

const TRIGGER_ENUM = {
  weather_change: 'WEATHER_CHANGE',
  day_complete: 'DAY_COMPLETE',
  slot_swap: 'SLOT_SWAP',
  pref_change: 'PREF_CHANGE',
  dates_change: 'DATES_CHANGE',
} as const;

export function replanSaveTool(opts: {
  planId: string;
  getScope: () => Promise<ClusterScope>;
  onSaved: () => void;
}) {
  const saveReplan = tool(
    'save_replan',
    'Persist the re-plan. `entries` both replaces existing slots and adds new ones (use a sequenceOrder that does not exist yet to add); `removals` deletes slots. Call once. Rejected if any place was not returned by search_places.',
    { replan: ReplanOutputSchema },
    async ({ replan }) => {
      const typed = replan as ReplanOutput;
      const scope = await opts.getScope();

      const known = new Map(
        [...scope.restaurants, ...scope.attractions].map((p) => [p.externalId, p]),
      );

      const ungrounded: string[] = [];
      for (const e of typed.entries) {
        if (!known.has(e.place.externalId)) ungrounded.push(`${e.place.name} (${e.place.externalId})`);
        if (!known.has(e.backupPlace.externalId)) {
          ungrounded.push(`${e.backupPlace.name} (${e.backupPlace.externalId})`);
        }
      }
      if (ungrounded.length > 0) {
        return errorText(
          `REJECTED — these places were not returned by search_places: ${ungrounded.join('; ')}. ` +
            `Re-run search_places and choose replacements from its results.`,
        );
      }

      try {
        const result = await prisma.$transaction(async (tx) => {
          const plan = await tx.tripPlan.findUniqueOrThrow({
            where: { id: opts.planId },
            include: { days: { include: { slots: true } } },
          });

          const source = await tx.mcpPlaceSource.findFirst({
            orderBy: { fetchedAt: 'desc' },
          });

          const dayByNumber = new Map(plan.days.map((d) => [d.dayNumber, d]));
          const affectedDayIds: string[] = [];
          let changed = 0;

          for (const entry of typed.entries) {
            const day = dayByNumber.get(entry.dayNumber);
            if (!day) continue;

            // A pace change needs days to gain or lose stops, so an entry whose
            // sequenceOrder does not exist yet is an insert, not a mismatch.
            const slot = day.slots.find((s) => s.sequenceOrder === entry.sequenceOrder);

            // Upsert both places so the new pick and its backup exist as rows.
            const placeIds = new Map<string, string>();
            for (const spec of [entry.place, entry.backupPlace]) {
              const row = await tx.place.upsert({
                where: {
                  sourceId_externalId: {
                    sourceId: source?.id ?? '',
                    externalId: spec.externalId,
                  },
                },
                create: {
                  sourceId: source?.id,
                  externalId: spec.externalId,
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
              placeIds.set(spec.externalId, row.id);
            }

            const slotData = {
              placeId: placeIds.get(entry.place.externalId)!,
              backupPlaceId: placeIds.get(entry.backupPlace.externalId)!,
              scheduledTime: entry.scheduledTime,
              rationale: entry.rationale,
              replanReason: entry.replanReason,
              wasSwapped: true,
              activeChoice: 'PRIMARY' as const,
            };

            if (slot) {
              await tx.itinerarySlot.update({ where: { id: slot.id }, data: slotData });
            } else {
              const created = await tx.itinerarySlot.create({
                data: {
                  ...slotData,
                  dayId: day.id,
                  sequenceOrder: entry.sequenceOrder,
                  slotType: entry.place.category === 'restaurant' ? 'MEAL' : 'ACTIVITY',
                },
              });
              await tx.mapMarker.create({
                data: {
                  slotId: created.id,
                  dayColor: dayColor(day.dayNumber),
                  sequenceLabel: `${day.dayNumber}.${entry.sequenceOrder}`,
                },
              });
            }

            if (!affectedDayIds.includes(day.id)) affectedDayIds.push(day.id);
            changed++;
          }

          for (const removal of typed.removals ?? []) {
            const day = dayByNumber.get(removal.dayNumber);
            if (!day) continue;
            const slot = day.slots.find((s) => s.sequenceOrder === removal.sequenceOrder);
            if (!slot) continue;
            // MapMarker cascades on slot delete.
            await tx.itinerarySlot.delete({ where: { id: slot.id } });
            if (!affectedDayIds.includes(day.id)) affectedDayIds.push(day.id);
            changed++;
          }

          if (changed === 0) {
            throw new Error('No matching slots found for the supplied day/sequence pairs.');
          }

          const prevVersion = plan.version;
          const newVersion = prevVersion + 1;

          await tx.tripPlan.update({
            where: { id: opts.planId },
            data: { version: newVersion },
          });

          const event = await tx.replanEvent.create({
            data: {
              planId: opts.planId,
              triggerType: TRIGGER_ENUM[typed.triggerType],
              affectedDayIds,
              diffSummary: typed.diffSummary,
              prevVersion,
              newVersion,
            },
          });

          return { eventId: event.id, changed, newVersion };
        });

        opts.onSaved();
        return text({ saved: true, ...result });
      } catch (e) {
        return errorText(`Save failed: ${(e as Error).message}`);
      }
    },
  );

  return { saveReplan };
}
