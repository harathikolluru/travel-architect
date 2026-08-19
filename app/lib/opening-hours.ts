// A deliberately partial reader of OSM `opening_hours`.
//
// The real grammar is large — month rules, holidays, sunset offsets, "open
// ended" times. Implementing it properly is a library-sized job, and a wrong
// parse would assert hours we cannot stand behind, which is the same class of
// mistake as inventing a temperature.
//
// So this understands only unambiguous day/time patterns and returns `unknown`
// for everything else. A missed warning costs the traveller nothing; a false
// "that's closed" would cost them a stop they could have kept.

const DAYS = ['su', 'mo', 'tu', 'we', 'th', 'fr', 'sa'];

export type OpenState = 'open' | 'closed' | 'unknown';

interface Interval {
  days: Set<number>;
  fromMin: number;
  toMin: number;
}

function toMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  // 24:00 is a legitimate closing time meaning end of day.
  if (h > 24 || min > 59) return null;
  return h * 60 + min;
}

/** "Mo-Th", "Sa,Su", "Mo" → day indices. Null if anything is unrecognised. */
function parseDays(spec: string): Set<number> | null {
  const out = new Set<number>();
  for (const part of spec.split(',')) {
    const token = part.trim().toLowerCase();
    if (!token) continue;

    const range = /^([a-z]{2})-([a-z]{2})$/.exec(token);
    if (range) {
      const from = DAYS.indexOf(range[1]);
      const to = DAYS.indexOf(range[2]);
      if (from === -1 || to === -1) return null;
      // Ranges may wrap, e.g. Fr-Mo.
      for (let i = from; ; i = (i + 1) % 7) {
        out.add(i);
        if (i === to) break;
      }
      continue;
    }

    const single = DAYS.indexOf(token);
    if (single === -1) return null;
    out.add(single);
  }
  return out.size > 0 ? out : null;
}

/**
 * Returns null when any rule is not fully understood, so callers can tell
 * "closed" apart from "we could not read this".
 */
function parse(raw: string): Interval[] | null {
  const intervals: Interval[] = [];

  for (const rule of raw.split(';')) {
    const text = rule.trim();
    if (!text) continue;

    // Public-holiday rules say nothing about a specific date we can check.
    if (/^ph\b/i.test(text)) continue;
    // 24/7 is unambiguous.
    if (/^24\/7$/i.test(text)) {
      intervals.push({ days: new Set([0, 1, 2, 3, 4, 5, 6]), fromMin: 0, toMin: 1440 });
      continue;
    }

    // "Mo off" — a genuine closure, expressed as the absence of an interval.
    // Checked before the time rule, whose pattern requires a digit.
    const closed = /^([A-Za-z,\-\s]+?)\s+off$/i.exec(text);
    if (closed) {
      if (!parseDays(closed[1])) return null;
      continue;
    }

    // The day spec may contain spaces after commas ("Sa, Su"), so anchor the
    // split on the digit that starts the time rather than the first space.
    const m = /^([A-Za-z,\-\s]+?)\s+(\d.*)$/.exec(text);
    if (!m) return null;

    const days = parseDays(m[1]);
    if (!days) return null;

    const timeSpec = m[2].trim();

    for (const span of timeSpec.split(',')) {
      const t = /^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/.exec(span.trim());
      if (!t) return null;
      const fromMin = toMinutes(t[1]);
      const toMin = toMinutes(t[2]);
      if (fromMin === null || toMin === null) return null;
      intervals.push({ days, fromMin, toMin });
    }
  }

  return intervals.length > 0 ? intervals : null;
}

/**
 * Is `time` within opening hours on `weekday`?
 *
 * @param raw      the source string, verbatim
 * @param weekday  0 = Sunday
 * @param time     "HH:MM"
 */
export function isOpenAt(raw: string | null, weekday: number, time: string): OpenState {
  if (!raw) return 'unknown';

  const intervals = parse(raw);
  if (!intervals) return 'unknown';

  const minutes = toMinutes(time);
  if (minutes === null) return 'unknown';

  for (const iv of intervals) {
    // Past-midnight closings, e.g. 17:00-01:00, belong to the opening day.
    const wraps = iv.toMin <= iv.fromMin;
    if (iv.days.has(weekday) && minutes >= iv.fromMin && (wraps || minutes < iv.toMin)) {
      return 'open';
    }
    if (wraps) {
      const prev = (weekday + 6) % 7;
      if (iv.days.has(prev) && minutes < iv.toMin) return 'open';
    }
  }

  return 'closed';
}

/** The hours that apply on one weekday, for a "usually 16:00-22:00" hint. */
export function hoursOn(raw: string | null, weekday: number): string | null {
  if (!raw) return null;
  const intervals = parse(raw);
  if (!intervals) return null;

  const today = intervals
    .filter((iv) => iv.days.has(weekday))
    .map((iv) => `${fmt(iv.fromMin)}–${fmt(iv.toMin)}`);

  return today.length > 0 ? today.join(', ') : null;
}

function fmt(min: number): string {
  return `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}
