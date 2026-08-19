// Open-Meteo forecast. Free, keyless, works for any coordinate on earth —
// the one source with no coverage risk (see docs/spike-data-layer.md).

import type { WeatherSpec } from '@travel-architect/contracts';

const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast';

/** WMO weather codes → human condition + whether it argues for staying inside. */
const WMO: Record<number, { condition: string; indoor: boolean }> = {
  0: { condition: 'clear', indoor: false },
  1: { condition: 'mainly clear', indoor: false },
  2: { condition: 'partly cloudy', indoor: false },
  3: { condition: 'overcast', indoor: false },
  45: { condition: 'fog', indoor: true },
  48: { condition: 'freezing fog', indoor: true },
  51: { condition: 'light drizzle', indoor: false },
  53: { condition: 'drizzle', indoor: true },
  55: { condition: 'heavy drizzle', indoor: true },
  61: { condition: 'light rain', indoor: false },
  63: { condition: 'rain', indoor: true },
  65: { condition: 'heavy rain', indoor: true },
  71: { condition: 'light snow', indoor: false },
  73: { condition: 'snow', indoor: true },
  75: { condition: 'heavy snow', indoor: true },
  80: { condition: 'rain showers', indoor: true },
  81: { condition: 'rain showers', indoor: true },
  82: { condition: 'violent rain showers', indoor: true },
  95: { condition: 'thunderstorm', indoor: true },
  96: { condition: 'thunderstorm with hail', indoor: true },
  99: { condition: 'severe thunderstorm', indoor: true },
};

/** Temperature extremes push a day indoors regardless of precipitation. */
const HOT_C = 35;
const COLD_C = -5;

export class ForecastOutOfRangeError extends Error {
  constructor(readonly allowedRange: string) {
    super(`Trip dates fall outside the forecast horizon (${allowedRange})`);
    this.name = 'ForecastOutOfRangeError';
  }
}

export async function getForecast(opts: {
  lat: number;
  lng: number;
  startDate: string; // YYYY-MM-DD
  endDate: string;
}): Promise<WeatherSpec[]> {
  const url = `${OPEN_METEO}?${new URLSearchParams({
    latitude: String(opts.lat),
    longitude: String(opts.lng),
    daily:
      'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max',
    start_date: opts.startDate,
    end_date: opts.endDate,
    timezone: 'auto',
  })}`;

  let res = await fetch(url, { signal: AbortSignal.timeout(30_000) });

  // The API rejects the whole request if any date is outside its window, so a
  // trip that straddles the horizon gets nothing — even for the days it does
  // cover. Retry once against the range it tells us is allowed.
  if (!res.ok && res.status === 400) {
    const body = (await res.clone().json().catch(() => ({}))) as { reason?: string };
    const allowed = /from (\d{4}-\d{2}-\d{2}) to (\d{4}-\d{2}-\d{2})/.exec(body.reason ?? '');
    if (allowed) {
      const from = opts.startDate > allowed[1] ? opts.startDate : allowed[1];
      const to = opts.endDate < allowed[2] ? opts.endDate : allowed[2];
      if (from <= to) {
        const retry = url.replace(`start_date=${opts.startDate}`, `start_date=${from}`)
          .replace(`end_date=${opts.endDate}`, `end_date=${to}`);
        res = await fetch(retry, { signal: AbortSignal.timeout(30_000) });
      }
    }
  }

  if (!res.ok) {
    // Open-Meteo only forecasts ~16 days out and returns a hard 400 beyond
    // that. This is expected for trips planned months ahead, not a fault.
    const body = (await res.json().catch(() => ({}))) as { reason?: string };
    const reason = body.reason ?? '';
    if (res.status === 400 && /out of allowed range/i.test(reason)) {
      const range = reason.match(/from ([\d-]+ to [\d-]+)/)?.[1] ?? 'unknown range';
      throw new ForecastOutOfRangeError(range);
    }
    throw new Error(`Open-Meteo HTTP ${res.status}${reason ? `: ${reason}` : ''}`);
  }

  const json = (await res.json()) as {
    daily?: {
      time: string[];
      weather_code: number[];
      temperature_2m_max: number[];
      temperature_2m_min: number[];
      precipitation_probability_max: (number | null)[];
      wind_speed_10m_max: (number | null)[];
    };
  };

  const d = json.daily;
  if (!d) return [];

  return d.time.map((date, i) => {
    const code = d.weather_code[i] ?? 0;
    const meta = WMO[code] ?? { condition: 'unknown', indoor: false };
    const precip = (d.precipitation_probability_max[i] ?? 0) / 100;
    const tempMax = d.temperature_2m_max[i] ?? 0;
    const tempMin = d.temperature_2m_min[i] ?? 0;

    return {
      forecastDate: date,
      condition: meta.condition,
      tempMin,
      tempMax,
      precipitationProbability: precip,
      windSpeed: d.wind_speed_10m_max[i] ?? undefined,
      // Any one of: bad conditions, likely rain, or an unpleasant temperature.
      isIndoorDay: meta.indoor || precip >= 0.5 || tempMax >= HOT_C || tempMin <= COLD_C,
    } satisfies WeatherSpec;
  });
}
