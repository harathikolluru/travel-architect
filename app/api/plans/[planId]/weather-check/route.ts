// Detect whether the forecast has moved since the plan was built.
//
// The user has no way of knowing this, so asking them ("Weather changed?") was
// the wrong interaction. The system checks, and only surfaces a prompt when
// something genuinely shifted.

import { NextResponse } from 'next/server';
import { prisma } from '@travel-architect/db';
import { auth, authEnabled } from '@/app/auth';

export const runtime = 'nodejs';

/** Below this, a change is noise the traveller would not act on. */
const PRECIP_DELTA = 0.25; // 25 percentage points
const TEMP_DELTA_C = 6;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ planId: string }> },
) {
  const { planId } = await params;

  const plan = await prisma.tripPlan.findUnique({ where: { id: planId } });
  if (!plan) return NextResponse.json({ error: 'not found' }, { status: 404 });

  if (authEnabled()) {
    const session = await auth();
    if (!session?.user?.id || session.user.id !== plan.userId) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
  }

  const days = await prisma.dayPlan.findMany({
    where: { planId, isComplete: false },
    include: { weather: true },
    orderBy: { dayNumber: 'asc' },
  });
  if (days.length === 0) return NextResponse.json({ stale: false, changes: [] });

  const { getForecast, ForecastOutOfRangeError, geocode } = await import('@travel-architect/mcp');

  let fresh;
  try {
    const geo = await geocode(plan.destination);
    if (!geo) return NextResponse.json({ stale: false, changes: [] });
    fresh = await getForecast({
      lat: geo.lat,
      lng: geo.lng,
      startDate: days[0].date.toISOString().slice(0, 10),
      endDate: days[days.length - 1].date.toISOString().slice(0, 10),
    });
  } catch (e) {
    // Out-of-range dates are expected for trips months out — not an error.
    if (e instanceof ForecastOutOfRangeError) {
      return NextResponse.json({ stale: false, changes: [] });
    }
    return NextResponse.json({ stale: false, changes: [], error: (e as Error).message });
  }

  const byDate = new Map(fresh.map((f) => [f.forecastDate, f]));
  const changes: { dayNumber: number; was: string; now: string; reason: string }[] = [];

  for (const day of days) {
    const stored = day.weather;
    const current = byDate.get(day.date.toISOString().slice(0, 10));
    if (!stored || !current) continue;

    const precipShift = Math.abs(current.precipitationProbability - stored.precipitationProbability);
    const tempShift = Math.abs(current.tempMax - stored.tempMax);
    const indoorFlipped = current.isIndoorDay !== stored.isIndoorDay;

    if (indoorFlipped || precipShift >= PRECIP_DELTA || tempShift >= TEMP_DELTA_C) {
      changes.push({
        dayNumber: day.dayNumber,
        was: `${stored.condition}, ${Math.round(stored.tempMax)}°C`,
        now: `${current.condition}, ${Math.round(current.tempMax)}°C`,
        reason: indoorFlipped
          ? current.isIndoorDay
            ? 'now an indoor day'
            : 'no longer needs indoor backups'
          : precipShift >= PRECIP_DELTA
            ? `rain chance moved ${Math.round(precipShift * 100)} points`
            : `high moved ${Math.round(tempShift)}°C`,
      });
    }
  }

  return NextResponse.json({ stale: changes.length > 0, changes });
}
