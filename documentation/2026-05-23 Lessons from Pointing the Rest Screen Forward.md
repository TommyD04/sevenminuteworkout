# Lessons from Pointing the Rest Screen Forward

**Date:** 2026-05-23
**Case:** A small, isolated bug — during the rest interval the workout screen showed the icon of the just-finished exercise and a generic "Catch your breath" header. The roadmap framing called for "preview the next one," and that reframe — _the rest screen is supposed to be forward-looking, not backward-looking_ — turned out to be the entire fix in one sentence.

---

## The case in three sentences

The workout's `index` only advances on the rest→work transition, so the index points at the same exercise across that exercise's work _and_ its trailing rest interval. The render block was reading `EXERCISES[index]` for the icon and a multi-branch conditional for the title and tip, which meant during rest the visible content described the past, not the future. The fix introduced a single `previewed` variable that resolves to the next exercise during rest, then routed icon, name, and tip through it — the entire change was about 15 lines and made the file shorter than before.

---

## Angle 1 — Same data model, two display contracts

The bug is interesting because `index` was not lying. It correctly identified which exercise was "active" — including during the 10-second rest interval that belongs to that exercise. The audio module agreed: `restBeep` fired and `speak("Rest. Next: <name>")` announced the upcoming work. Everything except the render block was forward-looking.

The render block was applying the wrong _display contract_ to the right data. The contract it was using: "show what `index` identifies." The contract the user wanted: "show what the user should be thinking about next." During work, those are the same value. During rest, they diverge.

The lesson is to name the forward-looking concept separately as soon as the divergence appears:

```tsx
const current = EXERCISES[index];
const next = EXERCISES[index + 1];
const previewed = phase === "rest" ? (next ?? current) : current;
```

`previewed` is the display concept; `current` and `next` are the data. The view code now reads from a single source of truth that knows the difference between "what's happening" and "what should be on screen."

This generalizes anywhere the active object and the displayed object can diverge — a chat input that shows "<user> is typing…" alongside a thread of someone else's messages, a queue UI that shows "now playing" but should preview "up next" during a crossfade. Two concepts, two names.

---

## Angle 2 — Mirror the convention next door before inventing a new one

The ready phase already had a forward-looking pattern: `"First up: <name>"` with the first exercise's icon and tip. That same shape generalizes to rest: `"Up next: <name>"`. Same prefix-then-name grammar, same icon-name-tip stack, identical visual rhythm. Users who internalized the ready screen immediately understand the rest screen without learning anything new.

The temptation was to design something rest-specific — a recovery-themed layout, a different icon size, a "rest counter" element. None of that was needed. The phase label at the top (in the rest color) and the orange progress ring already carry the "this is rest" signal. The body content can be — _should be_ — the same shape it always is, just pointing at a different exercise.

Internal consistency before novel patterns. If a piece of UI already encodes the concept you need ("here's a preview of an exercise"), reuse the encoding even if the use case is new.

---

## Angle 3 — "Catch your breath" was telling the user the obvious

The old H2 during rest said "Catch your breath." It's a friendly message, but it carries no information the user doesn't already have: the screen color changed, the audio cue played, the user just finished 30 seconds of burpees and is, in fact, catching their breath. The label was tautological with the rest of the phase signaling.

What the user genuinely doesn't know during rest is _what's coming in 10 seconds_. Lunges? Side plank? The instinctive mental task during the rest interval is exactly that lookup — and the app was forcing it to happen in the user's head while the screen displayed redundant copy.

A useful framing: in any UI moment, identify the one thing the user is computing in their head right now. If your screen is showing them something they already know, you've spent the most valuable real estate on the lowest-value content. Show them the answer to their internal question instead.

---

## Angle 4 — Subtraction over addition (again)

The fix made the file _smaller_. The replaced render block had three nested conditionals (one for icon source, one for title, one for tip) referencing two different exercises (`current` and `next`). The new block has one variable definition and three uniform reads from it.

This is the same shape as the routine deep-link crash fix from 2026-05-12: the cheapest correctness wins are often removals, not additions. There, removing the loader return value entirely was safer than trimming it. Here, removing the rest-specific copy and the conditional tip-vs-next-name logic was both correct and shorter.

The instinct when a screen is "wrong" is usually to add a special case. Try subtraction first: is the special case actually load-bearing, or is it a layer that obscures the simpler model underneath?

---

## Angle 5 — A defensive fallback can document an invariant

`previewed = phase === "rest" ? (next ?? current) : current` includes a `?? current` fallback that can never fire — the workout transitions from the last work straight to `done`, never to rest, so `next` is guaranteed defined whenever `phase === "rest"`. The fallback is there anyway, with a comment.

This is the right kind of defensive code. It doesn't hide a bug (the surrounding code prevents the case from arising); it documents the invariant in the place where a future reader would otherwise wonder. The alternative — `previewed = phase === "rest" ? next! : current` — gets the type-checker to agree but tells a future maintainer nothing about _why_. The fallback says "the author thought about this and verified it can't happen, but if `advancePhase` ever changes to allow a final-rest, here's the graceful behavior."

Defensive code that documents > defensive code that suppresses > defensive code that hides.

---

## Patterns

- **Name the forward-looking concept when it diverges from "current."** `previewed` did the work that `current` couldn't. As soon as the display contract is "show what the user is about to deal with," that's a different variable from "show what's happening now."
- **Reuse the encoding of the screen next door.** "First up:" → "Up next:" is the same shape with a different prefix. Don't invent a layout for a new use case if an existing one already encodes the concept.
- **Identify the user's internal question and answer it.** The most valuable copy answers the question the user is currently computing in their head. If the screen tells them what they already know, the screen is wasted.
- **Subtraction over addition.** Special cases multiply complexity. Before adding a branch, check whether a more general form removes the branch entirely.
- **Defensive fallbacks document invariants.** A `?? current` that can't fire is fine — _if_ it tells the next reader what the invariant is and what would happen if it changed.

---

## Antipatterns

- **Generic phase labels duplicating the phase indicator.** "Catch your breath" on a screen that is already obviously a rest screen. Two signals carry the same bit; the second crowds out useful information.
- **Reading `EXERCISES[index]` in three places with three different intents.** The icon, title, and tip each made an independent decision about which exercise to show. Three decisions are easy to drift; one `previewed` variable is harder to get inconsistent.
- **Non-null assertions to satisfy the type-checker.** `next!` compiles but communicates nothing about why `next` is guaranteed defined. A `?? current` fallback with a comment is more honest about the invariant.
- **Inventing a new visual shape per phase.** Tempting and almost always overkill. The ready, work, and rest screens all benefit from the same icon-name-tip stack; the differentiation is the phase label and ring color, not a layout rewrite.

---

## Open questions

- **Should the previewed exercise's icon pulse during the last 3 seconds of rest?** A small attention pull at the moment the user should be moving back into position. Probably worth a separate small experiment.
- **Should the phase label up top get larger during rest?** It's currently the same uppercase eyebrow as work, and easy to miss in peripheral vision when the user is wiping sweat off their face. The current trade-off prioritizes the next exercise being big and readable.
- **Does the wording want to become "Up first:" for grammatical symmetry with "Up next:"?** Tiny copy nit. The original "First up:" was Lovable-generated; the new "Up next:" is consistent with itself. Not worth the diff right now.

---

## TL;DR

- The rest screen was showing what just finished instead of what was about to happen — the index correctly identified the active exercise, but the display contract should have been forward-looking, not state-mirroring.
- The fix introduces a derived `previewed` variable that resolves to the _next_ exercise during rest, and routes icon, name, and tip through it. Net result: shorter code, correct behavior, mirrors the existing "First up:" convention from the ready phase.
- The generalizable lesson: when "current" and "what the user needs to see next" diverge, name the second concept explicitly and let the view read from it.
- Adjacent lessons: tautological copy (the user already knows it's rest) crowds out useful copy; subtraction beat addition; a defensive fallback can document an invariant rather than hide a bug.

— Goodfellow
