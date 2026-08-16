import '../agent/src/env.ts';
import { prisma } from '@travel-architect/db';
import { runReplan } from '../agent/src/run.ts';

const planId = process.argv[2];
const pace = (process.argv[3] ?? 'relaxed') as 'relaxed' | 'moderate' | 'packed';
const BOUNDS = { relaxed: '2-3', moderate: '3-4', packed: '4-5' } as const;
const ENUM = { relaxed: 'RELAXED', moderate: 'MODERATE', packed: 'PACKED' } as const;

const plan = await prisma.tripPlan.findUniqueOrThrow({ where: { id: planId } });
const was = plan.pace.toLowerCase() as keyof typeof BOUNDS;

const before = await prisma.dayPlan.findMany({
  where: { planId }, include: { slots: true }, orderBy: { dayNumber: 'asc' },
});
console.log(`BEFORE (${was}):`, before.map(d => `d${d.dayNumber}:${d.slots.length}`).join(' '));

await prisma.tripPlan.update({ where: { id: planId }, data: { pace: ENUM[pace] } });

const detail =
  `The traveller changed pace from ${was} (${BOUNDS[was]} stops/day) to ${pace} ` +
  `(${BOUNDS[pace]} stops/day). Every incomplete day must now hold ${BOUNDS[pace]} stops — ` +
  `remove the weakest stop from days that hold too many, or add one near that day's existing ` +
  `centre if short. This is a structural change.`;

const r = await runReplan(planId, 'pref_change', { detail });
console.log(`\nchanged=${r.changed}  turns=${r.turns}  cost=$${r.costUsd.toFixed(3)}  ${(r.durationMs/1000).toFixed(0)}s`);
if (r.diffSummary) console.log(`diff: ${r.diffSummary}`);

const after = await prisma.dayPlan.findMany({
  where: { planId }, include: { slots: true }, orderBy: { dayNumber: 'asc' },
});
console.log(`AFTER  (${pace}):`, after.map(d => `d${d.dayNumber}:${d.slots.length}`).join(' '));
await prisma.$disconnect();
