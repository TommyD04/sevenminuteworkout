# Lessons from Closing the Workout Loop

**Date:** 2026-05-23
**Case:** Three changes shipped together to harden the end-of-workout experience: a `?test=1` URL flag that compresses the full flow into ~84 seconds, a staged celebration animation on the DoneScreen that culminates in lime-tinted bumps when "today's rounds" and "day streak" tick up, and a content fix that splits each side-plank exercise into separate Right and Left intervals. The three changes look unrelated until you arrange them in the order they were made — the test flag was the instrument that made it possible to iterate on the celebration in minutes instead of hours.

---

## The case in three sentences

The DoneScreen had been a flat congratulations text since the app shipped; making it _feel_ like the reward for finishing a workout required watching the screen appear many times, which a real workout makes prohibitively slow. A `?test=1` flag compresses the tempo to 5/2/2 seconds and skips writing to history, turning a 7-minute feedback loop into ~84 seconds with no side effects. With that loop in place, the celebration animation grew in stages (ring strokes in, check draws, tiles fade up, then numbers bump) and a content bug — "Side Plank — 30s each side" being a single 30-second timer entry instead of two — became easy to spot and fix because the test tempo runs through the whole exercise list in under two minutes.

---

## Angle 1 — Build the test instrument before iterating

Animation work is a special case of UX work where the feedback loop is the iteration cycle. Three guesses per minute beats three guesses per hour, every time. The cost of the test tempo was a few lines: a URL search-param check, a `Tempo` type, and a tempo selector inside the phase-duration helper. The benefit is durable — it applies to every future change touching the workout flow, not just the celebration.

The general principle is "if you're about to iterate on something gated by a slow path, pay the up-front cost to make the path fast." It's the same logic as fixtures in tests or seed data in databases: the loop is the asset. The test tempo also turned out to double as a debugging affordance for the rest-screen forward-looking fix earlier the same day — once it existed, every subsequent fix benefited.

The shape of the affordance matters too. The test mode is a URL flag (`?test=1`), not a build-time constant or an environment variable. Anyone can hit `localhost:8080/workout?test=1` and run through the flow; nobody has to remember to revert anything. The lowest-friction form of an instrument is the one that survives because there's no temptation to remove it.

---

## Angle 2 — The test instrument must not lie about side effects

Compressing time is harmless. Compressing history writes would have been catastrophic. The early instinct was "set tempo to fast and run a workout"; the corrected instinct was "set tempo to fast _and_ flag the session so it skips `saveSession()`." Without the second half, every test run would have polluted history, broken streaks, and inverted the relationship between the tool and the data.

The general rule: a test instrument that writes to the same place as real usage is not a test instrument, it's a footgun. The flag isn't just about timing; it's a guarantee that no observable user data is affected. The DoneScreen reads `test` from the workout state and skips the save path entirely — the tile increments and the celebration still fire visually, but `seven-min-sessions-v1` is untouched.

This same constraint pulled forward into the partial-save shaping done immediately after — R1 in that work is "test mode writes nothing — no history row, no in-progress checkpoint," lifted directly from this design. The rule, once established, becomes load-bearing.

---

## Angle 3 — Stage the celebration around cognitive load

The celebration has three visual moments that arrive in a specific order: the green ring strokes around the checkmark (≈400ms), the check draws inside it (≈300ms), then the three stat tiles fade up from below (≈600ms staggered). Only after the tiles have settled do the "Today's rounds" and "Day streak" values pulse if they incremented. The total runtime is around 1.4 seconds.

The order isn't aesthetic — it tracks the user's mental questions in sequence:

1. **"Did I finish?"** → ring + check answer this.
2. **"What did I do?"** → tiles materialize with the count, duration, and difficulty prompt.
3. **"What changed because of this?"** → the bump on Today's rounds or Day streak shows the delta after the value is already on screen.

A simultaneous reveal would have the user trying to read three things at once and missing the increment because they didn't know there was a previous value. By the time the bump fires, the eye is already on the tile. The animation IS the answer to a question, and the question has a temporal structure.

The same principle applies to almost any "summary" screen: the order of arrival should match the order of questions. Numbers that haven't been on screen yet can't be felt as having gone up.

---

## Angle 4 — Every flourish needs a quiet fallback

The CSS keyframes are gated behind `@media (prefers-reduced-motion: reduce)`, which forces every animated element to its final state immediately. The user who has vestibular sensitivity or has chosen to opt out of motion gets the same information — the ring is complete, the check is drawn, the tiles are visible, the numbers are correct — without any of the motion. They don't see a degraded version; they see the static end-state, which is also a perfectly valid summary screen.

The pattern: any animation that conveys information must also work as a still image. If turning off motion destroys the meaning, the meaning was riding on the motion instead of being supported by it. The celebration is decoration on top of a static layout that already says everything. That's the test.

There's a related point about defaults: the animations run for everyone by default and the reduced-motion users get the override. That's the right asymmetry — most users benefit from the motion, the minority who don't get exactly what they asked for. The reverse (animations off by default with a "make it pretty" toggle) would mean every user has to discover the polish themselves.

---

## Angle 5 — Content fixes are model fixes when the model lies

The "30s each side" tip on Side Plank was a string. The timer was a single 30-second work phase. The two disagreed. The user who took the tip literally would do 15s left + 15s right and short the exercise; the user who took the timer literally would do 30s on one side and skip the other.

The model didn't match the experience. The fix wasn't to clarify the tip — it was to make the data match the workout: two 30-second entries, "Side Plank, Right" and "Side Plank, Left," with side-specific tips. The total session got ~75 seconds longer, but every other invariant held: `EXERCISES.length` is dynamic, `TOTAL_SECONDS` is computed, the `1/N` counter still works.

The lesson generalizes: when you find a piece of copy that's compensating for a model mismatch, fix the model. Copy that explains around a wrong shape is technical debt that creates user confusion every session. Three side-plank entries (one per routine) now do the right thing without needing the user to remember anything.

A secondary observation: the app's name no longer matches its duration. "Seven Minute Workout" is now ~8:30. That's a problem for marketing copy and route-naming if the project ever grows past three routines, but it's not a problem for the model — the model is "however long the exercises take." The name was always a description of the original 12-exercise format, not a contract.

---

## Patterns

- **Build the instrument before iterating.** A URL flag that compresses time + skips writes turns a 7-minute iteration loop into 84 seconds. The instrument pays for itself in two rounds of changes.
- **Test instruments must isolate side effects.** Compressing time is fine; writing fake history is not. The flag must guarantee no observable user data is mutated.
- **Stage reveals to match user questions.** "Did I finish?" → "What did I do?" → "What changed?" arrives in that order, so the animation arrives in that order. Numbers that haven't been on screen can't be felt as having changed.
- **Animations are decoration on a working still image.** `prefers-reduced-motion` should produce the final state, not a broken intermediate state. If turning off motion destroys meaning, the meaning was carried by the motion, not the layout.
- **Fix the model, not the copy.** Tips compensating for wrong timer behavior are technical debt. Two side-plank entries replace one tip-needs-a-string that the timer ignored.

---

## Antipatterns

- **Iterating on slow paths.** Watching a 7-minute workout to see if the celebration looks right will result in either bad celebrations or no celebrations.
- **Test modes that mutate real data.** If the test instrument pollutes history, it's not a test mode — it's a worse production mode.
- **Simultaneous reveals.** "Everything appears at once" prevents the user from noticing what changed. The increment of a number is invisible if the number was never absent.
- **Animations without static fallbacks.** Decorating with motion that, if removed, leaves the screen incomprehensible. The animation must be on top of a complete still image.
- **Copy as model glue.** "30s each side" on a 30-second timer is the user's job to reconcile. The data should be self-consistent.

---

## Open questions

- **Should the test instrument be discoverable in dev mode?** The `?test=1` flag is currently undocumented in the UI — the "Test run" link is hidden in the README. Surfacing it in `import.meta.env.DEV` would make it easier to find, but might also make production users curious. The current invisibility is probably fine.
- **Should "Day streak" increment animate even on the first session of a new day if the previous day was missed?** Right now it bumps whenever `currentStreak` changes from prior to after. Edge case: starting a workout after a 3-day gap shows the streak jumping from 0 to 1 with a celebratory bump, which might feel like the wrong emotional pitch for someone who fell off. Not worth solving until/unless the friction is visible.
- **Are there other "model lies" elsewhere?** The exercise tips are the most likely place. A grep for time-y phrasing in tips ("each side", "with each rep", "alternate sides") would surface candidates. None spotted today, but worth doing once.

---

## TL;DR

- A `?test=1` URL flag that compresses the workout tempo to 5/2/2 seconds AND skips history writes turned a 7-minute iteration loop into 84 seconds, which unlocked every subsequent polish change.
- The DoneScreen now stages a green ring → checkmark → stat tiles → number bumps, in that order, because the user's questions arrive in that order. The whole sequence is gated by `prefers-reduced-motion`, which collapses it to the static end-state.
- "Side Plank — 30s each side" was a copy fix for a model bug: the data said one exercise, the tip said two. It's now two entries (Right and Left) in all three routines.
- Generalizable rules: build the test instrument before iterating, isolate test side effects from real data, stage reveals to match the user's questions, animations need static fallbacks, and copy that compensates for a wrong model is technical debt.

— Goodfellow
