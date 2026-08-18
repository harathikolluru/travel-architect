import { NextResponse } from 'next/server';
import { prisma } from '@travel-architect/db';
import { auth, authEnabled } from '@/app/auth';
import { reapStaleJobs } from '@/app/lib/jobs';
import { MAX_TRIP_DAYS } from '@/app/lib/trip-limits';

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

  // Ownership is checked before any mutation below: the pace and date branches
  // write to the plan, so a later check would let anyone holding an id edit
  // someone else's trip.
  if (authEnabled()) {
    const session = await auth();
    if (!session?.user?.id || session.user.id !== plan.userId) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
  }

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

  // Date changes: the trip can move, grow, or shrink. Days are re-dated,
  // created, or deleted here so the agent reads the new shape from
  // get_current_plan rather than being told about it second-hand; it is then
  // responsible for filling any empty days and re-validating opening hours.
  if (trigger === 'dates_change' && (body.startDate || body.endDate)) {
    const DAY_MS = 86_400_000;
    const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const iso = (d: Date) => d.toISOString().slice(0, 10);

    const newStart = body.startDate
      ? new Date(`${body.startDate}T00:00:00.000Z`)
      : plan.startDate;
    const newEnd = body.endDate ? new Date(`${body.endDate}T00:00:00.000Z`) : plan.endDate;

    if (Number.isNaN(newStart.getTime()) || Number.isNaN(newEnd.getTime())) {
      return NextResponse.json({ error: 'invalid date' }, { status: 400 });
    }
    if (newEnd < newStart) {
      return NextResponse.json({ error: 'The end date must be after the start.' }, { status: 400 });
    }

    const shiftMs = newStart.getTime() - plan.startDate.getTime();
    const oldCount = Math.round((plan.endDate.getTime() - plan.startDate.getTime()) / DAY_MS) + 1;
    const newCount = Math.round((newEnd.getTime() - newStart.getTime()) / DAY_MS) + 1;

    if (shiftMs === 0 && newCount === oldCount) {
      return NextResponse.json({ error: 'Those are already your dates.' }, { status: 400 });
    }
    if (newCount > MAX_TRIP_DAYS) {
      return NextResponse.json(
        { error: `Trips longer than ${MAX_TRIP_DAYS} days are not supported yet.` },
        { status: 400 },
      );
    }

    const days = await prisma.dayPlan.findMany({
      where: { planId },
      orderBy: { dayNumber: 'asc' },
      include: { _count: { select: { slots: true } } },
    });

    // Refuse to reshape a plan that is already half-built. Creating days on top
    // of empty ones produced a trip whose banner and contents disagreed.
    const emptyDays = days.filter((d) => d._count.slots === 0);
    if (emptyDays.length > 0) {
      return NextResponse.json(
        {
          error:
            'This plan has days that were never filled in. Let the current update finish, then try again.',
        },
        { status: 409 },
      );
    }

    const kept = days.slice(0, newCount);
    const dropped = days.slice(newCount);

    await prisma.$transaction([
      prisma.tripPlan.update({
        where: { id: planId },
        data: { startDate: newStart, endDate: newEnd },
      }),
      // Re-date the days that survive.
      ...kept.map((d, i) =>
        prisma.dayPlan.update({
          where: { id: d.id },
          data: { date: new Date(newStart.getTime() + i * DAY_MS) },
        }),
      ),
      // Drop days past the new end. Slots and markers cascade.
      ...(dropped.length
        ? [prisma.dayPlan.deleteMany({ where: { id: { in: dropped.map((d) => d.id) } } })]
        : []),
      // Create empty days for any extension; the agent fills them.
      ...Array.from({ length: Math.max(0, newCount - days.length) }, (_, i) => {
        const dayNumber = days.length + i + 1;
        return prisma.dayPlan.create({
          data: {
            planId,
            dayNumber,
            date: new Date(newStart.getTime() + (dayNumber - 1) * DAY_MS),
          },
        });
      }),
    ]);

    const weekdayShift = kept
      .slice(0, 3)
      .map((d, i) => {
        const from = WEEKDAY[d.date.getUTCDay()];
        const to = WEEKDAY[new Date(newStart.getTime() + i * DAY_MS).getUTCDay()];
        return from === to ? null : `Day ${i + 1} ${from}→${to}`;
      })
      .filter(Boolean)
      .join(', ');

    const parts: string[] = [
      `The traveller changed the trip dates. It now runs ${iso(newStart)} to ${iso(newEnd)} ` +
        `(${newCount} day${newCount === 1 ? '' : 's'}, was ${oldCount}).`,
    ];

    if (newCount > oldCount) {
      const added = Array.from({ length: newCount - oldCount }, (_, i) => oldCount + i + 1);
      parts.push(
        `Day${added.length === 1 ? '' : 's'} ${added.join(' and ')} now exist but are EMPTY — ` +
          `plan ${added.length === 1 ? 'it' : 'them'} from scratch. Use search_places to find stops ` +
          `in a part of the city the existing days do not already cover, so the new days add ` +
          `something rather than repeating what is planned. Each needs the full set of stops for ` +
          `the trip's pace, every slot with a distinct backup.`,
      );
    } else if (newCount < oldCount) {
      parts.push(
        `The trip is now shorter. Days beyond ${newCount} have already been removed. Check whether ` +
          `anything essential was only on a removed day and, if so, work it into a remaining day ` +
          `where it fits geographically.`,
      );
    }

    if (weekdayShift) {
      parts.push(
        `Stops now fall on different weekdays (${weekdayShift}, and so on). Check each stop's ` +
          `opening hours against its NEW weekday and replace any that are now closed — a ` +
          `Monday-closed museum landing on a Monday is the classic failure.`,
      );
    }

    parts.push(
      `Re-check the forecast too, since indoor/outdoor choices were made for the old dates. ` +
        `Leave stops that still work.`,
    );

    detail = parts.join('\n\n');
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
      payload: { trigger, pace: body.pace ?? null, startDate: body.startDate ?? null,
      endDate: body.endDate ?? null, detail },
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
          payload: {
            trigger,
            pace: body.pace ?? null,
            startDate: body.startDate ?? null,
            endDate: body.endDate ?? null,
            detail,
            changed: result.changed,
          },
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
