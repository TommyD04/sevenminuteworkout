# Lessons from Wiring the Checkpoint Plumbing

**Date:** 2026-06-03
**Case:** V3 of the "save partial workouts on quit" arc. The V1 checkpoint helpers (sitting unused since they shipped) finally get called: `saveCheckpoint` on every phase transition, `clearCheckpoint` on every terminal path, and `reconcileCheckpoint` on home mount before the metrics load. A rubber-duck pass on the plan caught a bug where DoneScreen's "Skip" link would have resurrected the just-skipped completed session as a difficulty-null history row, and the fix exposed a more general principle about checkpoints whose presence carries meaning.

---

## The case in three sentences

V1 had landed the storage helpers but no callers; V3's job was to wire them up across the workout state machine and the home-page reconciler. The naive plan — "write a checkpoint at every transition, reconcile on mount" — looked complete until rubber-duck pointed out that writing a `completedExercises === totalExercises` checkpoint at the work→done transition meant the reconciler would resurrect any completed run the user explicitly chose to skip via DoneScreen's "Skip" link. The actual implementation has three nuances the plan didn't surface: post-transition values can't be read from refs because the refs lag by a render, every terminal path has to clear the checkpoint or risk reconciliation reversing the user's explicit decision, and `exerciseIndex` needs documentation now so V4 doesn't have to add a phase field later.

---

## Angle 1 — Refs lag the state setters that just changed

React's `useState` setters are async with respect to the surrounding synchronous code. The pattern this codebase uses for "expose state to non-React code via a ref" is a `useEffect` that syncs ref to state:

```tsx
useEffect(() => {
  phaseRef.current = phase;
}, [phase]);
```

That effect runs _after_ the render that consumed the new `phase` value, which is _after_ the synchronous block that called `setPhase(...)`. So at the moment `advancePhase` finishes calling `setPhase("rest")`, `phaseRef.current` is still `"work"`. Any helper called from inside `advancePhase` that reads `phaseRef.current` sees the pre-transition phase.

The implementation specifically does this:

```tsx
function writeCheckpoint(next: { phase: Phase; index: number; done?: boolean }) {
  const completed = completedExercisesFor(next.phase, next.index, next.done ?? false);
  saveCheckpoint(
    { /* ... */ exerciseIndex: completed, completedExercises: completed /* ... */ },
    { test },
  );
}
```

`writeCheckpoint` takes explicit post-transition values instead of reading from refs. Each branch of `advancePhase` passes the values it's about to set:

```tsx
setPhase("rest");
// ...
writeCheckpoint({ phase: "rest", index: i });
```

The alternative — calling `writeCheckpoint` from a `useEffect` that watches `[phase, index, done]` — also works because effects fire after the ref-sync effects, by which time refs are correct. That would be more idiomatic React. The reason this implementation uses explicit args inside `advancePhase` instead is that the transition logic already lives there, and threading post-transition values is cheaper than introducing a new effect that has to encode the same "don't write during ready" / "write with done=true on work→done" decisions in a different shape.

The general lesson is small but durable: any helper called synchronously from inside a state-setter block must not depend on the refs that mirror the state being set. Either take the new values as arguments, or defer to a `useEffect` and read from refs after they've been synced.

---

## Angle 2 — A "completed-pending" checkpoint is also a resurrection vector

The V1 reconciler treats `completedExercises >= totalExercises` as a special case: write a `completed` session with `difficulty: null` and clear the checkpoint. This is the right behavior for a true crash — the user finished every exercise but the process died before they could rate, and reconciliation gives them credit on their next visit.

The V3 wiring writes exactly this kind of checkpoint at the work→done transition. So the DoneScreen renders with a checkpoint already on disk that says "this workout is complete; reconcile it if you find it." Tapping "Save" calls `clearCheckpoint({runId})` after writing the rated session — good. Tapping the X button isn't reachable from the DoneScreen — good.

But there was a third path: a bare `<Link to="/">Skip</Link>` element that navigated home without touching the checkpoint. The user's intent: "I don't want to rate this; don't save it." The actual outcome with V3's wiring: home would mount, reconciliation would see the completed-pending checkpoint, and write a difficulty-null history row. The user's explicit Skip would have been silently reversed by the reconciler's well-meaning crash recovery.

The fix is one new function (`skipDoneAndExit`) that calls `clearCheckpoint({runId})` before navigating, plus converting the `<Link>` into a button that calls it. The principle the bug exposes is bigger than the bug:

**Every terminal user action that doesn't want to be reconciled must clear its checkpoint.** "Did the user explicitly decide" and "is there a checkpoint" must agree. If the user decided "save," clear. If the user decided "discard," clear. If the user decided "I don't want a row for this," clear. The checkpoint persists _only_ for the implicit case — process death, tab close, OS evict — where the user didn't get a chance to decide.

Stated as an invariant: a checkpoint exists if and only if the workout is in-progress _or_ the user hasn't yet been given a chance to make an explicit save/skip decision. Every code path that resolves an explicit decision is a clear site. Forgetting one is a bug in exactly the same shape as the Skip bug.

The reason this is easy to miss in the plan: the reconciler's completed-pending case feels like a feature, not a footgun. It is a feature for crashes. It's a footgun for explicit-decline paths that don't know they need to participate.

---

## Angle 3 — A runId-scoped clear is the same safety guarantee as a no-op

V1's `clearCheckpoint({ runId })` looks up the persisted checkpoint and refuses to clear if the IDs don't match. V3 inherits that for free in two places where it matters:

1. **Test mode discard.** `?test=1` runs never call `saveCheckpoint` (the helper no-ops in test mode), so the persisted checkpoint — if any — belongs to a real workout in another tab or a prior session. The test run's `clearCheckpoint({ runId: testRunId })` no-ops because the persisted runId is different. The test mode doesn't need an `if (test) return` guard inside `confirmQuit` or `skipDoneAndExit`; the runId mismatch _is_ the guard.

2. **Multi-tab.** Tab A starts run A, Tab B starts run B (overwriting the checkpoint). Tab A's eventual quit calls `clearCheckpoint({ runId: A })`; the persisted runId is B, the clear no-ops, B is preserved. Without runId scoping, Tab A would have wiped B's checkpoint.

This is a small property and the kind of thing you forget you have until you don't have it. The mental model worth keeping: a runId is a token the workout already has for free, and threading it through every destructive operation costs one parameter and one if-check. It removes an entire class of "what if these two things race?" bugs without anyone having to think about which race is actually possible.

---

## Angle 4 — Documentation as scope reduction

V1's `Checkpoint` type defined `exerciseIndex: number` without saying what the field meant. There are at least three reasonable interpretations:

- **Raw React index** — the value of the `index` state at write time. Ambiguous about "what phase were we in" without a `phase` field.
- **Index of the in-progress exercise** — same as React index for work phase, but `index + 1` for rest. Forward-looking by interpretation.
- **Index of the next exercise to perform on resume** — equal to `completedExercises` under this app's phase model. Numerically identical to interpretation #2 in this codebase, but semantically different.

The rubber-duck pass surfaced this ambiguity as a V4 problem (V3 doesn't read the field; V4's Resume CTA will). The fix was to pick the third interpretation and document it on the type:

> Index of the _next_ exercise to perform on resume. Numerically equal to `completedExercises` in this app: during work of exercise i, exercise i is still in progress so the "next to perform" is also i; during the rest after exercise i, exercise i+1 is next. V4's Resume CTA can use this directly as `setIndex(cp.exerciseIndex)` with a fresh ready countdown — no phase field needed.

That comment is the entire scope reduction: V4 doesn't need to add a `phase` field to `Checkpoint`, doesn't need to disambiguate between rest and work resume models, doesn't need to write a separate "infer phase from completedExercises vs exerciseIndex" helper. The Resume CTA can be `setIndex(cp.exerciseIndex); setPhase("ready")` and the app handles the rest.

The general principle: when a future slice's design depends on the meaning of a field, document the meaning in the current slice. The cost is a docstring; the benefit is removing a decision from the future slice's scope. Decisions are the expensive part of software; eliminating them where you can is high-leverage.

The corollary: documentation is sometimes the right deliverable for a slice that "doesn't change behavior." V3's writeup of `exerciseIndex` doesn't move any logic. It does move a decision out of V4 and into now, which is the moment the question is already in the author's head. Six weeks later, the question would have to be re-derived from the V1 code.

---

## Angle 5 — Resist the temptation to ship V4 with V3

The V3 plan in the V1 commit was explicit: "Writers and callers land in V3; Resume CTA reads via `loadCheckpoint` in V4." The temptation while implementing V3 was real — once you've called `reconcileCheckpoint` and you have a fresh checkpoint in hand, rendering a "Resume" button is one JSX block away. It would have shaved an entire commit cycle and felt productive.

Two reasons to resist:

1. **V3 is verifiable in isolation.** The whole point of slicing is that each slice can be reviewed, tested, and reverted independently. Bundling V4 into V3 means the rubber-duck pass, the manual verification list, and the commit message all have to cover two distinct concerns. Reviewers (current me, future me, anyone else who looks) lose the ability to ask "does this slice do its one thing correctly?"

2. **V4 has design questions V3 doesn't.** Should Resume show "12 of 13 exercises remaining" or "1 of 13 completed"? Does it open the workout at the resumed index immediately, or show a confirmation? What happens if the user taps Start Workout instead — does the new run silently overwrite the fresh checkpoint, or does the UI surface a "you have a workout in progress" choice? Those are V4 questions. They have nothing to do with V3's plumbing. Mixing them in dilutes both.

The resumable state is stored (`setResumable` in `index.tsx`) but unread; the linter is fine with the discarded reader (`const [, setResumable]`). That's the V3 → V4 seam: V3 produces a value, V4 consumes it. Each side of the seam is reviewable on its own.

The general rule: when a slice plan separates plumbing from UI, the plumbing slice's deliverable is the value being produced, not the value being rendered. Producing-but-not-rendering looks like dead code at the line level; it's actually a contract waiting for its second party.

---

## Patterns

- **Pass post-transition values explicitly into helpers called from state-setter blocks.** Refs sync via `useEffect` and lag by a render; reading them during the setter call sees stale data.
- **Every explicit terminal user action must clear its checkpoint.** Save, discard, skip — all are explicit decisions. The reconciler exists for the implicit case (crash, evict, close), and any explicit path that doesn't clear is a resurrection vector.
- **RunId-scoped destructive operations replace explicit `if (test)` guards.** When the token already exists, threading it through the helper is cheaper than asking every caller to remember the test-mode check.
- **Document field semantics when a future slice will read them.** A docstring now eliminates a decision later. The cost is small; the scope reduction is concrete.
- **Plumbing slices produce values; UI slices consume them.** Resist bundling the consumer into the plumbing commit. The verifiability of each slice is the asset.
- **Rubber-duck the plan before implementing, not after.** The Skip-resurrection bug was caught at the plan stage in 30 seconds. Catching it after implementation would have meant code, lint, build, and re-review work to undo.

---

## Antipatterns

- **Reading `*Ref.current` inside or right after a `setState` call.** The ref reflects the prior render, not the one being scheduled. Any computation that depends on the new value has to take it as an argument or live in a downstream effect.
- **Trusting reconciliation to do the right thing without participation from terminal paths.** The reconciler can't tell "user explicitly skipped" from "process died." If terminal paths don't clear, reconciliation will misclassify them.
- **Test-mode guards as ad-hoc `if (test) return` at every caller.** Easy to forget one. RunId-scoping inside the helper makes the guard automatic; only the test-mode-aware writes need explicit handling (and those live in the helper).
- **Shipping plumbing and UI in the same commit.** Two unrelated review surfaces, two different sets of design questions, one diff. Either could regress the other invisibly.
- **Leaving field semantics implicit because "the current code doesn't read it differently."** Future code will, and the future author will re-derive the meaning from the call sites. Documenting now is the cheap version of that derivation.

---

## Open questions

- **Should there be a `pagehide` listener that writes one final checkpoint?** Transition-only writes mean a user who closes the tab mid-rest loses up to ~40 seconds of `elapsedActiveSeconds` accuracy on the eventual partial. A `pagehide` write would fix that, but introduces a sequencing concern: if the manual-save paths have already called `clearCheckpoint` before the navigation triggers `pagehide`, the pagehide write would resurrect the checkpoint and undo the clear. Solvable with a `clearedRef` flag, but adds surface area. Deferred until duration inaccuracy is actually visible.
- **Should V4's Resume CTA suppress itself when `completedExercises === 0`?** V3 writes the first checkpoint at ready→work with `completedExercises: 0`. If the user dies right there and reopens within 10 minutes, the reconciler returns `kind: 'fresh'` and V4 will see a checkpoint to resume — but resuming a workout with zero completed exercises is identical to starting a new one. The cleanest fix is in V4 (a `cp.completedExercises >= 1` check before rendering the CTA). Noted in the V3 commit message for the V4 implementer.
- **Should `isRoutineValid` check existence rather than non-lockedness?** Currently it excludes locked routines, on the theory that a user shouldn't be able to resume a routine they can't start. But a routine that becomes locked between start and resume is a legitimate case for "credit the partial; don't offer resume." Existence-only might be the right semantic. Not blocking V4; worth revisiting if locked-routine policy ever changes.

---

## TL;DR

- V3 wires up V1's checkpoint helpers across `advancePhase` (write on every transition), the three quit/save paths (clear with `runId`), the DoneScreen Skip path (newly clears so the reconciler doesn't resurrect skipped completions), and home mount (reconcile before loading sessions; stash any `fresh` result for V4).
- The rubber-duck pass caught one blocking bug — DoneScreen's `<Link>`-based Skip would have triggered completed-pending reconciliation — and surfaced two design refinements that became part of the slice: explicit-decline paths must clear, and `exerciseIndex` semantics deserve documentation now to remove decisions from V4.
- React state setters are async; refs synced via `useEffect` lag by a render; helpers called from inside a setter block must take post-transition values as arguments. This is a small invariant but durable.
- Resist bundling V4's Resume CTA into V3. Plumbing slices produce values; UI slices consume them. The fresh-checkpoint state is stored but unread in V3 — that's the seam.

— Goodfellow
