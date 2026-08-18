import '../agent/src/env.ts';
import { prisma } from '@travel-architect/db';
import { runPlan } from '../agent/src/run.ts';

const user = await prisma.user.upsert({
  where: { email: 'demo@travel-architect.local' },
  create: { email: 'demo@travel-architect.local', name: 'Demo Traveller' },
  update: {},
});

const plan = await prisma.tripPlan.create({
  data: {
    userId: user.id,
    destination: 'Denver, Colorado',
    destinationLat: 0,
    destinationLng: 0,
    startDate: new Date('2026-08-24T00:00:00.000Z'),
    endDate: new Date('2026-08-26T00:00:00.000Z'),
    pace: 'MODERATE',
    interests: ['art', 'history'],
    dietaryPreference: 'vegetarian',
    mustVisit: [],
  },
});

console.log(`plan ${plan.id} — Denver, vegetarian, interests: art + history\n`);
const r = await runPlan(plan.id, {});
console.log(`turns=${r.turns} cost=$${r.costUsd.toFixed(3)} ${(r.durationMs / 1000).toFixed(0)}s\n`);

const days = await prisma.dayPlan.findMany({
  where: { planId: plan.id },
  orderBy: { dayNumber: 'asc' },
  include: { slots: { orderBy: { sequenceOrder: 'asc' }, include: { place: true } } },
});

for (const d of days) {
  console.log(`Day ${d.dayNumber} — ${d.neighbourhoodLabel}`);
  for (const s of d.slots) {
    const tags = [...s.place.cuisineTags, ...s.place.dietaryTags].join(', ') || '—';
    console.log(`  ${s.scheduledTime} [${s.slotType}] ${s.place.name}`);
    console.log(`        tags: ${tags}`);
    console.log(`        why:  ${s.rationale}`);
  }
}
await prisma.$disconnect();
