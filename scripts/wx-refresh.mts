import '../app/lib/mcp-setup.ts';
import { prisma } from '@travel-architect/db';
import { getForecast, geocode } from '@travel-architect/mcp';

const planId = 'cmsz6ecix0001uiildiu5bdam';
const plan = await prisma.tripPlan.findUniqueOrThrow({ where: { id: planId } });
const days = await prisma.dayPlan.findMany({ where: { planId }, orderBy: { dayNumber: 'asc' } });
const geo = await geocode(plan.destination);
const fresh = await getForecast({
  lat: geo!.lat, lng: geo!.lng,
  startDate: days[0].date.toISOString().slice(0, 10),
  endDate: days[days.length - 1].date.toISOString().slice(0, 10),
});
console.log(`forecast covers ${fresh.length} of ${days.length} days:`);
fresh.forEach(f => console.log(`  ${f.forecastDate}  ${f.condition}  ${f.tempMax}°C`));
await prisma.$disconnect();
