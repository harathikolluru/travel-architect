import '../app/lib/mcp-setup.ts';
import { findCandidates } from '../app/lib/candidates.ts';
const r = await findCandidates('new york', 'oda house');
for (const p of r) {
  console.log(`${p.externalId.padEnd(16)} ${p.name.padEnd(12)} ${p.lat.toFixed(5)},${p.lng.toFixed(5)}  ${p.openingHoursRaw ?? '—'}`);
}
