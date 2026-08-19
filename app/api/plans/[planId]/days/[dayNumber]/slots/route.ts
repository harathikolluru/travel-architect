// Add a stop to a day, chosen by the user.
//
// No agent call and no re-plan: every itinerary tool treats a manual edit as an
// edit. Rearranging the surrounding day because someone added a café would take
// minutes and fight the user for control. Re-planning stays explicit, via the
// pace and date controls.

import { NextResponse } from 'next/server';
import { prisma } from '@travel-architect/db';
import { auth, authEnabled } from '@/app/auth';
import { dayColor } from '@travel-architect/contracts';
import { findCandidateById } from '@/app/lib/candidates';
import { isOpenAt, hoursOn } from '@/app/lib/opening-hours';

export const runtime = 'nodejs';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ planId: string; dayNumber: string }> },
) {
  const { planId, dayNumber } = await params;
  const body = await req.json().catch(() => ({}));
  const { externalId, scheduledTime } = body as {
    externalId?: string;
    scheduledTime?: string;
  };

  if (!externalId || !scheduledTime || !/^\d{2}:\d{2}$/.test(scheduledTime)) {
    return NextResponse.json(
      { error: 'externalId and a HH:MM scheduledTime are required' },
      { status: 400 },
    );
  }

  const plan = await prisma.tripPlan.findUnique({ where: { id: planId } });
  if (!plan) return NextResponse.json({ error: 'not found' }, { status: 404 });

  if (authEnabled()) {
    const session = await auth();
    if (!session?.user?.id || session.user.id !== plan.userId) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
  }

  const day = await prisma.dayPlan.findFirst({
    where: { planId, dayNumber: Number(dayNumber) },
    include: { slots: true },
  });
  if (!day) return NextResponse.json({ error: 'not found' }, { status: 404 });

  // The place must exist in the MCP scope. Same grounding check the agent's
  // save handler applies — a user cannot add somewhere unverifiable either.
  const spec = await findCandidateById(plan.destination, externalId);

  if (!spec) {
    return NextResponse.json(
      { error: 'That place is not in this destination’s verified results.' },
      { status: 400 },
    );
  }

  const source = await prisma.mcpPlaceSource.findFirst({ orderBy: { fetchedAt: 'desc' } });

  const place = await prisma.place.upsert({
    where: { sourceId_externalId: { sourceId: source?.id ?? '', externalId } },
    create: {
      sourceId: source?.id,
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

  // Slot into chronological position and renumber, so sequenceOrder keeps
  // matching the order the day is actually walked.
  const ordered = [...day.slots, { scheduledTime, id: '__new__' }].sort((a, b) =>
    a.scheduledTime.localeCompare(b.scheduledTime),
  );
  const position = ordered.findIndex((s) => s.id === '__new__') + 1;

  const created = await prisma.$transaction(async (tx) => {
    // Free up the target position first — sequenceOrder is unique per day.
    await tx.itinerarySlot.updateMany({
      where: { dayId: day.id, sequenceOrder: { gte: position } },
      data: { sequenceOrder: { increment: 1000 } },
    });

    const slot = await tx.itinerarySlot.create({
      data: {
        dayId: day.id,
        placeId: place.id,
        slotType: spec.category === 'restaurant' ? 'MEAL' : 'ACTIVITY',
        sequenceOrder: position,
        scheduledTime,
        // No agent wrote this one; say so rather than inventing a reason.
        rationale: 'Added by you.',
        wasSwapped: true,
      },
    });

    await tx.mapMarker.create({
      data: {
        slotId: slot.id,
        dayColor: dayColor(day.dayNumber),
        sequenceLabel: `${day.dayNumber}.${position}`,
      },
    });

    // Settle the shifted rows back into a clean 1..n sequence.
    const shifted = await tx.itinerarySlot.findMany({
      where: { dayId: day.id, sequenceOrder: { gte: 1000 } },
      orderBy: { sequenceOrder: 'asc' },
    });
    for (const [i, s] of shifted.entries()) {
      await tx.itinerarySlot.update({
        where: { id: s.id },
        data: { sequenceOrder: position + 1 + i },
      });
    }

    return slot;
  });

  // Warn rather than block — the parser reads only unambiguous patterns, and
  // the traveller may know better than the source.
  const weekday = day.date.getUTCDay();
  const state = isOpenAt(spec.openingHoursRaw ?? null, weekday, scheduledTime);

  return NextResponse.json({
    slotId: created.id,
    name: place.name,
    warning:
      state === 'closed'
        ? {
            message: `${place.name} looks closed at ${scheduledTime} that day.`,
            hours: hoursOn(spec.openingHoursRaw ?? null, weekday),
          }
        : null,
  });
}
