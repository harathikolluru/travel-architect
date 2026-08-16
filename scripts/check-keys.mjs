#!/usr/bin/env node
// Verifies API keys in .env actually work. Run: node scripts/check-keys.mjs
import 'dotenv/config';

const pad = (s) => s.padEnd(22);
let failures = 0;

function report(name, ok, detail) {
  console.log(`${ok ? '✅' : '❌'} ${pad(name)} ${detail}`);
  if (!ok) failures++;
}

function looksLikeComment(v) {
  return v.includes('#') || /^\s+$/.test(v);
}

// ── Anthropic ────────────────────────────────────────────
const anthropic = process.env.ANTHROPIC_API_KEY ?? '';
if (!anthropic) {
  report('ANTHROPIC_API_KEY', false, 'not set');
} else if (looksLikeComment(anthropic)) {
  report('ANTHROPIC_API_KEY', false, 'value contains a "#" — trailing comment leaked in');
} else {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropic,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.AGENT_MODEL || 'claude-opus-5',
        max_tokens: 4,
        messages: [{ role: 'user', content: 'hi' }],
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (res.ok) {
      report('ANTHROPIC_API_KEY', true, `valid (model: ${process.env.AGENT_MODEL || 'claude-opus-5'})`);
    } else {
      const body = await res.json().catch(() => ({}));
      report('ANTHROPIC_API_KEY', false, `HTTP ${res.status} — ${body?.error?.message ?? 'rejected'}`);
    }
  } catch (e) {
    report('ANTHROPIC_API_KEY', false, `request failed: ${e.message}`);
  }
}

// ── Google Places (optional) ─────────────────────────────
const google = process.env.GOOGLE_PLACES_API_KEY ?? '';
if (!google) {
  console.log(`⚪ ${pad('GOOGLE_PLACES_API_KEY')} not set — OSM-only mode (see docs/spike-data-layer.md)`);
} else if (looksLikeComment(google)) {
  report('GOOGLE_PLACES_API_KEY', false, 'value contains a "#" — trailing comment leaked in');
} else {
  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': google,
        'X-Goog-FieldMask': 'places.displayName,places.regularOpeningHours',
      },
      body: JSON.stringify({
        includedTypes: ['restaurant'],
        maxResultCount: 1,
        locationRestriction: {
          circle: { center: { latitude: 39.7392, longitude: -104.9903 }, radius: 1000 },
        },
      }),
      signal: AbortSignal.timeout(20000),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      const hasHours = Boolean(body.places?.[0]?.regularOpeningHours);
      report('GOOGLE_PLACES_API_KEY', true, `valid — opening hours ${hasHours ? 'present' : 'absent'} in sample`);
    } else {
      report('GOOGLE_PLACES_API_KEY', false, `HTTP ${res.status} — ${body?.error?.message ?? 'rejected'}`);
    }
  } catch (e) {
    report('GOOGLE_PLACES_API_KEY', false, `request failed: ${e.message}`);
  }
}

// ── Keyless sources ──────────────────────────────────────
for (const [name, url] of [
  ['Open-Meteo', 'https://api.open-meteo.com/v1/forecast?latitude=39.74&longitude=-104.98&daily=weather_code&forecast_days=1'],
  ['Nominatim', 'https://nominatim.openstreetmap.org/search?q=Denver&format=json&limit=1'],
]) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'TravelArchitect/0.1' },
      signal: AbortSignal.timeout(20000),
    });
    report(name, res.ok, res.ok ? 'reachable (keyless)' : `HTTP ${res.status}`);
  } catch (e) {
    report(name, false, `unreachable: ${e.message}`);
  }
}

process.exit(failures > 0 ? 1 : 0);
