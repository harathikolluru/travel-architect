import { isOpenAt, hoursOn } from '../app/lib/opening-hours.ts';
// weekday: 0=Sun. Thursday = 4.
const cases: [string, number, string, string][] = [
  ['Mo-Th 16:00-22:00; Fr 11:00-23:00; Sa, Su 11:00-22:00', 4, '14:30', 'closed (Thu opens 16:00)'],
  ['Mo-Th 16:00-22:00; Fr 11:00-23:00; Sa, Su 11:00-22:00', 4, '18:00', 'open'],
  ['Mo-Th 16:00-22:00; Fr 11:00-23:00; Sa, Su 11:00-22:00', 5, '12:00', 'open (Fri from 11:00)'],
  ['Mo-Su 10:00-17:30', 3, '10:00', 'open (boundary)'],
  ['Mo-Su 10:00-17:30', 3, '17:30', 'closed (boundary)'],
  ['Mo-Su,Su 10:00-17:00; Fr,Sa 10:00-21:00', 5, '20:00', 'open'],
  ['Su-Th 11:00-21:00; Fr-Sa 11:00-00:00', 5, '23:00', 'open (past midnight)'],
  ['Mo-Th 11:00-21:30; We-Fr 11:00-22:30', 1, '22:00', 'closed'],
  ['24/7', 2, '03:00', 'open'],
  ['Mo-Fr 09:00-17:00; PH off', 1, '10:00', 'open (PH ignored)'],
  ['Tu-Su 10:00-18:00; Mo off', 1, '12:00', 'closed (Mo off)'],
  ['sunrise-sunset', 3, '12:00', 'unknown (unparseable)'],
  ['Mo-Fr 09:00-12:00,13:00-17:00', 3, '12:30', 'closed (lunch gap)'],
];
let bad = 0;
for (const [raw, wd, time, expect] of cases) {
  const got = isOpenAt(raw, wd, time);
  const ok = expect.startsWith(got);
  if (!ok) bad++;
  console.log(`${ok ? '✓' : '✗'} ${got.padEnd(7)} expected ${expect.padEnd(26)} ${raw.slice(0, 42)}`);
}
console.log(`\nhoursOn(Thu): ${hoursOn('Mo-Th 16:00-22:00; Fr 11:00-23:00', 4)}`);
console.log(bad === 0 ? '\nall pass' : `\n${bad} FAILED`);
