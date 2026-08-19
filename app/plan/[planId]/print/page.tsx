// Printable itinerary (P0.9).
//
// Internal render target for the PDF route — not linked from the UI. Headless
// Chromium loads this page with a signed token and prints it, so the PDF and
// the web view are generated from the same TripPlan and cannot disagree.
// Styled for paper: no chrome, no map tiles.

import { notFound } from 'next/navigation';
import { prisma } from '@travel-architect/db';
import { auth, authEnabled } from '@/app/auth';
import { verifyPrintToken } from '@/app/lib/print-token';
import { hoursOn, isOpenAt } from '@/app/lib/opening-hours';
import styles from './print.module.css';

export const runtime = 'nodejs';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function formatDate(d: Date): string {
  const day = DAY_NAMES[d.getUTCDay()];
  const month = d.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
  return `${day}, ${month} ${d.getUTCDate()}`;
}

export default async function PrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ planId: string }>;
  searchParams: Promise<{ printToken?: string }>;
}) {
  const { planId } = await params;
  const { printToken } = await searchParams;

  const plan = await prisma.tripPlan.findUnique({
    where: { id: planId },
    include: {
      days: {
        orderBy: { dayNumber: 'asc' },
        include: {
          weather: true,
          slots: {
            orderBy: { sequenceOrder: 'asc' },
            include: { place: true, backupPlace: true },
          },
        },
      },
      packingList: { include: { items: { orderBy: { sortOrder: 'asc' } } } },
    },
  });

  if (!plan) notFound();

  // Either a signed-in owner, or the PDF renderer carrying a token scoped to
  // this plan. Headless Chromium has no cookie, so it uses the latter.
  const rendering = verifyPrintToken(planId, printToken ?? null);
  if (authEnabled() && !rendering) {
    const session = await auth();
    if (!session?.user?.id || session.user.id !== plan.userId) notFound();
  }

  const totalStops = plan.days.reduce((n, d) => n + d.slots.length, 0);

  return (
    <main className={styles.sheet}>
      <header className={styles.header}>
        <h1 className={styles.title}>{plan.destination}</h1>
        <p className={styles.meta}>
          {formatDate(plan.startDate)} – {formatDate(plan.endDate)} ·{' '}
          {plan.days.length} {plan.days.length === 1 ? 'day' : 'days'} · {totalStops} stops ·{' '}
          {plan.pace.toLowerCase()} pace
        </p>
        {plan.dietaryPreference && (
          <p className={styles.meta}>Dietary preference: {plan.dietaryPreference}</p>
        )}
        {plan.days.every((d) => d.weather?.tempMax == null) && (
          <p className={styles.meta}>
            No forecast was available for these dates — they fall beyond the forecast horizon.
          </p>
        )}
      </header>

      {plan.days.map((day) => (
        <section key={day.id} className={styles.day}>
          <div className={styles.dayHead}>
            <h2 className={styles.dayTitle}>
              Day {day.dayNumber} · {formatDate(day.date)}
            </h2>
            {day.neighbourhoodLabel && (
              <span className={styles.hood}>{day.neighbourhoodLabel}</span>
            )}
          </div>

          {/* Nothing useful to print when the forecast is absent — "forecast
              unavailable" on every day is noise, and the trip-level note below
              already says it once. */}
          {day.weather && day.weather.tempMax != null && (
            <p className={styles.weather}>
              {day.weather.condition}
              {day.weather.tempMin != null &&
                day.weather.tempMax != null &&
                `, ${Math.round(day.weather.tempMin)}–${Math.round(day.weather.tempMax)}°C`}
              {day.weather.precipitationProbability != null &&
                day.weather.precipitationProbability > 0 &&
                ` · ${Math.round(day.weather.precipitationProbability * 100)}% chance of rain`}
              {day.weather.isIndoorDay && ' · indoor day'}
            </p>
          )}

          <table className={styles.slots}>
            <tbody>
              {day.slots.map((slot) => {
                const showing =
                  slot.activeChoice === 'BACKUP' && slot.backupPlace
                    ? slot.backupPlace
                    : slot.place;
                const alternative =
                  slot.activeChoice === 'BACKUP' ? slot.place : slot.backupPlace;
                const hours = (showing.openingHours as { raw?: string } | null)?.raw;
                // The screen shows this warning inline; on paper the reader has
                // to spot the conflict themselves unless we carry it across.
                const weekday = day.date.getUTCDay();
                const closed = isOpenAt(hours ?? null, weekday, slot.scheduledTime) === 'closed';
                const todaysHours = hoursOn(hours ?? null, weekday);
                return (
                  <tr key={slot.id} className={styles.slot}>
                    <td className={styles.time}>{slot.scheduledTime}</td>
                    <td>
                      <div className={styles.place}>{showing.name}</div>
                      <div className={styles.rationale}>{slot.rationale}</div>
                      <div className={styles.detail}>
                        {/* Prefer just this weekday's hours: some sources carry
                            long seasonal rules that wrap across lines on paper.
                            Falls back to the raw string when unparseable. */}
                        {todaysHours
                          ? `${todaysHours} on this day`
                          : (hours ?? 'Hours unconfirmed — check before you go')}
                        {showing.address && ` · ${showing.address}`}
                      </div>
                      {closed && (
                        <div className={styles.warning}>
                          ⚠ Looks closed at {slot.scheduledTime}
                          {todaysHours ? ` — usually ${todaysHours} on this day.` : ' that day.'}
                        </div>
                      )}
                      {alternative && (
                        <div className={styles.backup}>
                          If that does not work: {alternative.name}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}

      {plan.packingList && plan.packingList.items.length > 0 && (
        <section className={styles.packing}>
          <h2 className={styles.dayTitle}>Packing list</h2>
          <ul className={styles.packingItems}>
            {plan.packingList.items.map((item) => (
              <li key={item.id}>
                <span className={styles.checkbox} aria-hidden="true" />
                <strong>{item.itemName}</strong>
                <span className={styles.reason}> — {item.reason}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className={styles.footer}>
        Places, opening hours, and weather come from OpenStreetMap and Open-Meteo.
        Hours marked unconfirmed were not published by the source — verify before travelling.
      </footer>
    </main>
  );
}
