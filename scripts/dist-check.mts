import '../app/lib/mcp-setup.ts';
import { prisma } from '@travel-architect/db';
import { findCandidates } from '../app/lib/candidates.ts';
import { MILES_PER_KM, distanceKm } from '@travel-architect/contracts';

const planId = 'cmsz6ecix0001uiildiu5bdam';
const slots = await prisma.itinerarySlot.findMany({
  where: { day: { planId, dayNumber: 3 } },
  include: { place: true },
});
const anchor = {
  lat: slots.reduce((n, s) => n + s.place.lat, 0) / slots.length,
  lng: slots.reduce((n, s) => n + s.place.lng, 0) / slots.length,
};
console.log(`Day 3 anchor (${slots.length} stops): ${anchor.lat.toFixed(4)}, ${anchor.lng.toFixed(4)}\n`);
for (const p of await findCandidates('new york', 'oda house')) {
  const mi = distanceKm(anchor, { lat: p.lat, lng: p.lng }) * MILES_PER_KM;
  console.log(`${mi.toFixed(1).padStart(5)} mi  ${p.name} — ${p.address}`);
}
await prisma.$disconnect();
