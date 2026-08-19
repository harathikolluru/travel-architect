import '../app/lib/mcp-setup.ts';
import { prisma } from '@travel-architect/db';
import { geocode } from '@travel-architect/mcp';

const plans = await prisma.tripPlan.findMany({ select: { id: true, destination: true } });
const seen = new Map<string, { name: string; lat: number; lng: number }>();

for (const p of plans) {
  const key = p.destination.toLowerCase();
  if (!seen.has(key)) {
    const g = await geocode(p.destination).catch(() => null);
    if (!g) { console.log(`skip (no geocode): ${p.destination}`); continue; }
    seen.set(key, { name: g.displayName.split(',')[0].trim(), lat: g.lat, lng: g.lng });
  }
  const r = seen.get(key)!;
  if (r.name !== p.destination) {
    await prisma.tripPlan.update({
      where: { id: p.id },
      data: { destination: r.name, destinationLat: r.lat, destinationLng: r.lng },
    });
    console.log(`${p.destination} → ${r.name}`);
  }
}
await prisma.$disconnect();
