---
name: generate-day-plan
description: Turn one day's geographic cluster into a sequenced plan with times, rationales, and a backup for every slot. Use after cluster-itinerary has assigned places to days, once that day's weather forecast is known.
---

# Generate Day Plan

Turn a cluster of places into a day the traveller can actually follow.

## Hard rules

- **Only use places from the provided cluster.** Never introduce a place that was not passed in — not from memory, not from general knowledge of the city. This is the grounding rule and it is absolute.
- **Every slot needs a backup, and the backup must be a different place** than the primary.
- **Never state opening hours that were not provided.** Many places carry no hours data. Say "hours unconfirmed" rather than implying it is open.
- **Restaurant picks must satisfy the traveller's dietary preference** using the cuisine and dietary tags provided. If nothing matches, say so and offer the closest options labelled as such — never silently substitute something they cannot eat.

## Choosing what goes in

Pick the places a well-travelled friend would actually name. A first-time visitor to Denver expects Union Station, the Botanic Gardens, Red Rocks, the Art Museum — not whichever gallery happens to be best tagged in the source data.

**Missing opening hours is not a reason to skip a place.** Only about 4% of attractions carry hours, so filtering on them systematically buries the famous ones. Include the notable place and show "Hours unconfirmed"; that is honest and useful. Reserve hours-based reasoning for cases where you *do* have them and they genuinely constrain the day.

Restaurants are different — there you should prefer confirmed hours, because arriving at a closed restaurant at 20:00 is a worse failure than arriving at a park whose gate times you did not know.

## Sequencing

Order stops to minimise walking, then adjust for how places actually work:

- Outdoor stops earlier when the afternoon is hot; indoor stops during the worst of the weather.
- Meals near the middle of a run of activities, not tacked on at the end.
- A single anchor per day — the thing they would be sad to miss — placed when it shows best.

## Weather adaptation

When the forecast says `is_indoor_day`, the backup for every outdoor primary must be indoors, and `is_indoor_alternative` must be set to true for those slots. On a clear day, backups exist for closures and changes of mood, and need not be indoors.

## Rationales

One sentence per slot, under 160 characters, naming the concrete reason: proximity, timing, weather, or a stated interest.

- GOOD: "Five minutes from your morning stop; indoors while the rain passes"
- GOOD: "Vegetarian mains and it opens early enough for the museum after"
- BAD: "A wonderful place to visit" — generic, says nothing, never write this

The rationale is the product's whole differentiator. If a reader cannot tell why *this* stop at *this* time, the slot has failed even if the place is fine.

## Worked example

Alfama cluster, rain forecast, moderate pace, pescatarian:

| Time | Primary | Backup | Rationale |
|---|---|---|---|
| 10:00 | Castelo de São Jorge | Fado Museum (indoor) | Hilltop views first; museum backup if the rain sets in |
| 13:00 | Taberna Sal Grosso | Ramiro (indoor) | Seafood-led menu, five minutes downhill from the castle |
| 15:00 | Fado Museum | Cathedral interior | Indoors for the wettest part of the afternoon |

Note the backups are all indoors because it is a rain day, and each rationale names a distance, a time, or a dietary fit — never an adjective.
