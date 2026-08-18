import { NextResponse } from 'next/server';
import { prisma } from '@travel-architect/db';
import { auth, authEnabled } from '@/app/auth';
import { MAX_TRIP_DAYS, todayISO, tripDays } from '@/app/lib/trip-limits';

export const runtime = 'nodejs';
/** Agent runs take minutes; keep the request alive long enough to finish. */
export const maxDuration = 600;

const PACE = { relaxed: 'RELAXED', moderate: 'MODERATE', packed: 'PACKED' } as const;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.destination || !body?.startDate || !body?.endDate) {
    return NextResponse.json(
      { error: 'destination, startDate and endDate are required' },
      { status: 400 },
    );
  }

  const start = new Date(`${body.startDate}T00:00:00.000Z`);
  const end = new Date(`${body.endDate}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return NextResponse.json({ error: 'invalid date range' }, { status: 400 });
  }

  // A trip that has already started cannot be planned around — the forecast is
  // gone and the opening hours were for days that have passed.
  if (body.startDate < todayISO()) {
    return NextResponse.json(
      { error: 'That start date has passed. Pick today or later.' },
      { status: 400 },
    );
  }

  const days = tripDays(body.startDate, body.endDate);
  if (days > MAX_TRIP_DAYS) {
    return NextResponse.json(
      { error: `Trips longer than ${MAX_TRIP_DAYS} days are not supported yet.` },
      { status: 400 },
    );
  }

  // Resolve the destination before creating anything. A state or country bbox
  // produces Overpass queries that hang for minutes, so fail fast with an
  // actionable message instead of leaving the user on a spinner.
  try {
    const { geocode } = await import('@travel-architect/mcp');
    const geo = await geocode(body.destination);
    if (!geo) {
      return NextResponse.json(
        { error: `We couldn't find "${body.destination}". Try including the state, e.g. "Boulder, Colorado".` },
        { status: 400 },
      );
    }
  } catch (e) {
    const { DestinationTooLargeError } = await import('@travel-architect/mcp');
    if (e instanceof DestinationTooLargeError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: `Could not resolve that destination: ${(e as Error).message}` },
      { status: 502 },
    );
  }

  // Signed-in user owns the plan. When no provider is configured (local dev
  // before OAuth credentials are added) fall back to a local demo account so
  // the app stays runnable.
  let userId: string;
  if (authEnabled()) {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Sign in to plan a trip.' }, { status: 401 });
    }
    userId = session.user.id;
  } else {
    const demo = await prisma.user.upsert({
      where: { email: 'demo@travel-architect.local' },
      create: { email: 'demo@travel-architect.local', name: 'Demo Traveller' },
      update: {},
    });
    userId = demo.id;
  }

  const plan = await prisma.tripPlan.create({
    data: {
      userId,
      destination: body.destination,
      destinationLat: 0,
      destinationLng: 0,
      startDate: start,
      endDate: end,
      pace: PACE[body.pace as keyof typeof PACE] ?? 'MODERATE',
      interests: Array.isArray(body.interests) ? body.interests : [],
      dietaryPreference: body.diet || null,
      mustVisit: [],
      status: 'DRAFT',
    },
  });

  const job = await prisma.agentJob.create({
    data: { type: 'GENERATE_PLAN', planId: plan.id, status: 'QUEUED' },
  });

  // Run in the background so the client can start polling immediately. The
  // import is dynamic because the agent pulls in the SDK, which we do not want
  // in the bundle for every other route.
  void (async () => {
    try {
      await prisma.agentJob.update({ where: { id: job.id }, data: { status: 'RUNNING' } });
      const { runPlan } = await import('../../../agent/src/run');
      await runPlan(plan.id, { jobId: job.id });
      await prisma.agentJob.update({ where: { id: job.id }, data: { status: 'DONE' } });
    } catch (e) {
      await prisma.agentJob.update({
        where: { id: job.id },
        data: { status: 'FAILED', error: (e as Error).message.slice(0, 500) },
      });
    }
  })();

  return NextResponse.json({ planId: plan.id, jobId: job.id }, { status: 202 });
}
