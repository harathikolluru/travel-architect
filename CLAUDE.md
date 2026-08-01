# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Status

This is a **planning-phase portfolio project** — no application code exists yet. The repository contains product and design artifacts only. The next concrete step is a data-layer spike (see PRD §10) to validate that the `places-clusterer` MCP server can return grounded open-hours and dietary data before any product code is written.

## What's here

| File | Purpose |
|---|---|
| `product-brief.md` | One-liner, problem, target user, scope, stack decisions |
| `prd.md` | Full PRD v2 — requirements (P0/P1/P2), agentic architecture, Skills specs, MCP server specs, success metrics |
| `er-diagram.md` | Entity-relationship schema — all entities, attributes, relationships, and key design decisions |
| `er-diagram.html` | Visual SVG version of the ER diagram |
| `travel-architect.html` | UI prototype / wireframe |
| `personas.md` | User personas (Maya, Dan & Priya, Sam) |

## Architecture (design intent)

### Agentic planning loop

```
Intake (destination, dates, pace, interests, diet)
  → cluster-itinerary Skill   (geographic grouping via places-clusterer MCP)
  → generate-day-plan Skill   (sequenced day with weather/rationale/backups)
  → render outputs            (interactive map UI + PDF + email digest)
  → listen for re-plan triggers
  → re-plan if triggered      (diff previous itinerary, show what changed)
```

### Named Skills (to be built)

- **`cluster-itinerary`** — takes candidate places with lat/lng, groups them into geographically proximate day clusters. Returns structured JSON: array of days with ordered place lists and centroid. Must not invent coordinates; exclude uncoorded places.
- **`generate-day-plan`** — takes a geographic cluster, weather forecast, and user preferences; returns a sequenced time-slot array with primary item, backup item, and rationale per slot. Restaurant picks must come from MCP data only.

Each Skill has ≥3 eval cases defined in `prd.md` §6.

### MCP servers (to be built)

| Server | Type | What it provides |
|---|---|---|
| `places-clusterer` | **Custom** (build in Claude Code) | Wraps Google Places or Overpass/OSM; returns places with lat/lng, category, opening hours, price level, cuisine/dietary tags for a destination bounding box |
| `weather-forecast` | Standard wrapper | 7-day forecast per destination (OpenWeatherMap or Open-Meteo); daily conditions, precipitation probability, temp range |
| `geocoding` | Standard wrapper | Resolves destination name → lat/lng bounding box (Nominatim or Google Geocoding) |

`places-clusterer` is the custom server because it adds the clustering-scope logic (destination → bounding box → filtered place objects) that no off-the-shelf MCP server provides.

### Data model (key relationships)

```
USER → TRIP_PLAN → DAY_PLAN → ITINERARY_SLOT → PLACE (primary + backup FK)
TRIP_PLAN → PACKING_LIST (1:1, rebuilt on every re-plan)
TRIP_PLAN → REPLAN_EVENT (audit log)
TRIP_PLAN → PLAN_OUTPUT (map UI | PDF | email)
DAY_PLAN → WEATHER_FORECAST (drives is_indoor_day flag)
PLACE → MCP_PLACE_SOURCE → GEOCODING_RESULT
```

Critical schema decisions (see `er-diagram.md` for full detail):
- `ITINERARY_SLOT` holds two FKs to `PLACE` (`place_id` + `backup_place_id`); `active_choice` tracks which is shown.
- `PLACE.is_indoor` + `WEATHER_FORECAST.is_indoor_day` jointly drive the weather-adaptation logic.
- `TRIP_PLAN.version` + `REPLAN_EVENT.prev_version/new_version` enable diff history without storing full plan snapshots.

### Grounding rule (non-negotiable)

All place names, addresses, opening hours, and weather data must come from MCP sources. The LLM handles sequencing, rationale, and prose only. If no data is available for a slot, omit or flag — never fabricate.

## Multi-modal outputs

Three outputs generated from the same structured itinerary object:
1. **Interactive map + itinerary** (web UI) — hero view; stops plotted by day with rationales visible
2. **PDF export** — clean printable itinerary
3. **Email digest** — day summaries + packing list + link to map; includes one-line diff on re-plans

## Demo cities

Target: Lisbon, Tokyo, Barcelona. Stretch: Denver CO (domestic test with "thin data" graceful messaging).
