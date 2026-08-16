// Manual driver:  npx tsx agent/src/cli.ts plan "Denver, Colorado" 2026-09-12 2026-09-14
import { prisma } from '@travel-architect/db';
import { runPlan } from './run';

const [command, destination, startDate, endDate] = process.argv.slice(2);

if (command !== 'plan' || !destination || !startDate || !endDate) {
  console.error('usage: tsx agent/src/cli.ts plan "<destination>" <start YYYY-MM-DD> <end YYYY-MM-DD>');
  process.exit(1);
}

const user = await prisma.user.upsert({
  where: { email: 'demo@travel-architect.local' },
  create: { email: 'demo@travel-architect.local', name: 'Demo Traveller' },
  update: {},
});

const plan = await prisma.tripPlan.create({
  data: {
    userId: user.id,
    destination,
    destinationLat: 0,
    destinationLng: 0,
    startDate: new Date(`${startDate}T00:00:00.000Z`),
    endDate: new Date(`${endDate}T00:00:00.000Z`),
    pace: 'MODERATE',
    interests: ['history', 'food'],
    dietaryPreference: null,
    mustVisit: [],
  },
});

console.log(`\nplan ${plan.id} — ${destination} ${startDate} → ${endDate}\n`);

const result = await runPlan(plan.id, { verbose: true });

console.log(`\n✅ saved`);
console.log(`   turns    ${result.turns}`);
console.log(`   cost     $${result.costUsd.toFixed(4)}`);
console.log(`   duration ${(result.durationMs / 1000).toFixed(1)}s`);

const days = await prisma.dayPlan.findMany({
  where: { planId: plan.id },
  orderBy: { dayNumber: 'asc' },
  include: {
    weather: true,
    slots: { orderBy: { sequenceOrder: 'asc' }, include: { place: true, backupPlace: true } },
  },
});

for (const d of days) {
  console.log(`\nDay ${d.dayNumber} — ${d.neighbourhoodLabel} (${d.weather?.condition ?? 'no forecast'})`);
  for (const s of d.slots) {
    console.log(`  ${s.scheduledTime}  ${s.place.name}`);
    console.log(`         ↳ ${s.rationale}`);
    console.log(`         backup: ${s.backupPlace?.name ?? '—'}`);
  }
}

await prisma.$disconnect();
