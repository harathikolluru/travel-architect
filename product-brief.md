# Product Brief: Travel Architect

**Type:** Learning / portfolio project — optimized for buildability and demo impact
**Author:** Harathi Kolluru
**Date:** 2026-06-27
**Status:** Draft v1

## 1. One-liner
An AI travel-planning agent that turns a few trip details into a **plan that survives reality** — a geography-aware, weather-aware, day-by-day itinerary with real, open, bookable restaurants and a backup in every slot.

## 2. The problem
Planning a 3–7 day trip to an unfamiliar place means stitching together attractions, food, transit, and weather across a dozen tabs. Generic AI tools (ChatGPT, etc.) will produce an itinerary, but it falls apart on the ground: restaurants that are closed or fully booked, days that zigzag across the city, no rain plan, invented addresses. The pain isn't "I can't get *a* plan" — it's "I can't trust the plan."

## 3. Target user (one, on purpose)
The **time-poor independent traveler** — solo or a couple — heading somewhere unfamiliar for 3–7 days, who wants a personalized, organized plan without hours of research and without it breaking mid-trip.

*Explicitly out of scope for v1:* families, business travelers, and groups. They're real audiences but different products. Revisit post-v1.

## 4. The wedge (what makes this not-just-ChatGPT)
The differentiator is **visible, grounded intelligence**:
- **Geographically efficient** — days are clustered so the user isn't crossing the city twice.
- **Weather-aware** — each day adapts to the forecast, with indoor alternatives on bad-weather days.
- **Real, open, relevant places** — restaurants/attractions pulled from a live data source and filtered to the user's dates, interests, and dietary needs — not the model's memory.
- **Resilient** — every slot carries a backup so a closure or full booking isn't a dead end.
- **Explained** — the plan *shows its reasoning* ("Tuesday is indoors — rain forecast; lunch is next to the museum so you don't backtrack").

That last point is the hero of the demo.

## 5. Scope

### v1 — In
1. **Trip intake** — destination, dates, budget, pace, interests, dietary needs, must-visit places.
2. **Day-by-day itinerary** — geography-clustered, weather-aware, paced to preference, with a one-line rationale per choice.
3. **Restaurant recommendations** — grounded in real data; filtered for open-on-date, dietary fit, budget, proximity to that day's activities.
4. **Weather-aware packing list** — generated from the destination's forecast.
5. **Interactive map** — itinerary plotted by day; the visual proof of geographic intelligence.
6. **Backup in every slot** — at least one alternative per activity/meal.

### v1 — Cut (deliberately)
- **Post-trip recap video.** Heavy, fragile, unrelated to the planning wedge — high effort, low payoff for a portfolio build. *Replaced by* a lightweight **shareable trip summary page** (clean visual itinerary) if a sharing moment is wanted.

### Future / parked
- Recap video, on-trip *real-time* recovery (re-plan when something breaks live), families/business/group modes, bookings/reservations, multi-destination trips.

## 6. Technical approach (stack-agnostic)
**Hybrid by design:** real APIs for the things that destroy credibility if faked; the LLM for reasoning and narrative.
- **Maps/places:** Google Places, or OpenStreetMap/Overpass for a free path.
- **Weather:** a forecast API (e.g., Open-Meteo — free, no key).
- **LLM:** does sequencing, clustering rationale, interest-matching, packing logic, and all natural-language output. Default to the most capable current Claude model.
- **Principle:** facts come from APIs; *judgment and prose* come from the model. The model never invents an address or an opening time.

*Stack/platform: undecided — deferred.*

## 7. Success criteria
**Build success:** a user enters trip details and receives a complete, grounded plan — itinerary, restaurants, packing list, interactive map, shareable summary — with minimal manual work.

**Demo success:** in one screen, a reviewer can *see the intelligence* — the map shows clustered days, the itinerary explains its weather/geography reasoning, and spot-checking a restaurant confirms it's real and open. That's the moment that separates it from "ChatGPT made a list."

## 8. Riskiest assumptions
1. **Data quality/coverage** — the places/weather APIs return enough good data for arbitrary destinations to keep the demo credible. *Mitigation:* pick 2–3 well-covered "demo destinations" and validate them first.
2. **Geographic clustering is hard to get right** — naive distance logic can produce silly routes. *Mitigation:* start with simple proximity grouping per day; refine only if the demo needs it.
3. **Grounding discipline** — keeping the LLM from "filling gaps" with invented facts. *Mitigation:* strict separation — API data in, model reasons over it, never fabricates.

## 9. Suggested next step
Before any code: **validate the data layer on one destination.** Pick a city, pull places + weather, and confirm you can get open-hours, location, and cuisine/dietary data cleanly. If that works, the rest is reasoning and presentation. If it doesn't, the whole grounding premise needs rethinking — better to learn that on day one.

---

## Appendix A: Personas

### Primary Persona — "Maya, the Time-Poor Explorer"
**Build for her.**
- **Profile:** 31, product designer; solo or with partner; 2–3 unfamiliar trips a year. High tech comfort, abandons clunky tools fast.
- **Goals:** experience a place like she "did the research" without doing it; match her taste (design, food, neighborhoods); not waste vacation days backtracking or hitting closed places.
- **Today:** 12 tabs (blog, Maps, TripAdvisor, Reddit, weather), screenshots into Notes, never finishes. Tried ChatGPT — plausible but untrustworthy.
- **Pains:** endless research, no confidence the plan holds up, dietary needs (pescatarian) ignored.
- **Needs:** a trustworthy day-by-day plan, visible reasoning, real/open/on-route restaurants that fit her diet.
- **Demo win:** map clusters each day, "Tuesday's indoors — rain forecast," taps a restaurant that's real, open, pescatarian-friendly, and near her afternoon.

### Secondary A — "Dan & Priya, the Weekend Couple"
- **Profile:** couple, mid-30s, dual income, short on time; 3-day spontaneous city break.
- **Key difference:** shared decisions; need a plan blending two interest sets (history + food markets) without daily negotiation.
- **Needs:** blended-interest planning; one-tap swap when one isn't feeling a slot (backup feature earns its keep).
- **Design implication:** intake handles blended/multiple interests; backups are one tap, not a re-plan.

### Secondary B — "Sam, the Spontaneous Optimizer"
- **Profile:** 27, solo, last-minute booker, anxious about wasting limited time; 4 days, zero prep.
- **Key difference:** low-prep, high-anxiety; wants a good plan fast from minimal input.
- **Needs:** speed; sensible defaults when fields are left blank.
- **Design implication:** intake works with sparse input — infer defaults, let him refine.

### Anti-Persona — "The Patersons, Family of Five" (NOT v1)
- Two adults, three kids (4, 7, 11): nap windows, stroller routes, kid menus, downtime buffers — each a different constraint engine.
- **Rule:** if "number of children" appears in the intake form, stop — that's v2. Same logic excludes the business traveler.

**Throughline:** all three real personas share one job — *"Give me a plan I can trust and follow without doing the research myself."* Build for Maya; pressure-test against Dan/Priya (blended interests) and Sam (sparse input).
