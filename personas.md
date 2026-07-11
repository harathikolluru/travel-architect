# User Research Report: Travel Architect

**Date:** 2026-06-27
**Last updated:** 2026-07-10 (synced with PRD v2)
**Data sources:** Product brief only — **no primary research** (no interviews, surveys, analytics, or feedback)
**Sample size:** 0
**Confidence:** ⚠️ **Hypothesis-grade.** Everything here is a research-informed *hypothesis* derived from the product concept, not a validated finding. Treat personas as bets to test, not conclusions. A validation plan is included at the end.

---

## Executive Summary

Travel Architect targets the **time-poor independent traveler** planning a 3–7 day trip to an unfamiliar place. From the product concept, three behavioral archetypes emerge — distinguished not by demographics but by *how they relate to planning*: the **taste-driven researcher** who wants a plan matched to her, the **two-headed couple** who need a blended plan, and the **last-minute minimalist** who wants a great plan from almost no input. All three share one job-to-be-done: *"Give me a plan I can trust and follow without doing the research myself."* The sharpest unmet need across all three is **trust** — confidence the plan won't break on the ground — which is also the product's core wedge. The riskiest open question is whether "resilience" is a *felt* benefit at planning time or only appreciated in hindsight.

---

## Personas

### Persona 1: Maya — "I don't want to spend my vacation backtracking across a city."
- **Who:** 31, product designer, urban, high tech-comfort. Travels 2–3×/year to unfamiliar places, solo or with her partner.
- **Primary JTBD:** *When* I'm planning a trip somewhere I've never been, *I want* a personalized plan that matches my taste and holds up day-of, *so I can* feel prepared without losing evenings to research.
- **Key pains:** (1) Endless tab-hopping that never feels finished; (2) no confidence a generic itinerary is real/open/efficient; (3) dietary needs (pescatarian) ignored by generic lists.
- **Key gains:** A plan she can *believe*; visible reasoning; real, on-route, diet-fit restaurants.
- **Behavioral pattern:** Researches heavily but inefficiently; screenshots into Notes; has tried ChatGPT and abandoned it on trust.
- **Prevalence (hypothesis):** ~50% of target base. **The persona to build for.**

### Persona 2: Dan & Priya — "We don't want to negotiate the plan every morning."
- **Who:** Couple, mid-30s, dual-income, time-constrained. Short city breaks, often spontaneous.
- **Primary JTBD:** *When* we travel together, *we want* a plan that satisfies both our interests without daily friction, *so we can* enjoy the trip instead of debating it.
- **Key pains:** (1) Competing interests (his history vs. her food markets); (2) one person ends up doing all the planning; (3) rigid plans don't survive a change of mood.
- **Key gains:** A blended plan; easy one-tap swaps when one of them isn't feeling a stop.
- **Behavioral pattern:** Shared, asynchronous decision-making; plan lives in a shared chat thread.
- **Prevalence (hypothesis):** ~30% of target base.

### Persona 3: Sam — "Just hand me a good plan, I leave in five days."
- **Who:** 27, solo, books last-minute, anxious about wasting limited time.
- **Primary JTBD:** *When* I've booked a trip but done zero prep, *I want* a complete, sensible plan from minimal input, *so I can* stop worrying I'll waste the trip.
- **Key pains:** (1) Decision paralysis; (2) long intake forms; (3) fear of "doing it wrong" / missing the best of a place.
- **Key gains:** Speed; smart defaults; a complete plan he can lightly tweak.
- **Behavioral pattern:** Low prep, high anxiety; will abandon anything that demands lots of upfront input.
- **Prevalence (hypothesis):** ~20% of target base. **The stress-test for sparse input.**

> **Unexpected insight (hypothesis to probe):** The three personas may not be different *people* — they may be the *same person in different trip contexts*. Maya plans her big annual trip carefully but behaves like Sam for a spontaneous weekend. If true, the product shouldn't force a persona choice; it should flex from sparse to rich input gracefully. **Worth validating early** — it changes the intake design.

---

## User Segments

| Segment | Size (hyp.) | Primary JTBD | Product Fit | Value | Growth |
|---|---|---|---|---|---|
| **Taste-driven researchers** (Maya) | ~50% | Personalized, trustworthy plan | **Highest** — the wedge is built for them | High | Med |
| **Co-deciding couples** (Dan & Priya) | ~30% | Blended, low-friction plan | High — needs blending + swap | High | Med |
| **Last-minute minimalists** (Sam) | ~20% | Complete plan from minimal input | Med — needs strong defaults | Med | **Highest** (spontaneous travel is frequent) |
| *Families / business* (anti-segment) | — | Constraint-heavy (naps, meetings) | **Out of scope v1** | — | — |

- **Highest-value segment:** Taste-driven researchers — most acute trust pain, best product-market fit for the wedge.
- **Highest-growth segment:** Last-minute minimalists — spontaneous trips are frequent and recurring; if sparse-input works, this segment compounds.

---

## Customer Journey Map

| Stage | Touchpoints | Emotion | Pain Points | Opportunities |
|---|---|---|---|---|
| **Trigger** | Booked flights / decided on a destination | Excited but daunted | "Where do I even start?" | Meet them at booking-high with a low-effort entry |
| **Intake** | Enter trip details | Hopeful / impatient | Long forms kill momentum (esp. Sam) | Minimal required fields; smart defaults |
| **Generation** | Wait for the plan | Skeptical ("will this be generic?") | Slow or vague output erodes trust | Show reasoning *as it builds*; fast first result |
| **Review** | Read itinerary + map | **The make-or-break moment** | Doubt: "Is this real? Is it efficient?" | Visible rationale + map clustering = the aha |
| **Trust / adjust** | Tweak, swap a slot | Relief or frustration | Rigid plans, no alternatives | One-tap backup swap (P1) |
| **On-trip use** | Follow the plan day-of | Calm or panicked | Plan breaks (closed/rain) | Backups baked in every slot; agentic re-plan triggers on weather change, day complete, or slot swap (P0.8) |
| **Re-plan** | Weather updates, user marks day complete, user swaps a slot | Relief ("it adapted") or confusion ("what changed?") | Re-plan diff is overwhelming or unclear | Show diff of what changed and why; email digest sent on each re-plan with day summary + link to updated map |
| **Post-trip** | Reflect / share | Satisfied or indifferent | Nothing to show for it | Shareable summary (P1); recap video (parked) |

- **Biggest drop-off (hypothesis):** the **Review** stage. If the plan looks like a generic list, the user leaves and goes back to ChatGPT. This is exactly where the wedge (visible reasoning + map) must land.
- **Moment of delight to amplify:** the instant a user spot-checks a restaurant and it's *real, open, on-route, and diet-fit.* That single moment converts skepticism to trust.
- **New touchpoint (PRD v2):** the **email digest** — sent on plan generation and each re-plan — creates a low-friction re-entry point and signals that the plan is alive, not static. Design it to feel like a trusted travel companion, not a notification.

---

## Key Insights

1. **Trust, not breadth, is the core need.** All three personas can already get *a* plan for free. What they lack is confidence it's real and efficient. *(Evidence: product brief problem statement; competitive context.)*
2. **The Review stage is where the product wins or loses.** The map + reasoning view isn't a nice-to-have — it's the conversion moment. *(Derived from journey map.)*
3. **Personas may be contexts, not people.** The same user flexes between careful (Maya) and last-minute (Sam). Intake must scale from sparse to rich. *(Hypothesis — validate.)*
4. **Resilience may be a hindsight benefit.** Users are optimistic when planning; "backup in every slot" may not *sell* even if it *retains*. *(This is the riskiest assumption.)*

---

## Recommendations

1. **Design the intake to flex from one field to many** — don't force a persona choice. Serves Maya, Dan/Priya, and Sam from the same flow.
2. **Invest disproportionately in the Review screen** (map + per-item rationale). It's the conversion moment; treat it as the hero, not a feature.
3. **Make grounding visible, not just real** — surface "open Tue 9–6," "5-min walk from your morning stop." Trust comes from *showing* the data, not just using it.
4. **Test whether resilience sells.** If it's only a retention benefit, lead the marketing/demo with personalization + efficiency and let resilience be the quiet reason people come back.

---

## Open Questions (need primary research)

- **[User research]** Are these three personas distinct people, or one person in different contexts? → 5–7 interviews with recent independent travelers.
- **[User research]** Is "plan breaks on the ground" a pain travelers feel *acutely enough to switch* tools? → Interview probe on past trip failures (Mom Test style — ask about the last time, not hypotheticals).
- **[User research]** Does resilience register as a *selling* point at planning time? → Concept test: show two mock plans (one emphasizing personalization, one emphasizing backups) and observe which earns trust.
- **[Data]** What % of target travelers are couples vs. solo? Affects whether blending is P0 or P1. → Lightweight survey.

> **Suggested next step:** Run 5–7 short interviews with people who took an independent 3–7 day trip in the last 6 months, using a Mom-Test-style script focused on *what actually broke* and *what they did about it*. That single study would validate or kill the trust/resilience wedge before you write product code.

---

*Reminder: with zero primary data, this report is a set of testable bets — not user truth. Its job is to focus the first round of real research, not replace it.*
