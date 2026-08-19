import { findCandidates } from '../app/lib/candidates.ts';
for (const [label, q] of [['cold', 'miriam'], ['warm', 'mir'], ['warm', 'central']] as const) {
  const t = Date.now();
  const r = await findCandidates('new york', q);
  console.log(`${label.padEnd(5)} "${q}" → ${r.length} results in ${Date.now() - t}ms`);
}
