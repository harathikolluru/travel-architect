// Detect whether the forecast has moved since the plan was built.
//
// The user has no way of knowing this, so asking them ("Weather changed?") was
// the wrong interaction. The system checks, and only surfaces a prompt when
// something genuinely shifted.

import { NextResponse } from 'next/server';
import { prisma } from '@travel-architect/db';
import { auth, authEnabled } from '@/app/auth';
import '@/app/lib/mcp-setup';

export const runtime = 'nodejs';

/**
 * Pull the current forecast into the plan.
 *
 * Deliberately not a re-plan: refreshing weather needs no judgement, and
 * save_replan cannot write WeatherForecast rows anyway — so routing this
 * through the agent produced a run that reported success and changed nothing.
 * The agent is still the right tool for *reacting* to a changed forecast; this
 * just makes sure the data is there to react to.
 */
export async function POST(
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
    where: { planId },
    orderBy: { dayNumber: 'asc' },
  });
  if (days.length === 0) return NextResponse.json({ updated: 0 });

  const { getForecast, ForecastOutOfRangeError, geocode } = await import('@travel-architect/mcp');

  let fresh;
  try {
    const geo = await geocode(plan.destination);
    if (!geo) return NextResponse.json({ updated: 0 });
    fresh = await getForecast({
      lat: geo.lat,
      lng: geo.lng,
      startDate: days[0].date.toISOString().slice(0, 10),
      endDate: days[days.length - 1].date.toISOString().slice(0, 10),
    });
  } catch (e) {
    if (e instanceof ForecastOutOfRangeError) return NextResponse.json({ updated: 0 });
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }

  const byDate = new Map(fresh.map((f) => [f.forecastDate, f]));
  let updated = 0;

  for (const day of days) {
    const f = byDate.get(day.date.toISOString().slice(0, 10));
    if (!f) continue;

    const weather = await prisma.weatherForecast.upsert({
      where: {
        destination_forecastDate: {
          destination: plan.destination,
          forecastDate: day.date,
        },
      },
      create: {
        destination: plan.destination,
        forecastDate: day.date,
        condition: f.condition,
        tempMin: f.tempMin,
        tempMax: f.tempMax,
        precipitationProbability: f.precipitationProbability,
        windSpeed: f.windSpeed,
        isIndoorDay: f.isIndoorDay,
      },
      update: {
        condition: f.condition,
        tempMin: f.tempMin,
        tempMax: f.tempMax,
        precipitationProbability: f.precipitationProbability,
        windSpeed: f.windSpeed,
        isIndoorDay: f.isIndoorDay,
      },
    });

    await prisma.dayPlan.update({
      where: { id: day.id },
      data: { weatherId: weather.id },
    });
    updated++;
  }

  return NextResponse.json({ updated });
}

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

    // A day planned with no forecast now has one: the horizon moved forward.
    // Worth surfacing — this is new information, not a change in conditions.
    if (stored.tempMax == null || stored.precipitationProbability == null) {
      if (current.tempMax != null) {
        changes.push({
          dayNumber: day.dayNumber,
          was: 'no forecast',
          now: `${current.condition}, ${Math.round(current.tempMax)}°C`,
          reason: 'a forecast is now available',
        });
      }
      continue;
    }
    // Open-Meteo always returns these for dates it covers, but the type allows
    // absence, so narrow rather than assert.
    if (current.tempMax == null || current.precipitationProbability == null) continue;

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
