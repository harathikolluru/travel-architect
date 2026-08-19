// One-tap swap between a slot's primary and its backup (P1.1).
//
// No agent call: both places were already chosen and grounded when the plan was
// built, so flipping between them is a database write. Reserving the agent for
// decisions it actually needs to make keeps this instant.

import { NextResponse } from 'next/server';
import { prisma } from '@travel-architect/db';
import { auth, authEnabled } from '@/app/auth';

export const runtime = 'nodejs';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ planId: string; slotId: string }> },
) {
  const { planId, slotId } = await params;

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
    include: { place: true, backupPlace: true },
  });
  if (!slot) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (!slot.backupPlaceId) {
    return NextResponse.json({ error: 'This stop has no backup to swap to.' }, { status: 400 });
  }

  const nowShowing = slot.activeChoice === 'PRIMARY' ? 'BACKUP' : 'PRIMARY';

  await prisma.itinerarySlot.update({
    where: { id: slotId },
    data: { activeChoice: nowShowing, wasSwapped: true },
  });

  return NextResponse.json({
    activeChoice: nowShowing.toLowerCase(),
    showing: nowShowing === 'PRIMARY' ? slot.place.name : slot.backupPlace?.name,
  });
}

/** Remove a stop. The day keeps its remaining stops and times unchanged. */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ planId: string; slotId: string }> },
) {
  const { planId, slotId } = await params;

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
    include: { day: { include: { slots: true } } },
  });
  if (!slot) return NextResponse.json({ error: 'not found' }, { status: 404 });

  // A day with nothing in it reads as broken rather than edited.
  if (slot.day.slots.length <= 1) {
    return NextResponse.json(
      { error: 'A day needs at least one stop. Shorten the trip instead.' },
      { status: 400 },
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.itinerarySlot.delete({ where: { id: slotId } });

    // Close the gap so sequenceOrder stays 1..n.
    const remaining = await tx.itinerarySlot.findMany({
      where: { dayId: slot.dayId },
      orderBy: { sequenceOrder: 'asc' },
    });
    for (const [i, s] of remaining.entries()) {
      if (s.sequenceOrder !== i + 1) {
        await tx.itinerarySlot.update({
          where: { id: s.id },
          data: { sequenceOrder: i + 1 },
        });
      }
    }
  });

  return NextResponse.json({ removed: true });
}
