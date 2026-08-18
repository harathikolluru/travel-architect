'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { MAX_TRIP_DAYS } from '../../lib/trip-limits';
import styles from '../itinerary.module.css';

interface Slot {
  id: string;
  time: string;
  slotType: string;
  rationale: string;
  backupRationale: string | null;
  isIndoorAlternative: boolean;
  activeChoice: string;
  dayColor: string;
  sequenceLabel: string;
  place: {
    name: string;
    lat: number;
    lng: number;
    address: string | null;
    category: string;
    cuisineTags: string[];
    isIndoor: boolean;
    openingHours: string | null;
    coverage: string;
  };
  backupPlace: { name: string; lat: number; lng: number; openingHours: string | null } | null;
}

interface Day {
  dayNumber: number;
  date: string;
  neighbourhoodLabel: string | null;
  isComplete: boolean;
  weather: {
    condition: string;
    tempMin: number | null;
    tempMax: number | null;
    precipitationProbability: number | null;
    isIndoorDay: boolean;
  } | null;
  slots: Slot[];
}

interface ReplanEvent {
  id: string;
  trigger: string;
  diffSummary: string;
  triggeredAt: string;
  prevVersion: number;
  newVersion: number;
}

interface PlanPayload {
  plan: {
    id: string;
    destination: string;
    startDate: string;
    endDate: string;
    pace: string;
    status: string;
    version: number;
  };
  job: { type?: string; status: string; error: string | null; changed?: boolean | null } | null;
  replans: ReplanEvent[];
  days: Day[];
  packingItems: { itemName: string; reason: string }[];
}

interface WeatherChange {
  dayNumber: number;
  was: string;
  now: string;
  reason: string;
}

const PACES = ['relaxed', 'moderate', 'packed'] as const;

const STEPS = [
  'Resolving your destination',
  'Checking what data we can verify',
  'Fetching the forecast',
  'Grouping stops by neighbourhood',
  'Sequencing each day',
];

/**
 * Leaflet arrives via CDN <script>, so there is no package to import types
 * from. This covers only the surface we use.
 */
type LatLng = [number, number];
interface LeafletMap {
  setView(c: LatLng, z: number): LeafletMap;
  fitBounds(b: unknown, opts?: { padding: [number, number] }): void;
}
interface LeafletLayer {
  addTo(m: LeafletMap): LeafletLayer;
  bindPopup(html: string): LeafletLayer;
}
interface Leaflet {
  map(el: HTMLElement): LeafletMap;
  tileLayer(url: string, opts: Record<string, unknown>): LeafletLayer;
  marker(c: LatLng, opts: { icon: unknown }): LeafletLayer;
  polyline(pts: LatLng[], opts: Record<string, unknown>): LeafletLayer;
  divIcon(opts: Record<string, unknown>): unknown;
  latLngBounds(pts: LatLng[]): unknown;
}

export default function ItineraryView({ planId }: { planId: string }) {
  const [data, setData] = useState<PlanPayload | null>(null);
  const [step, setStep] = useState(0);
  const [replanning, setReplanning] = useState(false);
  const [replanError, setReplanError] = useState<string | null>(null);
  const [dismissedDiff, setDismissedDiff] = useState<string | null>(null);
  const [swapping, setSwapping] = useState<string | null>(null);
  const [weather, setWeather] = useState<WeatherChange[] | null>(null);
  const [weatherDismissed, setWeatherDismissed] = useState(false);
  const [downloading, setDownloading] = useState(false);
  // Pending date edits, null until the user touches a field.
  const [draftStart, setDraftStart] = useState<string | null>(null);
  const [draftEnd, setDraftEnd] = useState<string | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<unknown>(null);

  const ready = (data?.days.length ?? 0) > 0;
  const failed = data?.job?.status === 'FAILED' && data?.job?.type !== 'REPLAN';
  // Server-side truth, so a reload mid-run still shows the right state.
  const jobInFlight = data?.job?.status === 'QUEUED' || data?.job?.status === 'RUNNING';
  // Once the server has spoken, believe it. `replanning` only covers the gap
  // between clicking and the first poll — on its own it can strand the spinner
  // if a run settles while the page is not polling.
  const busy = jobInFlight || (replanning && data?.job == null);

  // Poll until the agent has written days. Resumes while a re-plan runs so the
  // itinerary refreshes in place when it lands.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      let settled = false;
      try {
        const res = await fetch(`/api/plans/${planId}`);
        if (res.ok) {
          const body: PlanPayload = await res.json();
          if (!cancelled) {
            setData(body);
            settled = body.job?.status === 'DONE' || body.job?.status === 'FAILED';
            if (settled) setReplanning(false);
            // A rejected click must not leave its message beside the spinner
            // of the run that did start.
            if (body.job?.status === 'RUNNING') setReplanError(null);
          }
        }
      } catch {
        // transient — keep polling
      }
      // Never stop entirely: a run that starts later, or state changed outside
      // this tab, would otherwise leave the page showing something stale.
      // Fast while work is in flight, slow once everything has settled.
      if (!cancelled) timer = setTimeout(poll, settled ? 20_000 : 4000);
    }

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [planId, replanning]);

  async function triggerReplan(trigger: string, extra: Record<string, unknown> = {}) {
    setReplanError(null);
    setReplanning(true);
    try {
      const res = await fetch(`/api/plans/${planId}/replan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trigger, ...extra }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Could not start the update');
    } catch (e) {
      setReplanError((e as Error).message);
      setReplanning(false);
    }
  }

  /** Instant — both places were grounded when the plan was built. */
  async function swapSlot(slotId: string) {
    setSwapping(slotId);
    try {
      await fetch(`/api/plans/${planId}/slots/${slotId}/swap`, { method: 'POST' });
      await refresh();
    } finally {
      setSwapping(null);
    }
  }

  async function toggleDayComplete(dayNumber: number, isComplete: boolean) {
    await fetch(`/api/plans/${planId}/days/${dayNumber}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isComplete }),
    });
    await refresh();
  }

  async function refresh() {
    const res = await fetch(`/api/plans/${planId}`);
    if (res.ok) setData(await res.json());
  }

  /**
   * Generates and saves the PDF without leaving the page. The print layout is
   * rendered server-side by Chromium, so there is no preview step — the user's
   * PDF viewer is a better preview than a web page imitating one.
   */
  async function downloadPdf() {
    setDownloading(true);
    try {
      const res = await fetch(`/api/plans/${planId}/pdf`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Could not generate the PDF');
      }
      const blob = await res.blob();
      const name =
        res.headers.get('Content-Disposition')?.match(/filename="(.+?)"/)?.[1] ?? 'itinerary.pdf';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setReplanError((e as Error).message);
    } finally {
      setDownloading(false);
    }
  }

  // Check the forecast once the plan is on screen. The traveller cannot know
  // whether it moved, so the system checks and only speaks up if it did.
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    fetch(`/api/plans/${planId}/weather-check`)
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (!cancelled && body?.stale) setWeather(body.changes);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [ready, planId, data?.plan.version]);

  // Advance the progress copy while waiting, so the wait reads as work.
  useEffect(() => {
    if (ready || failed) return;
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 12000);
    return () => clearInterval(t);
  }, [ready, failed]);

  // Leaflet is loaded from CDN and only initialised once the map div exists.
  // Rebuilt whenever the plan version changes so a re-plan moves the markers.
  const planVersion = data?.plan.version ?? 0;
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const allSlots = data!.days.flatMap((d) => d.slots);
    if (allSlots.length === 0) return;

    // Tear down the previous map before rebuilding — Leaflet throws if you
    // initialise twice on the same container.
    if (mapInstance.current) {
      (mapInstance.current as { remove: () => void }).remove();
      mapInstance.current = null;
    }

    async function initMap() {
      const L = (window as unknown as { L?: Leaflet }).L;
      if (!L) {
        setTimeout(initMap, 200);
        return;
      }

      const map = L.map(mapRef.current!).setView([allSlots[0].place.lat, allSlots[0].place.lng], 13);
      mapInstance.current = map;

      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap contributors © CARTO',
        maxZoom: 19,
      }).addTo(map);

      for (const day of data!.days) {
        const points: [number, number][] = [];
        for (const slot of day.slots) {
          // Plot whichever place is actually showing, so a swap moves the pin.
          const shown =
            slot.activeChoice === 'backup' && slot.backupPlace ? slot.backupPlace : slot.place;
          const color = slot.dayColor;
          const icon = L.divIcon({
            className: '',
            html: `<div style="background:${color};color:#fff;width:26px;height:26px;border-radius:50%;
                   display:flex;align-items:center;justify-content:center;font:600 11px system-ui;
                   border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)">${slot.sequenceLabel}</div>`,
            iconSize: [26, 26],
            iconAnchor: [13, 13],
          });
          L.marker([shown.lat, shown.lng], { icon })
            .addTo(map)
            .bindPopup(
              `<strong>${shown.name}</strong><br>${slot.time} · Day ${day.dayNumber}` +
                `<br><em>${slot.rationale}</em>` +
                (shown.openingHours ? `<br><small>${shown.openingHours}</small>` : ''),
            );
          points.push([shown.lat, shown.lng]);
        }
        if (points.length > 1) {
          L.polyline(points, {
            color: day.slots[0].dayColor,
            weight: 2,
            dashArray: '5,6',
            opacity: 0.7,
          }).addTo(map);
        }
      }

      const bounds = L.latLngBounds(allSlots.map((s) => [s.place.lat, s.place.lng]));
      map.fitBounds(bounds, { padding: [40, 40] });
    }

    initMap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, planVersion]);

  if (failed) {
    return (
      <main className={styles.wrap}>
        <header className={styles.topbar}>
          <Link href="/" className={styles.logo}>✈️ Travel Architect</Link>
          <div className={styles.trip} />
          <Link href="/planner" className={styles.newTrip}>+ New trip</Link>
        </header>
        <div className={styles.centered}>
          <h2>Planning didn&apos;t finish</h2>
          <p className={styles.muted}>{data?.job?.error ?? 'The planner stopped before saving.'}</p>
          <Link href="/planner" className={styles.newTrip}>Try again</Link>
        </div>
      </main>
    );
  }

  if (!ready) {
    return (
      <main className={styles.wrap}>
        <header className={styles.topbar}>
          <Link href="/" className={styles.logo}>✈️ Travel Architect</Link>
          <div className={styles.trip}>
            <span className={styles.dest}>{data?.plan.destination ?? 'Planning…'}</span>
            <span className={styles.dates}>
              {data ? `${data.plan.startDate} → ${data.plan.endDate}` : ''}
            </span>
          </div>
        </header>
        <div className={styles.centered}>
          <div className={styles.spinner} />
          <h2>Building your itinerary</h2>
          <ul className={styles.steps}>
            {STEPS.map((s, i) => (
              <li key={s} className={i <= step ? styles.stepDone : styles.stepPending}>
                {i < step ? '✓' : i === step ? '•' : '○'} {s}
              </li>
            ))}
          </ul>
          <p className={styles.muted}>
            This takes a few minutes. We look up real places, hours, and weather rather than
            guessing.
          </p>
        </div>
      </main>
    );
  }

  const d = data!;
  const first = d.days[0];
  const datesDirty =
    (draftStart !== null && draftStart !== d.plan.startDate) ||
    (draftEnd !== null && draftEnd !== d.plan.endDate);
  const latestDiff = d.replans?.[0];
  // Hide the previous diff while a new run is in flight — describing the last
  // change beside a spinner for the next one reads as though it just happened.
  const showDiff = !busy && latestDiff && latestDiff.id !== dismissedDiff;
  // The agent looked and found nothing worth changing — say so, rather than
  // leaving the spinner to vanish with no explanation.
  const noChangeNeeded =
    d.job?.type === 'REPLAN' && d.job.status === 'DONE' && d.job.changed === false;

  return (
    <main className={styles.wrap}>
      <header className={styles.topbar}>
        <Link href="/" className={styles.logo}>✈️ Travel Architect</Link>
        <div className={styles.trip}>
          <span className={styles.dest}>{d.plan.destination}</span>
          <span className={styles.dates}>
            {d.plan.startDate} → {d.plan.endDate}
            {d.plan.version > 1 && (
              <span className={styles.version}> · v{d.plan.version}</span>
            )}
          </span>
        </div>
        <Link href="/trips" className={styles.printLink}>
          Your trips
        </Link>
        <button
          type="button"
          className={styles.printLink}
          onClick={downloadPdf}
          disabled={downloading}
        >
          {downloading ? 'Preparing…' : 'Download PDF'}
        </button>
        <Link href="/planner" className={styles.newTrip}>+ New trip</Link>
      </header>

      {showDiff && (
        <div className={styles.diffBanner}>
          <span className={styles.diffLabel}>Updated</span>
          <span className={styles.diffText}>{latestDiff.diffSummary}</span>
          <button
            className={styles.diffDismiss}
            onClick={() => setDismissedDiff(latestDiff.id)}
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {noChangeNeeded && !showDiff && (
        <div className={styles.noChangeBanner}>
          Checked — nothing needed changing. Your plan already holds up.
        </div>
      )}

      {weather && weather.length > 0 && !weatherDismissed && !busy && (
        <div className={styles.weatherAlert}>
          <span className={styles.alertIcon}>🌧️</span>
          <span className={styles.alertText}>
            The forecast moved for{' '}
            {weather.map((w, i) => (
              <span key={w.dayNumber}>
                {i > 0 && (i === weather.length - 1 ? ' and ' : ', ')}
                <strong>Day {w.dayNumber}</strong> ({w.reason})
              </span>
            ))}
            .
          </span>
          <button
            className={styles.alertAction}
            onClick={() => {
              setWeatherDismissed(true);
              triggerReplan('weather_change', {
                detail: weather
                  .map((w) => `Day ${w.dayNumber}: was ${w.was}, now ${w.now} — ${w.reason}.`)
                  .join(' '),
              });
            }}
          >
            Update those days
          </button>
          <button
            className={styles.alertDismiss}
            onClick={() => setWeatherDismissed(true)}
            aria-label="Keep the plan as it is"
          >
            Keep as is
          </button>
        </div>
      )}

      <div className={styles.replanBar}>
        {busy ? (
          <span className={styles.replanning}>
            <span className={styles.miniSpinner} /> Updating your plan — this takes a few minutes…
          </span>
        ) : (
          <>
            <label className={styles.paceLabel} htmlFor="pace">
              Pace
            </label>
            <select
              id="pace"
              className={styles.paceSelect}
              value={d.plan.pace}
              onChange={(e) => triggerReplan('pref_change', { pace: e.target.value })}
            >
              {PACES.map((p) => (
                <option key={p} value={p}>
                  {p[0].toUpperCase() + p.slice(1)}
                  {p === 'relaxed' ? ' · 2–3 stops' : p === 'moderate' ? ' · 3–4 stops' : ' · 4–5 stops'}
                </option>
              ))}
            </select>
            {/* Editing dates is nearly always two edits, so the re-plan waits
                for an explicit confirm. Firing on change started a run against
                half-updated dates and produced days the agent never planned. */}
            <label className={styles.paceLabel} htmlFor="startDate">
              Dates
            </label>
            <input
              id="startDate"
              type="date"
              className={styles.dateInput}
              value={draftStart ?? d.plan.startDate}
              disabled={busy}
              onChange={(e) => setDraftStart(e.target.value)}
            />
            <span className={styles.dateSep}>→</span>
            <input
              id="endDate"
              type="date"
              className={styles.dateInput}
              value={draftEnd ?? d.plan.endDate}
              min={draftStart ?? d.plan.startDate}
              max={new Date(
                Date.parse(`${draftStart ?? d.plan.startDate}T00:00:00.000Z`) +
                  (MAX_TRIP_DAYS - 1) * 86_400_000,
              )
                .toISOString()
                .slice(0, 10)}
              disabled={busy}
              onChange={(e) => setDraftEnd(e.target.value)}
            />
            {datesDirty && (
              <>
                <button
                  type="button"
                  className={styles.applyBtn}
                  onClick={() => {
                    triggerReplan('dates_change', {
                      startDate: draftStart ?? d.plan.startDate,
                      endDate: draftEnd ?? d.plan.endDate,
                    });
                    setDraftStart(null);
                    setDraftEnd(null);
                  }}
                >
                  Update dates
                </button>
                <button
                  type="button"
                  className={styles.cancelBtn}
                  onClick={() => {
                    setDraftStart(null);
                    setDraftEnd(null);
                  }}
                >
                  Cancel
                </button>
              </>
            )}
            <span className={styles.replanHint}>
              Tap ⇄ on any stop to use its backup · check off days as you go
            </span>
          </>
        )}
        {replanError && <span className={styles.replanError}>{replanError}</span>}
      </div>

      {first?.weather && (
        <div className={styles.weatherBanner}>
          {d.days
            .map(
              (day) =>
                `Day ${day.dayNumber}: ${day.weather?.condition ?? 'no forecast'}` +
                (day.weather?.tempMax != null ? ` ${Math.round(day.weather.tempMax)}°C` : '') +
                (day.weather?.isIndoorDay ? ' — indoor backups ready' : ''),
            )
            .join('  ·  ')}
        </div>
      )}

      <div className={styles.layout}>
        <aside className={styles.panel}>
          {d.days.map((day) => (
            <div
              key={day.dayNumber}
              className={`${styles.dayCard} ${day.isComplete ? styles.dayDone : ''}`}
            >
              <div
                className={styles.dayHeader}
                style={{ borderLeft: `4px solid ${day.slots[0]?.dayColor ?? '#2563eb'}` }}
              >
                <label className={styles.dayCheck} title="Mark this day done">
                  <input
                    type="checkbox"
                    checked={day.isComplete}
                    onChange={(e) => toggleDayComplete(day.dayNumber, e.target.checked)}
                  />
                </label>
                Day {day.dayNumber} · {day.date}
                <span className={styles.hood}>{day.neighbourhoodLabel}</span>
              </div>
              {day.slots.length === 0 && (
                <div className={styles.dayPending}>
                  {busy ? (
                    <>
                      <span className={styles.miniSpinner} /> Planning this day…
                    </>
                  ) : (
                    'This day has no stops yet — change the dates or pace to plan it.'
                  )}
                </div>
              )}
              {day.slots.map((slot) => {
                const onBackup = slot.activeChoice === 'backup';
                const showing = onBackup && slot.backupPlace ? slot.backupPlace : slot.place;
                const alternative = onBackup ? slot.place : slot.backupPlace;
                return (
                  <div key={slot.id} className={styles.slot}>
                    <span className={styles.time}>{slot.time}</span>
                    <span className={styles.icon}>{slot.slotType === 'meal' ? '🍽️' : '🏛️'}</span>
                    <div className={styles.slotBody}>
                      <div className={styles.slotName}>
                        {showing.name}
                        {onBackup && <span className={styles.swappedTag}>backup</span>}
                      </div>
                      <div className={styles.rationale}>{slot.rationale}</div>
                      <div className={styles.hours}>
                        {showing.openingHours ?? 'Hours unconfirmed'}
                      </div>
                      {alternative && (
                        <button
                          className={styles.swapBtn}
                          onClick={() => swapSlot(slot.id)}
                          disabled={swapping === slot.id || day.isComplete}
                          title={`Switch to ${alternative.name}`}
                        >
                          {swapping === slot.id ? '…' : '⇄'} {alternative.name}
                          {slot.isIndoorAlternative && !onBackup && ' (indoor)'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

          {d.packingItems.length > 0 && (
            <div className={styles.packingList}>
              <h3>🎒 Packing list</h3>
              <ul>
                {d.packingItems.map((item) => (
                  <li key={item.itemName}>
                    <strong>{item.itemName}</strong> — {item.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>

        <div ref={mapRef} className={styles.map} />
      </div>
    </main>
  );
}
