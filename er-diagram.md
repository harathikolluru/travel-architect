# Travel Architect — Entity Relationship Diagram

> Derived from PRD v2 · Personas · Prototype · 2026-08-01

---

## Entity Overview

| Entity | Domain | Description |
|---|---|---|
| `USER` | Core | Account holder; carries persona type and preferences |
| `TRIP_PLAN` | Core | Central planning record; destination, dates, pace, status |
| `DAY_PLAN` | Core | One day within a trip; links to weather, cluster centroid |
| `ITINERARY_SLOT` | Core | A single scheduled stop — activity or meal; holds primary + backup place |
| `PLACE` | Core | A real-world venue; sourced from MCP, cached locally |
| `PACKING_LIST` | Output | 1:1 with TripPlan; contains embedded PackingItem rows |
| `REPLAN_EVENT` | Output | Audit log entry each time the plan is adapted |
| `PLAN_OUTPUT` | Output | A rendered artifact (map UI, PDF, or email) |
| `MAP_MARKER` | Output | Derived view of slots for the Leaflet map layer |
| `WEATHER_FORECAST` | External (MCP) | Daily forecast per destination; drives indoor-day flag |
| `MCP_PLACE_SOURCE` | External (MCP) | Custom `places-clusterer` server metadata |
| `GEOCODING_RESULT` | External (MCP) | Resolved coordinates + bounding box for a destination query |

---

## Entities & Attributes

### USER
```
user_id             PK
email
created_at
persona_type        (maya | dan_priya | sam)
preferred_pace
dietary_preference
interests[]
notification_email
```

### TRIP_PLAN
```
plan_id             PK
user_id             FK → USER
destination
destination_lat
destination_lng
start_date
end_date
pace                (relaxed | moderate | packed)
interests[]
dietary_preference
status              (draft | active | complete)
version
created_at
updated_at
```

### DAY_PLAN
```
day_id              PK
plan_id             FK → TRIP_PLAN
day_number
date
weather_id          FK → WEATHER_FORECAST
cluster_centroid_lat
cluster_centroid_lng
neighbourhood_label
is_complete         boolean
```

### ITINERARY_SLOT
```
slot_id             PK
day_id              FK → DAY_PLAN
place_id            FK → PLACE   (primary)
backup_place_id     FK → PLACE   (backup)
slot_type           (activity | meal)
sequence_order
scheduled_time
rationale           one-line explanation
backup_rationale
is_indoor_alternative   boolean, weather-driven
was_swapped
active_choice       (primary | backup)
replan_reason
```

### PLACE
```
place_id            PK
mcp_source_id       FK → MCP_PLACE_SOURCE
external_id         Google / OSM reference
name
address
lat
lng
category            (attraction | restaurant)
opening_hours[]     from MCP
cuisine_tags[]
dietary_tags[]      (vegetarian, vegan, pescatarian…)
price_level         1–4
is_indoor           boolean
data_coverage_flag  (rich | thin)
fetched_at
```

### PACKING_LIST
```
list_id             PK
plan_id             FK → TRIP_PLAN
generated_at

-- embedded PackingItem rows --
item_name
reason              weather-derived explanation
triggered_by_day_id FK → DAY_PLAN
```

### REPLAN_EVENT
```
event_id            PK
plan_id             FK → TRIP_PLAN
trigger_type        (weather | day_done | slot_swap | pref_change)
triggered_at
affected_day_ids[]
diff_summary        what changed and why
prev_version
new_version
email_digest_sent   boolean
```

### PLAN_OUTPUT
```
output_id           PK
plan_id             FK → TRIP_PLAN
output_type         (map_ui | pdf | email)
generated_at
replan_event_id     FK → REPLAN_EVENT  (nullable)
share_url           nullable, P1 feature
pdf_url
email_sent_at
```

### MAP_MARKER
```
marker_id           PK
slot_id             FK → ITINERARY_SLOT
plan_id             FK → TRIP_PLAN
day_color           (blue | orange | green)
sequence_label
```

### WEATHER_FORECAST
> MCP source: `weather-forecast`
```
weather_id          PK
destination
forecast_date
condition           (sunny | rainy | cloudy | stormy…)
temp_min
temp_max
precipitation_probability
wind_speed
is_indoor_day       boolean, derived
fetched_at
source
```

### MCP_PLACE_SOURCE
> MCP source: `places-clusterer` ★ (custom server, PRD §6)
```
source_id           PK
destination_bounding_box
geocoding_id        FK → GEOCODING_RESULT
raw_places_count
coverage_quality    (rich | thin)
provider            (GooglePlaces | Overpass)
category_filter
diet_filter_applied
fetched_at
cluster_algorithm   (k-means)
```

### GEOCODING_RESULT
> MCP source: `geocoding`
```
geocoding_id        PK
query               destination name as typed
resolved_lat
resolved_lng
bounding_box        N / S / E / W
provider            (Nominatim | Google)
fetched_at
```

---

## Relationships

```
USER            1 ──── N   TRIP_PLAN          (a user creates many plans)
TRIP_PLAN       1 ──── N   DAY_PLAN           (a plan has one day per travel day)
TRIP_PLAN       1 ──── 1   PACKING_LIST       (rebuilt on every replan)
TRIP_PLAN       1 ──── N   REPLAN_EVENT       (audit log of every adaptation)
TRIP_PLAN       1 ──── N   PLAN_OUTPUT        (map UI, PDF, email renders)
DAY_PLAN        1 ──── N   ITINERARY_SLOT     (2–5 slots per day, pace-driven)
DAY_PLAN        N ──── 1   WEATHER_FORECAST   (one forecast drives one day)
ITINERARY_SLOT  N ──── 1   PLACE              (primary place_id)
ITINERARY_SLOT  N ──── 1   PLACE              (backup_place_id — same table)
ITINERARY_SLOT  1 ──── 1   MAP_MARKER         (derived, for map rendering)
PLACE           N ──── 1   MCP_PLACE_SOURCE   (every place sourced from one fetch)
MCP_PLACE_SOURCE N ─── 1   GEOCODING_RESULT   (source scoped to a geocoded bbox)
REPLAN_EVENT    1 ──── N   PLAN_OUTPUT        (each replan can spawn a new output)
```

---

## Domain Groupings

### Core Planning Domain
Entities that represent the user's plan in its current state:
`USER` → `TRIP_PLAN` → `DAY_PLAN` → `ITINERARY_SLOT` → `PLACE`

### Output / Delivery
Entities produced for the user to consume:
`PACKING_LIST`, `REPLAN_EVENT`, `PLAN_OUTPUT`, `MAP_MARKER`

### External Data (MCP Sources)
Entities that cache data fetched from external MCP servers:
`WEATHER_FORECAST`, `MCP_PLACE_SOURCE`, `GEOCODING_RESULT`

---

## Key Design Decisions

- **`ITINERARY_SLOT` holds two FKs to `PLACE`** — `place_id` (primary) and `backup_place_id` (backup). Both reference the same `PLACE` table. The `active_choice` column tracks which is currently shown. This implements the PRD's P0 requirement that every slot has a baked-in backup.

- **`PLACE.is_indoor` + `WEATHER_FORECAST.is_indoor_day`** work together: when `is_indoor_day = true`, the `cluster-itinerary` Skill deprioritizes outdoor places and surfaces slots where the backup is an indoor venue.

- **`PACKING_LIST` is embedded** (items are rows on the same record, not a separate join table) because packing items are always read and written together as a unit, and they don't need independent addressing.

- **`REPLAN_EVENT.prev_version / new_version`** link to `TRIP_PLAN.version`, enabling a full diff history without storing full plan snapshots. The email digest (PRD §4.9) references this diff.

- **`TRIP_PLAN.pace`** propagates into how many `ITINERARY_SLOT` rows the `generate-day-plan` Skill creates per day: relaxed → 2–3, moderate → 3–4, packed → 4–5.

- **`USER.persona_type`** is a product-layer hint, not a hard constraint. Per personas research, the same user may behave as Maya, Dan/Priya, or Sam depending on context. The intake form should flex from sparse to rich input regardless of persona type.

---

*See [er-diagram.html](er-diagram.html) for the visual SVG version.*
