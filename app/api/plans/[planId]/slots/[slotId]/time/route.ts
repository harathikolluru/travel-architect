// Change when a stop happens.
//
// Applies to agent-chosen stops as well as user-added ones: it is the same
// field either way, and letting you set a time only on stops you added was an
// arbitrary distinction. Re-sorts the day so sequenceOrder keeps matching the
// order it is actually walked.

import { NextResponse } from 'next/server';
import { prisma } from '@travel-architect/db';
import { auth, authEnabled } from '@/app/auth';
import { isOpenAt, hoursOn } from '@/app/lib/opening-hours';

export const runtime = 'nodejs';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ planId: string; slotId: string }> },
) {
  const { planId, slotId } = await params;
  const body = await req.json().catch(() => ({}));
  const scheduledTime = body.scheduledTime as string | undefined;

  if (!scheduledTime || !/^\d{2}:\d{2}$/.test(scheduledTime)) {
    return NextResponse.json({ error: 'scheduledTime must be HH:MM' }, { status: 400 });
  }

  const plan = await prisma.tripPlan.findUnique({ where: { id: planId } });
  if (!plan) return NextResponse.json({ error: 'not found' }, { status: 404 });

  if (authEnabled()) {
    const session = await auth();
    if (!session?.user?.id || session.user.id !== plan.userId) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
  }

  const slot = await prisma.itinerarySlot.findFirst({
    where: { id: slotId, day: { planId } },
    include: { day: true, place: true, backupPlace: true },
  });
  if (!slot) return NextResponse.json({ error: 'not found' }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    await tx.itinerarySlot.update({
      where: { id: slotId },
      data: { scheduledTime },
    });

    // Renumber the whole day by time; two-phase because sequenceOrder is
    // unique per day and the intermediate state would collide.
    const slots = await tx.itinerarySlot.findMany({ where: { dayId: slot.dayId } });
    const sorted = [...slots].sort((a, b) =>
      a.id === slotId
        ? scheduledTime.localeCompare(b.scheduledTime)
        : b.id === slotId
          ? a.scheduledTime.localeCompare(scheduledTime)
          : a.scheduledTime.localeCompare(b.scheduledTime),
    );

    for (const s of sorted) {
      await tx.itinerarySlot.update({
        where: { id: s.id },
        data: { sequenceOrder: s.sequenceOrder + 1000 },
      });
    }
    for (const [i, s] of sorted.entries()) {
      await tx.itinerarySlot.update({
        where: { id: s.id },
        data: { sequenceOrder: i + 1 },
      });
    }
  });

  // Warn, do not block: the parser understands only unambiguous patterns, and
  // the traveller may know something the source does not.
  const raw = (slot.place.openingHours as { raw?: string } | null)?.raw ?? null;
  const weekday = slot.day.date.getUTCDay();
  const state = isOpenAt(raw, weekday, scheduledTime);

  return NextResponse.json({
    scheduledTime,
    warning:
      state === 'closed'
        ? {
            message: `${slot.place.name} looks closed at ${scheduledTime} that day.`,
            hours: hoursOn(raw, weekday),
          }
        : null,
  });
}
