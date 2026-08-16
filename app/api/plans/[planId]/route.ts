import { NextResponse } from 'next/server';
import { prisma } from '@travel-architect/db';
import { auth, authEnabled } from '@/app/auth';

export const runtime = 'nodejs';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ planId: string }> },
) {
  const { planId } = await params;

  const plan = await prisma.tripPlan.findUnique({
    where: { id: planId },
    include: {
      days: {
        orderBy: { dayNumber: 'asc' },
        include: {
          weather: true,
          slots: {
            orderBy: { sequenceOrder: 'asc' },
            include: { place: true, backupPlace: true, marker: true },
          },
        },
      },
      packingList: { include: { items: { orderBy: { sortOrder: 'asc' } } } },
    },
  });

  if (!plan) return NextResponse.json({ error: 'not found' }, { status: 404 });

  // A plan belongs to its owner. Return 404 rather than 403 so the existence of
  // someone else's plan id is not confirmed.
  if (authEnabled()) {
    const session = await auth();
    if (!session?.user?.id || session.user.id !== plan.userId) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
  }

  const job = await prisma.agentJob.findFirst({
    where: { planId },
    orderBy: { createdAt: 'desc' },
  });

  const replans = await prisma.replanEvent.findMany({
    where: { planId },
    orderBy: { triggeredAt: 'desc' },
    take: 5,
  });

  return NextResponse.json({
    plan: {
      id: plan.id,
      destination: plan.destination,
      startDate: plan.startDate.toISOString().slice(0, 10),
      endDate: plan.endDate.toISOString().slice(0, 10),
      pace: plan.pace.toLowerCase(),
      status: plan.status,
      version: plan.version,
    },
    job: job
      ? {
          type: job.type,
          status: job.status,
          error: job.error,
          changed: (job.payload as { changed?: boolean } | null)?.changed ?? null,
        }
      : null,
    replans: replans.map((r) => ({
      id: r.id,
      trigger: r.triggerType.toLowerCase(),
      diffSummary: r.diffSummary,
      triggeredAt: r.triggeredAt.toISOString(),
      prevVersion: r.prevVersion,
      newVersion: r.newVersion,
    })),
    days: plan.days.map((d) => ({
      dayNumber: d.dayNumber,
      date: d.date.toISOString().slice(0, 10),
      neighbourhoodLabel: d.neighbourhoodLabel,
      isComplete: d.isComplete,
      weather: d.weather
        ? {
            condition: d.weather.condition,
            tempMin: d.weather.tempMin,
            tempMax: d.weather.tempMax,
            precipitationProbability: d.weather.precipitationProbability,
            isIndoorDay: d.weather.isIndoorDay,
          }
        : null,
      slots: d.slots.map((s) => ({
        id: s.id,
        time: s.scheduledTime,
        slotType: s.slotType.toLowerCase(),
        rationale: s.rationale,
        backupRationale: s.backupRationale,
        isIndoorAlternative: s.isIndoorAlternative,
        activeChoice: s.activeChoice.toLowerCase(),
        dayColor: s.marker?.dayColor ?? '#2563eb',
        sequenceLabel: s.marker?.sequenceLabel ?? '',
        place: {
          name: s.place.name,
          lat: s.place.lat,
          lng: s.place.lng,
          address: s.place.address,
          category: s.place.category.toLowerCase(),
          cuisineTags: s.place.cuisineTags,
          isIndoor: s.place.isIndoor,
          openingHours: (s.place.openingHours as { raw?: string } | null)?.raw ?? null,
          coverage: s.place.dataCoverageFlag.toLowerCase(),
        },
        backupPlace: s.backupPlace
          ? {
              name: s.backupPlace.name,
              lat: s.backupPlace.lat,
              lng: s.backupPlace.lng,
              isIndoor: s.backupPlace.isIndoor,
              openingHours: (s.backupPlace.openingHours as { raw?: string } | null)?.raw ?? null,
            }
          : null,
      })),
    })),
    packingItems:
      plan.packingList?.items.map((i) => ({ itemName: i.itemName, reason: i.reason })) ?? [],
  });
}
