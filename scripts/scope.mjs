#!/usr/bin/env node
// Exercise places-clusterer against a real destination.
//   npx tsx scripts/scope.mjs "Sedona, Arizona" 3
import 'dotenv/config';
import { scopeDestination, isGoogleEnabled } from '../packages/mcp/src/index.ts';

const destination = process.argv[2];
const days = Number(process.argv[3] ?? 3);

if (!destination) {
  console.error('usage: node scripts/scope.mjs "<destination>" [days]');
  process.exit(1);
}

console.log(`\nScoping "${destination}" for a ${days}-day trip`);
console.log(`Google enrichment: ${isGoogleEnabled() ? 'ON' : 'off (OSM only)'}\n`);

const started = Date.now();
const scope = await scopeDestination(destination, days);

if (!scope) {
  console.error(`Could not geocode "${destination}".`);
  process.exit(1);
}

const c = scope.coverage;
const icon = { full: '✅', limited: '⚠️ ', insufficient: '❌' }[c.viability];

console.log(`Resolved      ${scope.geocoding.displayName}`);
console.log(`Coordinates   ${scope.geocoding.lat.toFixed(4)}, ${scope.geocoding.lng.toFixed(4)}`);
console.log(`Sources       ${scope.providers.join(' + ')}`);
console.log(`Elapsed       ${((Date.now() - started) / 1000).toFixed(1)}s\n`);

console.log(`${icon} viability: ${c.viability.toUpperCase()}`);
console.log(`   usable restaurants   ${c.usableRestaurants} / ${c.requiredRestaurants} required`);
console.log(`   total restaurants    ${c.totalRestaurants}`);
console.log(`   attractions          ${c.totalAttractions} (${c.attractionsWithHours} with hours)`);
if (c.warning) console.log(`\n   "${c.warning}"`);

const sample = scope.restaurants.filter((r) => r.dataCoverageFlag === 'rich' && r.cuisineTags.length).slice(0, 3);
if (sample.length) {
  console.log('\n   sample usable restaurants:');
  for (const r of sample) {
    console.log(`     • ${r.name} — ${r.cuisineTags.join(', ')} — ${r.openingHoursRaw ?? 'no hours'}`);
  }
}
console.log();
