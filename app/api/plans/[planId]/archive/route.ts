// Soft delete and restore.
//
// Deleting is instant from the list's point of view, but the row survives long
// enough for the undo toast to reverse it. A confirmation dialog would stop
// accidental deletes at the cost of training people to click through it; undo
// catches the mistake when the person actually notices.

import { NextResponse } from 'next/server';
import { prisma } from '@travel-architect/db';
import { auth, authEnabled } from '@/app/auth';
import { ARCHIVE_GRACE_MS } from '@/app/lib/archive';

export const runtime = 'nodejs';

async function ownedPlan(planId: string) {
  const plan = await prisma.tripPlan.findUnique({ where: { id: planId } });
  if (!plan) return null;

  if (authEnabled()) {
    const session = await auth();
    if (!session?.user?.id || session.user.id !== plan.userId) return null;
  }
  return plan;
}

/** Archive — the delete the user sees. */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ planId: string }> },
) {
  const { planId } = await params;
  const plan = await ownedPlan(planId);
  if (!plan) return NextResponse.json({ error: 'not found' }, { status: 404 });

  await prisma.tripPlan.update({
    where: { id: planId },
    data: { archivedAt: new Date() },
  });

  return NextResponse.json({ archived: true, planId });
}

/** Restore — the undo. */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ planId: string }> },
) {
  const { planId } = await params;
  const plan = await ownedPlan(planId);
  if (!plan) return NextResponse.json({ error: 'not found' }, { status: 404 });

  if (plan.archivedAt && Date.now() - plan.archivedAt.getTime() > ARCHIVE_GRACE_MS) {
    return NextResponse.json(
      { error: 'That trip has already been removed for good.' },
      { status: 410 },
    );
  }

  await prisma.tripPlan.update({
    where: { id: planId },
    data: { archivedAt: null },
  });

  return NextResponse.json({ restored: true, planId });
}
