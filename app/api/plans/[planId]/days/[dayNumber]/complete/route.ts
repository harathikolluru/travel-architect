// Mark a day done or not-done. A plain toggle — the agent is only involved if
// the user then asks to improve the remaining days.

import { NextResponse } from 'next/server';
import { prisma } from '@travel-architect/db';
import { auth, authEnabled } from '@/app/auth';

export const runtime = 'nodejs';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ planId: string; dayNumber: string }> },
) {
  const { planId, dayNumber } = await params;
  const body = await req.json().catch(() => ({}));
  const isComplete = body.isComplete !== false;

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
  });
  if (!day) return NextResponse.json({ error: 'not found' }, { status: 404 });

  await prisma.dayPlan.update({ where: { id: day.id }, data: { isComplete } });

  const remaining = await prisma.dayPlan.count({
    where: { planId, isComplete: false },
  });

  return NextResponse.json({ dayNumber: day.dayNumber, isComplete, remainingDays: remaining });
}
