// Search the places already fetched for this destination.
//
// No agent call: places-clusterer has typically pulled thousands of candidates
// for the bounding box, all with real OSM ids and hours. Searching that is both
// instant and keeps the grounding rule intact — a user-added stop is as
// verifiable as an agent-chosen one.

import { NextResponse } from 'next/server';
import { prisma } from '@travel-architect/db';
import { auth, authEnabled } from '@/app/auth';
import { findCandidates } from '@/app/lib/candidates';
import { MILES_PER_KM, distanceKm } from '@travel-architect/contracts';

export const runtime = 'nodejs';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ planId: string }> },
) {
  const { planId } = await params;
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') ?? '').trim();
  const category = url.searchParams.get('category');
  const dayNumber = Number(url.searchParams.get('dayNumber'));

  const plan = await prisma.tripPlan.findUnique({ where: { id: planId } });
  if (!plan) return NextResponse.json({ error: 'not found' }, { status: 404 });

  if (authEnabled()) {
    const session = await auth();
    if (!session?.user?.id || session.user.id !== plan.userId) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
  }

  if (q.length < 2) return NextResponse.json({ places: [] });

  // Distance is measured from the day being edited, not the city centre: what
  // matters is whether a place fits that day's geography.
  const anchorSlots = dayNumber
    ? await prisma.itinerarySlot.findMany({
        where: { day: { planId, dayNumber } },
        include: { place: { select: { lat: true, lng: true } } },
      })
    : [];
  const anchor =
    anchorSlots.length > 0
      ? {
          lat: anchorSlots.reduce((n, s) => n + s.place.lat, 0) / anchorSlots.length,
          lng: anchorSlots.reduce((n, s) => n + s.place.lng, 0) / anchorSlots.length,
        }
      : null;

  let matches;
  try {
    matches = await findCandidates(plan.destination, q, {
      category: category === 'restaurant' || category === 'attraction' ? category : undefined,
    });
  } catch (e) {
    // An unhandled throw here returns an empty body, which the client reports as
    // "Unexpected end of JSON input" — an error about parsing rather than about
    // what actually went wrong.
    return NextResponse.json(
      { error: `Could not search places right now: ${(e as Error).message}`, places: [] },
      { status: 503 },
    );
  }

  const withDistance = matches.map((p) => ({
    place: p,
    miles: anchor
      ? Math.round(distanceKm(anchor, { lat: p.lat, lng: p.lng }) * MILES_PER_KM * 10) / 10
      : null,
  }));

  // Nearest first once we have a day to measure from — with a chain, the
  // closest branch is almost always the one meant.
  if (anchor) withDistance.sort((a, b) => (a.miles ?? 0) - (b.miles ?? 0));

  return NextResponse.json({
    anchored: anchor !== null,
    places: withDistance.map(({ place: p, miles }) => ({
      milesFromDay: miles,
      externalId: p.externalId,
      name: p.name,
      address: p.address ?? null,
      category: p.category,
      cuisineTags: p.cuisineTags,
      dietaryTags: p.dietaryTags,
      isIndoor: p.isIndoor,
      openingHours: p.openingHoursRaw ?? null,
      lat: p.lat,
      lng: p.lng,
    })),
  });
}
