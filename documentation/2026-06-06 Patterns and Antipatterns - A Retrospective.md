# Patterns and Antipatterns — A Retrospective

**Date:** 2026-06-06
**Case:** Not a slice. A synthesis across the 14 lessons docs in this folder — from the May 12 deep-link crash through the June 4 multi-tab race that closed the partial-save arc. The per-slice lessons docs each capture one situation; this doc is the cross-cut, the list of things that kept showing up. If the per-slice docs are the workouts, this is the trend line.

---

## How to read this

The patterns and antipatterns below aren't ranked — they're each cheap to internalise individually but expensive to discover from scratch each time. Where a pattern came from a specific slice, the slice is cited so I can re-read the situation that taught it. A few of these are present in five or more slices; those are the ones I trust most.

The doc is organised in three sections:

- **Patterns worth repeating** — structural moves that paid off, often more than once.
- **Antipatterns that bit us** — things that looked fine in isolation and were wrong at the seams.
- **Meta-lessons** — the throughlines. Not technique-level, more about how I'm working.

---

## Patterns worth repeating

### Vertical slices, not Iceberg PRs

The PWA work shipped as V1→V5. Partial-save shipped as V1→V6. Each slice was demonstrable on its own, reversible on its own, and small enough that the review surface area fit in working memory. The alternative — one "feat: add PWA support" or "feat: save partial workouts" commit of ~600+ lines — would have been unreviewable, unrollbackable, and would have produced no learning per layer. The slices accumulate compound interest: V5 paid three lines for an exhaustive `switch` with a `never` default; V6 collected when the union grew (see below). The pattern only feels expensive in the slice that introduces it.

Sources: [PWA arc](./2026-05-23%20Lessons%20from%20the%20PWA%20Offline%20Arc.md), [Wiring the Checkpoint Plumbing](./2026-06-03%20Lessons%20from%20Wiring%20the%20Checkpoint%20Plumbing.md), [Closing the Multi-Tab Race](./2026-06-04%20Lessons%20from%20Closing%20the%20Multi-Tab%20Race.md).

### Land the schema before its callers

V1 of partial-save shipped the `Checkpoint` type, four storage helpers, the `isCompletedSession` predicate, the `sourceRunId`-based idempotency on `saveSession`, and every history-page change that depended on the new shape — with zero callers wired up for the helpers. The only path to a partial row was a manual DevTools injection. V2's diff was ~80 lines in one file; that smallness was the validation that V1 got the contract right. If V2 had needed to reach back and add a field, V1's design was incomplete.

Source: [Landing a Schema Before Its Callers](./2026-05-25%20Lessons%20from%20Landing%20a%20Schema%20Before%20Its%20Callers.md).

### Tagged unions with a `never`-default exhaustive switch

V5 paid three lines at the toast wording site to make a future arm on `ReconcileResult` surface as a compile error rather than silent missing wording. V6 collected on those three lines two weeks later when `stale-runid` was added — TypeScript pointed at exactly the line that needed a wording decision, at the moment the decision could be made cheaply. Same primitive at the reconciler itself: `ReconcileResult` is a 6-arm discriminated union, every caller has to handle each case explicitly, the compiler catches the missed ones.

Sources: [The Resume-Stale Toast](./2026-06-04%20Lessons%20from%20the%20Resume-Stale%20Toast.md), [Closing the Multi-Tab Race](./2026-06-04%20Lessons%20from%20Closing%20the%20Multi-Tab%20Race.md).

### RunId-scoped destructive operations

`clearCheckpoint({runId})` no-ops when the persisted runId doesn't match. That single piece of structural discipline replaced a scatter of `if (test) return` guards (test runs use a magic `testRunId` that never matches a real checkpoint) AND closed the multi-tab clobber race AND let V6's internal `clearCheckpoint` calls inside `reconcileCheckpoint` scope correctly to `cp.runId`. The token does the work that a scattered set of explicit checks would have. A nice signal for the pattern: when you find yourself wanting to add an `if (someContext)` guard before a mutation, ask whether the mutation should take a scoping argument instead.

Sources: [Landing a Schema](./2026-05-25%20Lessons%20from%20Landing%20a%20Schema%20Before%20Its%20Callers.md), [Wiring the Checkpoint Plumbing](./2026-06-03%20Lessons%20from%20Wiring%20the%20Checkpoint%20Plumbing.md), [Closing the Multi-Tab Race](./2026-06-04%20Lessons%20from%20Closing%20the%20Multi-Tab%20Race.md).

### One snapshot seeds state, refs, and side-effects together

V4's `WorkoutPage` computes a single `useState(() => compute(...))` snapshot and passes it to `WorkoutBody`, which seeds every `useState`, every `useRef`, and the initial audio cue from the same source. Three separate `loadCheckpoint()` reads would have been three inconsistency windows. Generalises: when restoring from persistence, materialise the truth once and let every consumer read from the same materialised value.

Source: [Resuming Mid-Workout](./2026-06-04%20Lessons%20from%20Resuming%20Mid-Workout.md).

### Single source of truth for an invariant

`isCompletedSession(s)` lives in one place; every `todayCount`, `currentStreak`, and `last7Days` filter routes through it. Back-compat for missing `status` fields lives in that one predicate, not at every caller. Same shape on the rest screen: a derived `previewed = phase === "rest" ? (next ?? current) : current` value, with icon, name, and tip all reading from it. The screen got shorter and the bug went away.

Sources: [Landing a Schema](./2026-05-25%20Lessons%20from%20Landing%20a%20Schema%20Before%20Its%20Callers.md), [Pointing the Rest Screen Forward](./2026-05-23%20Lessons%20from%20Pointing%20the%20Rest%20Screen%20Forward.md).

### Reuse the validator from multiple call sites

V4 calls `reconcileCheckpoint` at home mount AND at Resume click. Same idempotent function, no new freshness constants to drift, the click-time call closes the "CTA sat on screen for 30 minutes" gap by reusing the mount-time logic. The validator is the single source of truth for freshness; everything that needs freshness asks it.

Source: [Resuming Mid-Workout](./2026-06-04%20Lessons%20from%20Resuming%20Mid-Workout.md).

### Acquire + revoke listeners come as a pair

Every browser API that hands you a revocable handle — wake lock, audio context, geolocation watch, media stream, persistent storage — needs both an acquire call and a paired revocation listener. `useWakeLock` listens to both `visibilitychange` (intent: I want a new lock) and the sentinel's `release` (observation: my lock is gone). If you only have one, the other is the bug-in-waiting.

Source: [The Hands-Off UX Polish](./2026-05-23%20Lessons%20from%20the%20Hands-Off%20UX%20Polish.md).

### Two concurrency guards around any `await` in an effect

`inFlight` closes the re-entry window between starting and finishing an async request. `cancelled` closes the unmount-during-request window. Different bugs, different symptoms, same shape — anything that lives across an `await` needs a guard at both ends. From the wake-lock hook, but applicable everywhere effects do async work.

Source: [The Hands-Off UX Polish](./2026-05-23%20Lessons%20from%20the%20Hands-Off%20UX%20Polish.md).

### Pair cache lifetime to its invalidator

Google Fonts and the app bundle invalidate for different reasons (Google updates a subset of unicode-range files at unknown cadence vs. we ship a deploy) and live in separate caches. "One cache for everything" is convenience masquerading as design. Generalises: when two pieces of state have different update sources, give them different stores.

Source: [The PWA Offline Arc](./2026-05-23%20Lessons%20from%20the%20PWA%20Offline%20Arc.md).

### Content-hash the thing whose identity matters

The SW version is the content hash of the precache list, not a timestamp — because the _list_ is the identity that should invalidate cached clients, not the _moment we deployed_. Asset content gets hashed into filenames. Same primitive at multiple scopes.

Source: [The PWA Offline Arc](./2026-05-23%20Lessons%20from%20the%20PWA%20Offline%20Arc.md).

### Test instruments before iteration

`?test=1` compressed a 7-minute workout loop to ~84 seconds AND short-circuited the history write. Everything downstream of that flag — the DoneScreen animation polish, the partial-save verification matrix, the V6 multi-tab cases — was gated by the iteration speed. The instrument pays for itself by round two of polish. Corollary: **the instrument must isolate side effects.** Compressing time is fine; mutating real history is not. The "test mode writes nothing" rule pulled forward into the partial-save shaping.

Source: [Closing the Workout Loop](./2026-05-23%20Lessons%20from%20Closing%20the%20Workout%20Loop.md).

### Verification matrix shape beats matrix size

V6's four Tab-B-state cases — fresh, stale-above-threshold, completed-pending, 0-completed-fresh — each exercised a different writing branch inside `reconcileCheckpoint`. A single happy-path case would have masked a "guard placed too late" bug. Choose cases that cover branch _coverage_, not just outcome coverage. Same principle drove the V4 verification: cases were chosen to walk every render path, not to accumulate breadth.

Sources: [Resuming Mid-Workout](./2026-06-04%20Lessons%20from%20Resuming%20Mid-Workout.md), [Closing the Multi-Tab Race](./2026-06-04%20Lessons%20from%20Closing%20the%20Multi-Tab%20Race.md).

### Clear before you navigate when the destination is a delayed writer

V4's Start Over clears the checkpoint _synchronously_, then navigates. The destination (`workout.tsx`) doesn't write its first checkpoint until the first phase transition — a ~6-second window where a tab close would have let the old run survive as a phantom partial. Reverse-order works for V3's terminal Save / Discard / Skip because nothing else writes after them; it doesn't work for navigation into a delayed writer.

Source: [Resuming Mid-Workout](./2026-06-04%20Lessons%20from%20Resuming%20Mid-Workout.md).

---

## Antipatterns that bit us

### Returning non-serializable values from SSR loaders

A Lucide icon component in the routine loader's return value → the SSR serializer (`seroval`) refused to encode the icon's `forwardRef` symbol → the server crashed mid-stream → the client tried to hydrate against state that was never written → the visible error was a downstream invariant about missing dehydrated state, three layers from the cause. Pass IDs across the boundary; look up rich objects (with icons, functions, DOM nodes, anything non-serializable) inside the component.

Source: [The Routine Deep Link Crash](./2026-05-12%20Lessons%20from%20the%20Routine%20Deep%20Link%20Crash.md).

### Native browser primitives in a phone-first PWA

`window.confirm()` for quit. `user-scalable=no` in the viewport. Both inherited, both wrong for the form factor. The browser features people strip to "feel more native" — universal accessibility, pinch zoom, deep-linkable URLs — are usually the ones that make the web better than native. "Native feel" is a category of antipattern, not a justification.

Sources: [Initial Product Audit](./2026-05-12%20Initial%20Product%20Audit.md), [Removing user-scalable=no](./2026-05-15%20Lessons%20from%20Removing%20user-scalable%3Dno.md).

### Inherit-and-don't-audit

The Lovable scaffold's defaults shipped to production unchallenged. `user-scalable=no`, the missing 192×192 icon, the wrong OG image, the absent SW (intentionally absent, as it turned out — see the inverse below). When you adopt a scaffold, schedule a pass through every default and ask "why?" Cousin pattern, equally important: **before fixing a "missing" thing, find out whether it was missed or removed on purpose.** The same artifact looks like a bug from one angle and a design choice from another.

Sources: [Removing user-scalable=no](./2026-05-15%20Lessons%20from%20Removing%20user-scalable%3Dno.md), [Initial Product Audit](./2026-05-12%20Initial%20Product%20Audit.md) (PWA addendum).

### Copy that compensates for a wrong model

"Side Plank — 30s each side" was the user's job to reconcile because the timer ignored it. The label tried to paper over a model bug; the fix was two entries (Right and Left) with two timers, not better copy. When you find yourself writing instructions that ask the user to do mental gymnastics the system should be doing, the model is wrong.

Source: [Closing the Workout Loop](./2026-05-23%20Lessons%20from%20Closing%20the%20Workout%20Loop.md).

### Invariants nobody has ever crossed are assumed, not documented

Four sites in `workout.tsx` hardcoded `EXERCISES[0]` or `index: 0` because under the pre-Resume invariant there was no daylight between "the literal `0`" and "the current `index`." All four were correct under the old behaviour; all four were wrong the moment Resume handed the state machine a non-zero starting index. The first feature that crossed the invariant would have broken silently in three places at once. Find every site that was leaning on the invariant; don't just teach the new feature to fit it.

Source: [Resuming Mid-Workout](./2026-06-04%20Lessons%20from%20Resuming%20Mid-Workout.md).

### UI conditional without a paired handler guard

"Save partial" is only rendered when `completedExercises > 0`, AND `savePartialAndQuit` _also_ guards with `if (completedExercises < 1) confirmQuit()`. The UI is the experience guard; the handler is the data guard. They will drift; the handler is the one that keeps the data correct when they do.

Source: [The First Caller of a New Schema](./2026-05-25%20Lessons%20from%20the%20First%20Caller%20of%20a%20New%20Schema.md).

### Hybrid toasts — receipt + unrelated CTA

A toast is either a receipt (no action) or an undo (action that reverses the cause). Anything in between reintroduces the decision the action was supposed to resolve. The stale-Resume toast deliberately has no "View history" link, because that links to an affordance unrelated to the cause and turns the toast into a second decision point.

Source: [The Resume-Stale Toast](./2026-06-04%20Lessons%20from%20the%20Resume-Stale%20Toast.md).

### Toast wording that asserts remote intent

"Resumed in another tab" assumes the other actor is the user, is resuming (not starting fresh), and chose the same routine — none of which is knowable from this tab. "Workout no longer available" is unconditionally true. Describe the local fact, not the inferred remote intent. Failure mode: an iOS BFCache wake-up looks identical to "another tab acted" and any speculative wording lies in that case.

Source: [Closing the Multi-Tab Race](./2026-06-04%20Lessons%20from%20Closing%20the%20Multi-Tab%20Race.md).

### Refresh-in-place loops after a freshness check

V6's first plan included a `discoverResumable()` helper that would have re-called the freshness check in the `stale-runid` arm — bypassing the guard it had just added and re-introducing the race. The rubber-duck pass killed it before any code was written. General shape: when you add a non-mutating early-return arm to a function, audit every site that loops back to "try again" — those loops bypass your guard.

Source: [Closing the Multi-Tab Race](./2026-06-04%20Lessons%20from%20Closing%20the%20Multi-Tab%20Race.md).

### The short-circuit placed after the writing branches

A non-mutating new arm in a side-effecting function has to return _before_ any side-effect line, or the caller is being told about damage that's already done. V6's `stale-runid` arm sits immediately after the `loadCheckpoint()` null check and before any branch that writes. If it sat after the writing branches, the toast would be honest ("Workout no longer available") and the data would be wrong (the row got written anyway).

Source: [Closing the Multi-Tab Race](./2026-06-04%20Lessons%20from%20Closing%20the%20Multi-Tab%20Race.md).

### Refs lag the state setters that just changed

A `useEffect` that syncs `ref.current = state` runs _after_ the render that consumed the new state, which is _after_ the synchronous block that called `setState`. Helpers called from inside `advancePhase` had to take post-transition `phase` / `index` as explicit arguments because the syncing effect hadn't run yet. Generalises: if a synchronous block calls `setState` and then calls a helper that needs the new value, pass the new value as an argument — don't read from a ref.

Source: [Wiring the Checkpoint Plumbing](./2026-06-03%20Lessons%20from%20Wiring%20the%20Checkpoint%20Plumbing.md).

### Asymmetric platform testing

iPhone-first dev silently shipped an Android-only `user-scalable=no` regression because iOS Safari has ignored the tag since 2016 on accessibility grounds — Chrome on Android still honors it. The platform you don't test on is where the regression lives. Corollary: any time you hear "works on my phone," ask which platform isn't on your phone.

Source: [Removing user-scalable=no](./2026-05-15%20Lessons%20from%20Removing%20user-scalable%3Dno.md).

### Every explicit user action must clear its own checkpoint

The reconciler is for the _implicit_ case (process death, tab close, BFCache eviction). Every _explicit_ terminal action — Save, Discard, Skip, the DoneScreen's Skip — must clear its checkpoint, because if it doesn't, the next mount will reverse the user's decision via reconciliation. V3 caught one of these (DoneScreen's bare `<Link to="/">Skip</Link>` would have resurrected the just-skipped completed run as a difficulty-null partial) only because the rubber-duck pass walked every terminal path.

Source: [Wiring the Checkpoint Plumbing](./2026-06-03%20Lessons%20from%20Wiring%20the%20Checkpoint%20Plumbing.md).

---

## Meta-lessons

### Rubber-duck the plan, not the implementation

Two real bugs in PWA V4, caught at zero implementation cost. The Skip-resurrection bug in V3. The `discoverResumable()` refresh-loop in V6. The `EXERCISES[0]` hardcoding sites in V4. Every one of these would have cost a code+lint+build+review cycle to unwind post-hoc. The earliest moment to catch a bug is the cheapest moment. The default workflow now is: write the plan, get a critique on the plan, then write the code. Skipping the critique step is the highest-regret move in this entire repo.

### Subtraction is often safer than addition

Deleting the routine loader fixed the deep-link crash; a `{ id }`-only loader would also have worked, but removing the loader entirely eliminated the failure _class_. The `previewed` derived value on the rest screen collapsed three nested conditionals into one and the file got shorter. Removing `user-scalable=no` was one deleted token. When the fix is smaller than the bug, that's a signal you've found the right fix.

### Documentation IS the work, not after the work

The V5 lessons doc named the multi-tab race as an open question; V6's plan started from that named question. The V1 lessons doc spelled out the runId-scoping pattern; V3, V4, and V6 all built on it. The pattern catalogue you're reading right now will be the next slice's brief. Lessons docs are not retrospectives — they're forward-looking artifacts that set up the next slice to start from the right place.

### Slices accumulate compound interest

V5 paid for the `never`-default exhaustive switch. V6 collected. V1 paid for the runId discipline. V3, V4, V5, V6 all collected. The pattern only feels expensive in the slice that introduces it; by the third slice that benefits from it, the original cost has rounded down to zero. This is the load-bearing argument for vertical slicing — not just that small commits are easier to review, but that the patterns you introduce in slice N become structural advantages for slices N+1 through N+k.

### Name the user's internal question and answer that

"Catch your breath" → "Up next: Squat." "Resume failed" → "Workout timed out — saved to history." "Quit workout" → "Discard workout." The question the user is computing _right now_ is the only one the copy should address. Generic, system-centric language ("save successful," "operation completed") fails the user's actual question and trains them to mistrust the UI's voice.

### Accessibility is the steady state, not the edge case

Pinch-zoom for a workout app used phone-on-the-floor with sweat in the eyes and reading glasses off isn't an edge case — it's Tuesday. Most a11y antipatterns don't hurt a small minority of users; they hurt a large majority of users some of the time. Designing for the worst version of the user's situation makes the average situation better, not worse.

### The partial-save arc is the case study

V1→V6 is the most disciplined slicing I've done in this repo and it's worth re-reading as a unit. Each slice answered exactly one question. Each slice's lessons doc became the next slice's brief. Each slice introduced or collected on a structural pattern. The arc is small enough to keep in working memory and complete enough to show the full shape: schema → first caller → plumbing → UI → UX gap → race condition.

| Slice | Question | What landed                                                                                       | What got cashed in later                                  |
| ----- | -------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| V1    | Contract | `Checkpoint` type, four helpers, `sourceRunId`, `isCompletedSession`, history-page rendering      | V2 validated it in ~80 lines. Six slices read from it.    |
| V2    | Caller   | Quit dialog grows "Save partial," `elapsedActiveSeconds()` harmonised across save paths           | First real partial rows. Schema design judged correct.    |
| V3    | Plumbing | `saveCheckpoint` on every transition, `clearCheckpoint` on every terminal, mount-time `reconcile` | V4's Resume CTA read state V3 produced, zero new plumbing |
| V4    | UI       | Resume / Start over / Discard cluster, `initial`-snapshot pattern, click-time revalidation        | V5 had a coherent UI to attach a toast to                 |
| V5    | UX gap   | 2-second toast scoped to click-time stale Resume, `never`-default exhaustive switch               | V6's new arm got a compile error at the wording site      |
| V6    | Race     | `expectedRunId` option, `stale-runid` arm, runId-scoped internal clears                           | The arc closes; one open item remains (mobile toast pos)  |

---

## TL;DR

If I had to keep five lines:

1. **Rubber-duck the plan, not just the implementation.** Cheapest moment to catch a bug is before you've written it.
2. **Vertical slices, schema-first, contract before callers.** Smallness in slice N is the validation of slice N−1.
3. **RunId / token-scoped destructive operations + tagged unions with `never`-default switches.** Structural correctness instead of scattered guards.
4. **Single source of truth for invariants, one snapshot for derived state, reuse the validator across call sites.** Don't restate the truth; reference it.
5. **Subtraction over addition. Local facts over remote intent. The user's question over the system's verb.** When the fix is smaller than the bug, you've found the right fix.
