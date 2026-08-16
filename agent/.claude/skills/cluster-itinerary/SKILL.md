---
name: cluster-itinerary
description: Group candidate places into geographically proximate day-clusters that minimize backtracking. Use when assigning places to days for a new trip, or re-clustering after the traveller marks a day complete or changes dates/pace.
---

# Cluster Itinerary

Assign candidate places to days so each day stays in one part of the city.

## Hard rules (violating these makes the plan wrong, not just worse)

- **Never invent coordinates.** A place with no lat/lng is excluded and reported, never guessed at.
- **Each place appears on exactly one day.** No duplicates across days.
- **Stops per day must match the pace**: relaxed 2–3, moderate 3–4, packed 4–5. Never exceed the ceiling.
- **Must-visit places always appear**, assigned to whichever day is geographically most sensible.
- **Completed days are frozen.** When re-clustering, return them unchanged with `"status": "complete"` and redistribute only the remaining places across the remaining days.

## How to cluster

1. Group by proximity first. Two stops on opposite sides of a city never share a day — that is the specific failure this whole product exists to prevent.
2. Within a day, order stops nearest-neighbour so the traveller walks a line, not a star.
3. Compute each day's centroid as the mean lat and mean lng of its stops.
4. Label the neighbourhood from the place names when the area is recognisable; otherwise use `Area {day_number}`.

## Judging your own output

Before returning, check each day: could a reasonable person walk or take one short ride between consecutive stops? If a day mixes distant neighbourhoods, redo it — that is the one mistake that makes the plan visibly worse than a chatbot list.

If total places are fewer than `trip_days × pace_minimum`, set `coverage_warning` rather than padding days with distant filler.

## Worked example

Lisbon, 3 days, relaxed pace, 10 places across Alfama, Belém, Baixa, LX Factory:

- **Day 1** — Alfama + Baixa. Adjacent and walkable; the castle and cathedral anchor the morning.
- **Day 2** — Belém + LX Factory. Both riverside and west; the tram connects them.
- **Day 3** — remainder, max 3 stops.

What makes this right is that no day crosses the city. Belém is 6 km from Alfama, so they never share a day even though both are "must-see."
