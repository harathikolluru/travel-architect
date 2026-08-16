# Phase 0 — Data Layer Spike

**Date:** 2026-08-14
**Question (PRD §10):** Can `places-clusterer` return grounded location, open-hours, and dietary/cuisine data cleanly?
**Scope:** US destinations, arbitrary — not a fixed demo-city list.

**Verdict: GO for restaurants in cities. Two things in the PRD cannot be delivered as written:**
1. **Attraction opening hours** — 0–13% coverage everywhere. Not viable anywhere in the US.
2. **Small-town destinations** — below ~100 restaurants, the plan cannot be filled. Needs an explicit floor + honest messaging.

---

## Sources

| Source | Endpoint | Key | Result |
|---|---|---|---|
| Geocoding | Nominatim `/search` | none | ✅ Works, returns bbox |
| Weather | Open-Meteo `/v1/forecast` | none | ✅ Works, 7-day daily |
| Places | Overpass (OSM) | none | ⚠️ Varies sharply by destination size |
| Places | Google Places v1 | yes | ❌ Key in `.env` → `API_KEY_INVALID` |

Geocoding and weather are **destination-agnostic and reliable** — no coverage concern. All risk sits in Places.

---

## Coverage across US destinations

"Usable" = has **both** `opening_hours` and `cuisine`. A 7-day trip needs ~28 (14 meal slots × primary + backup).

| Destination | Restaurants | hours% | cuisine% | **Usable** | Attractions | attr hours% | indoor% |
|---|---|---|---|---|---|---|---|
| New York, NY | 9,399 | 45 | 78 | **3,824** | 2,439 | 13 | 57 |
| Chicago, IL | 2,857 | 31 | 80 | **782** | 1,401 | 3 | 58 |
| Lisbon, PT *(ref)* | 2,846 | 32 | 53 | **659** | 1,616 | 6 | 66 |
| Denver, CO | 1,837 | 37 | 72 | **608** | 550 | 5 | 68 |
| Santa Fe, NM | 204 | 34 | 85 | **68** | 338 | 7 | 75 |
| Asheville, NC | 273 | 29 | 62 | **54** | 68 | 10 | 68 |
| Savannah, GA | 251 | 22 | 67 | **45** | 131 | 11 | 46 |
| Moab, UT | 36 | 75 | 86 | **24** | 18 | 0 | 28 |
| Bar Harbor, ME | 56 | 25 | 55 | **8** | 30 | 3 | 30 |
| Sedona, AZ | 40 | 28 | 60 | **4** | 32 | 3 | 50 |

### Reading the table

**Restaurants scale with city size, and the cliff is sharp.** Above ~200 restaurants, every destination clears 28 usable with room to spare. Below ~60, it collapses: Sedona yields 4, Bar Harbor 8. These are real, popular US destinations — not edge cases.

**Cuisine coverage is strong and stable** (55–86%) regardless of size. It is the reliable field.

**Opening-hours coverage is volatile** (22–75%) and does not correlate with size — Moab at 75% beats New York at 45%. Cannot be predicted; must be measured per destination at query time.

**Attraction opening hours fail universally.** 0–13%, best case New York. There is no US destination where this works. This is not a thin-data problem to message around — it is a capability the free stack does not have.

**Indoor/outdoor inference degrades in outdoor destinations** — 28–30% in Moab and Bar Harbor vs 57–75% in cities. Nature destinations have fewer buildings tagged, which is intuitive but weakens weather adaptation exactly where weather matters most.

---

## Implications for the PRD

### Holds
- **P0.2 grounding** — everything surfaced comes from OSM/Open-Meteo; nothing invented
- **P0.3 geographic clustering** — coordinates are 100% covered everywhere
- **P0.5 weather packing** — Open-Meteo is destination-agnostic
- **P0.6 map** — coordinates complete
- **P0.4 restaurants** — in cities. Not in small towns.

### Must change

**1. Drop the attraction-opening-hours promise (P0.3).**
Not achievable in the US on OSM. Show hours when present, omit otherwise, and never imply an attraction is open. `Place.dataCoverageFlag = THIN` already exists in the schema for exactly this.

**2. Add a destination viability gate.**
`places-clusterer` should count usable restaurants *before* planning and branch:

| Usable restaurants | Behavior |
|---|---|
| ≥ 28 | Full plan as designed |
| 10–27 | Plan with fewer meal slots; state that restaurant data is limited |
| < 10 | **Refuse to fabricate.** Return coords + weather + attractions, and say restaurant coverage is insufficient |

This makes Sedona and Bar Harbor an honest degraded experience rather than a silently bad plan. It also directly serves the PRD's existing edge-case story: *"when a destination has thin data coverage, I want to be told clearly rather than shown invented places."*

**3. Filter diet via `cuisine`, not `diet:*`.**
`diet:*` was 6% in Lisbon and is similarly sparse in the US. `cuisine` at 55–86% is the workable signal.

**4. Reconsider the demo-city framing.**
The PRD names Lisbon/Tokyo/Barcelona with Denver as a "thin data" stretch. **Denver is not thin** — 608 usable restaurants, comparable to Lisbon. The genuinely thin US cases are small towns like Sedona. If the demo wants to show graceful degradation, Sedona or Bar Harbor is the honest example.

---

## Follow-ups

1. **Fix `GOOGLE_PLACES_API_KEY`** — currently invalid. This is the single change that would fix attraction hours and lift small-town coverage; Google's commercial data is far denser than OSM for both. If arbitrary US destinations are a hard requirement, Google likely becomes necessary rather than optional.
2. **Cache aggressively.** Overpass has no SLA and rate-limits. Every result belongs in `Place` / `McpPlaceSource`; never call it per-request.
3. **Measure at query time, not from a static list.** Since hours coverage doesn't correlate with city size, the viability gate must count actual results per destination.

---

## Reproducing

Script: `scratchpad/coverage.py` (geocode → Overpass → coverage stats)

```bash
python3 coverage.py "Sedona, Arizona" "Denver, Colorado"
```

```bash
# Geocode
curl "https://nominatim.openstreetmap.org/search?q=Denver%2C+Colorado&format=json&limit=1" \
  -H "User-Agent: TravelArchitect/0.1"

# Weather
curl "https://api.open-meteo.com/v1/forecast?latitude=39.74&longitude=-104.98\
&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max\
&forecast_days=7&timezone=America/Denver"

# Restaurants (Overpass) — bbox from geocode
curl -X POST https://overpass-api.de/api/interpreter --data-urlencode 'data=
[out:json][timeout:150];
(
  node["amenity"="restaurant"](39.61,-105.11,39.91,-104.60);
  way["amenity"="restaurant"](39.61,-105.11,39.91,-104.60);
);
out tags center;'
```
