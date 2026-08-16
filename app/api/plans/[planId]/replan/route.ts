import { NextResponse } from 'next/server';
import { prisma } from '@travel-architect/db';
import { auth, authEnabled } from '@/app/auth';
import { reapStaleJobs } from '@/app/lib/jobs';

export const runtime = 'nodejs';
export const maxDuration = 600;

const TRIGGERS = ['weather_change', 'day_complete', 'slot_swap', 'pref_change', 'dates_change'] as const;
type Trigger = (typeof TRIGGERS)[number];

export async function POST(
  req: Request,
  { params }: { params: Promise<{ planId: string }> },
) {
  const { planId } = await params;
  const body = await req.json().catch(() => ({}));
  const trigger = body.trigger as Trigger;

  if (!TRIGGERS.includes(trigger)) {
    return NextResponse.json(
      { error: `trigger must be one of: ${TRIGGERS.join(', ')}` },
      { status: 400 },
    );
  }

  const plan = await prisma.tripPlan.findUnique({ where: { id: planId } });
  if (!plan) return NextResponse.json({ error: 'not found' }, { status: 404 });

  // A pace change is a real edit to the trip, not just a hint to the agent —
  // persist it first so the constraints tool reports the new value.
  let detail: string | undefined = body.detail;
  if (trigger === 'pref_change' && body.pace) {
    const PACE = { relaxed: 'RELAXED', moderate: 'MODERATE', packed: 'PACKED' } as const;
    const BOUNDS = { RELAXED: '2-3', MODERATE: '3-4', PACKED: '4-5' } as const;
    const next = PACE[body.pace as keyof typeof PACE];
    if (!next) return NextResponse.json({ error: 'invalid pace' }, { status: 400 });
    if (next === plan.pace) {
      return NextResponse.json({ error: 'That is already your pace.' }, { status: 400 });
    }
    await prisma.tripPlan.update({ where: { id: planId }, data: { pace: next } });

    // Spell out the before and after. Without this the agent reads the new
    // pace as though it were the original intent and concludes nothing needs
    // doing — which is exactly what happened before this was added.
    const wasFewer = BOUNDS[plan.pace] < BOUNDS[next];
    detail =
      `The traveller changed pace from ${plan.pace.toLowerCase()} (${BOUNDS[plan.pace]} stops/day) ` +
      `to ${next.toLowerCase()} (${BOUNDS[next]} stops/day). Every incomplete day must now hold ` +
      `${BOUNDS[next]} stops — ` +
      (wasFewer
        ? `add stops to days that are short, drawn from places near that day's existing centre.`
        : `remove the weakest stop from days that now hold too many, keeping the day's anchor.`) +
      ` This is a structural change: if a day already has the right count, leave it, but say so.`;
  }

  if (authEnabled()) {
    const session = await auth();
    if (!session?.user?.id || session.user.id !== plan.userId) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
  }

  // One re-plan at a time — concurrent runs would race on slot updates.
  const inFlight = await reapStaleJobs(planId);
  if (inFlight) {
    return NextResponse.json(
      { error: 'A plan update is already in progress.' },
      { status: 409 },
    );
  }

  const job = await prisma.agentJob.create({
    data: {
      type: 'REPLAN',
      planId,
      status: 'QUEUED',
      payload: { trigger, pace: body.pace ?? null, detail },
    },
  });

  void (async () => {
    try {
      await prisma.agentJob.update({ where: { id: job.id }, data: { status: 'RUNNING' } });
      const { runReplan } = await import('../../../../../agent/src/run');
      const result = await runReplan(planId, trigger, { detail, jobId: job.id });
      await prisma.agentJob.update({
        where: { id: job.id },
        data: {
          status: 'DONE',
          // `changed: false` is a valid outcome — the UI reports it rather than
          // leaving the user wondering whether anything happened.
          payload: { trigger, pace: body.pace ?? null, detail, changed: result.changed },
        },
      });
    } catch (e) {
      await prisma.agentJob.update({
        where: { id: job.id },
        data: { status: 'FAILED', error: (e as Error).message.slice(0, 500) },
      });
    }
  })();

  return NextResponse.json({ jobId: job.id, planId }, { status: 202 });
}
