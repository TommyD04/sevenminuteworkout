# Lessons from Resuming Mid-Workout

**Date:** 2026-06-04
**Case:** V4 of the "save partial workouts on quit" arc. V3 left a `fresh`-state checkpoint reachable on home mount but rendered nothing for it. V4 turns it into a Resume / Start over / Discard cluster, navigates `/workout?resume=true` into the workout state machine at the persisted index, and rehydrates timer state from the checkpoint. The rubber-duck pass caught a load-bearing invariant — "ready only ever happens at index 0" — that was implicit in four call sites and would have made Resume silently restart from exercise 1 while overwriting the checkpoint as `completedExercises: 0`.

---

## The case in three sentences

V3 produced a value (`fresh` checkpoint state on home mount) and rendered nothing; V4's job was to consume it. The straightforward read — "render a Resume button, pass `resume=true`, branch on it inside the workout component" — looked complete until the rubber-duck pointed out that `workout.tsx` had `EXERCISES[0]` and `index: 0` baked into four sites, all of them correct under the old invariant that the `"ready"` phase only ever ran for exercise 1. The actual implementation is mostly a refactor of `workout.tsx` (split into a thin `WorkoutPage` that computes a one-time `initial` snapshot and a `WorkoutBody` that derives state, refs, and the initial audio cue from that one snapshot) with a small UI addition on `index.tsx` (the three-button cluster plus click-time freshness revalidation); the design lessons cluster around invariants becoming visible when a feature crosses them, snapshot-based seeding, and clearing-before-navigating to defuse self-resurrection.

---

## Angle 1 — Invariants that were never load-bearing become load-bearing the moment a feature crosses them

`workout.tsx` had been written for a world where the `"ready"` phase only ever ran at the start of a workout. Four sites encoded that assumption:

```tsx
// Initial audio cue
speak(`Get ready. ${EXERCISES[0].name} in ${tempo.ready}.`);

// completedExercisesFor — "ready" means "nothing's been completed yet"
if (p === "ready") return 0;

// advancePhase ready branch — about to start exercise 1
setIndex(0);
writeCheckpoint({ phase: "ready", index: 0 });
```

Every one of those was correct. Under the old invariant — `ready` always means `index === 0` — there was no daylight between "the literal `0`" and "the current `index`," so writing `0` was simpler and just as right. None of those call sites was wrong in isolation; the assumption that tied them together was never expressed in a single place.

V4's Resume CTA breaks that invariant. A resumed run lands in `ready` at index 4 (or wherever the user quit). Under the old code, Resume would have:

- spoken "Get ready. Jumping Jacks" while the timer ring showed exercise 5 of 13;
- written a checkpoint with `completedExercises: 0`, undoing the persisted progress on the very first phase transition; and
- when the user reached the first work phase, started over from exercise 1.

The cost of finding this with the rubber-duck before implementing was 30 seconds. The cost of finding it after would have been a full implementation, a manual test, a chain of "wait, the audio is wrong" / "wait, why is the index 0" debugging, and a second pass on `completedExercisesFor` to figure out why the partial-save count had collapsed.

The general lesson: when a feature lifts an invariant the rest of the code was quietly relying on, the work isn't "change the new feature to fit the invariant" — it's "find every site that was relying on the invariant and unbind it." A grep for `[0]` or `index: 0` is not subtle, but it's only obvious once you know what the invariant was.

The fix isn't just changing the four sites either. It's introducing an `initial` snapshot so the four sites all derive from a single source. That way, if a V5 ever introduces another reason for `ready` to happen at non-zero indexes, none of those four sites needs to be touched again.

---

## Angle 2 — One snapshot seeds state, refs, and the initial audio cue together

`useState` initializers and `useRef` initializers both run during the same render, but if you feed them from different sources they can drift. The pattern V4 settles on:

```tsx
function WorkoutPage() {
  const { test, routine, resume } = Route.useSearch();
  const [initial] = useState(() => computeInitialWorkoutState(resume, routine));
  if (initial.kind === "resume-failed") return <ResumeFailedRedirect />;
  return <WorkoutBody initial={initial} test={test} tempo={tempo} />;
}

function WorkoutBody({ initial, ... }) {
  const [runId] = useState(initial.runId);
  const [index, setIndex] = useState(initial.index);
  const [skippedCount, setSkippedCount] = useState(initial.skippedCount);
  const startTimeRef = useRef<number>(Date.now() - initial.elapsedActiveSeconds * 1000);
  const indexRef = useRef<number>(initial.index);
  const skippedExerciseIndexesRef = useRef<Set<number>>(
    new Set(Array.from({ length: initial.skippedCount }, (_, n) => -(n + 1))),
  );
  // ...
  useEffect(() => {
    speak(`Get ready. ${EXERCISES[initial.index].name} in ${tempo.ready}.`);
  }, [EXERCISES, tempo.ready, initial.index]);
}
```

`initial` is materialized exactly once (`useState(() => ...)` runs only on the first render). Every state initializer reads from it. Every ref initializer reads from it. The initial-audio-cue effect's dep array includes `initial.index`. The rAF loop, which reads from `indexRef` / `startTimeRef`, sees consistent values from frame 1.

The alternative — call `loadCheckpoint()` once for `useState`, again for `useRef`, again for the audio cue — looks innocuous but introduces three timing windows for storage to change between reads (multi-tab edits, a `clearCheckpoint` racing the mount, a different runId getting written by a stale closure). Three reads is three opportunities for inconsistency. One snapshot is zero.

This is also why `WorkoutPage` is split from `WorkoutBody`. Computing `initial` inside `WorkoutBody`'s `useState` initializer would make it impossible to handle the `resume-failed` case without conditionally calling hooks. Lifting the computation up one level and branching there (`if (initial.kind === "resume-failed") return <ResumeFailedRedirect />`) keeps `WorkoutBody`'s hook list stable, lets the redirect be a tiny `useEffect(() => navigate({to:"/"}), [navigate]); return null;` component, and gives `WorkoutBody` a non-nullable `initial` typed via `Extract<InitialWorkoutState, { kind: "fresh" | "resume" }>` so TypeScript narrows away the failure case at compile time.

---

## Angle 3 — Back-date the reference point instead of teaching consumers about an offset

The persisted checkpoint stores `elapsedActiveSeconds`: the sum of work / rest / ready time, excluding pauses and the quit dialog. The workout state machine tracks elapsed time as:

```tsx
elapsedActiveSeconds =
  (Date.now() - startTimeRef.current - pauseOffsetRef.current - dialogPauseAdjustment) / 1000;
```

To restore `elapsedActiveSeconds = 180` on Resume, there are two options:

1. **Teach every consumer about a saved offset.** Add a `savedOffsetSeconds` ref; every site that computes elapsed time adds `savedOffsetSeconds * 1000` to the result. Same answer; touches every consumer.
2. **Back-date the reference point.** Set `startTimeRef.current = Date.now() - savedElapsed * 1000` at construction. Every consumer's existing math just works.

V4 takes option 2 (`useRef<number>(Date.now() - initial.elapsedActiveSeconds * 1000)`). One line, no consumer changes, and any future code that reads `startTimeRef` to compute elapsed time picks up the restore automatically.

The general rule: when restoring derived state, prefer adjusting the inputs the derivation already uses over inserting a new term into the derivation. The first preserves the call graph; the second multiplies it.

There's a related case in `skippedExerciseIndexesRef`. The checkpoint stores only a count (`skippedCount`), not which exercises were skipped — a deliberate V1 schema choice to avoid bloating the row. On Resume, the only consumer of the ref is `.size` (used in the difficulty-rating screen and the partial-save math). The reconstruction:

```tsx
new Set(Array.from({ length: initial.skippedCount }, (_, n) => -(n + 1)));
```

Real exercise indexes are `0..N-1`. Negative indexes are guaranteed not to collide with future real skips. `.size` returns the right count. No consumer is touched; no schema is bloated.

This is the same shape as the timestamp back-dating: don't rebuild the data you didn't persist, rebuild just enough to satisfy the invariants the data was serving.

---

## Angle 4 — Stale CTAs revalidate at click time

The home page reconciles on mount: if there's a fresh checkpoint, it's stashed in state and rendered as a Resume CTA. A user who opens the home page, gets distracted by a phone call, and comes back 30 minutes later is now looking at a CTA backed by a 30-minute-old checkpoint — past the freshness window. The mount-time reconciliation can't help; it ran when the checkpoint was still fresh.

V4 handles this by re-asking the reconciler at click time:

```tsx
function onResume() {
  if (!resumable) return;
  const result = reconcileCheckpoint({
    isRoutineValid: (id) => ROUTINES.some((r) => r.id === id && !r.locked),
  });
  if (result.kind === "fresh") {
    unlockAudio();
    navigate({
      to: "/workout",
      search: { test: false, routine: result.checkpoint.routineId, resume: true },
    });
    return;
  }
  setSessions(loadSessions());
  setResumable(null);
}
```

If the checkpoint is still fresh, navigate. If the reconciler has flipped it to a partial in the meantime (which it does, as a side effect of the same call), drop the CTA and re-pull sessions so today's count / streak reflects the newly written partial.

This pattern works because `reconcileCheckpoint` is idempotent and is the single source of truth for freshness. The home page doesn't need its own copy of the freshness window; it just defers to the function that already encodes it. No new exports, no constants to keep in sync, no two-sources-of-truth bug.

The narrower lesson: CTAs that depend on time-sensitive state should not assume mount-time validation is still current at click time. Either re-check, or shorten the window between mount and click so far that staleness is impossible (a modal, an auto-dismiss). For a passive home-screen CTA, re-checking is the right shape — the cost is one localStorage read.

---

## Angle 5 — Clear before you navigate when the next screen might not write a checkpoint immediately

Start over is destructive: the user explicitly says "drop this in-progress run and start fresh." The naive implementation:

```tsx
function onStartOver() {
  navigate({ to: "/workout", search: { test: false, routine: resumable.routineId } });
}
```

The new `/workout` mount calls `computeInitialWorkoutState`, which returns `kind: "fresh"` because the search params don't include `resume=true`. Fine. The workout state machine starts. The first `saveCheckpoint` write happens at the `ready → work` transition — call it +6 seconds after mount.

Between mount and that first checkpoint write, the old checkpoint is still in localStorage. If the user closes the tab in that 6-second window (a misclicked notification, a swipe-up gesture, anything), the next home mount runs the reconciler, finds the old (still-fresh) checkpoint, and writes it as a partial. The user explicitly chose "start over" and the reconciler silently undid that decision.

V4 clears before navigating:

```tsx
function onStartOver() {
  clearCheckpoint({ runId: resumable.runId });
  const routineId = resumable.routineId;
  setResumable(null);
  unlockAudio();
  navigate({ to: "/workout", search: { test: false, routine: routineId } });
}
```

This is a sharper version of the V3 lesson ("every explicit terminal action must clear its checkpoint"). V3's terminal actions clear synchronously, then nothing else writes. V4's Start over clears synchronously, then a writer mounts that might not write for several seconds. The order of clear / navigate matters specifically when the navigation transitions into a writer with a delay.

The runId scope (`clearCheckpoint({ runId: resumable.runId })`) is still load-bearing: if a second tab raced in and replaced the checkpoint with a different run in the millisecond between read and clear, the runId mismatch makes the clear a no-op rather than blowing away the new run.

---

## Patterns

- **Materialize one snapshot for state, refs, and initial side-effects.** `useState(() => compute(...))` runs once per mount and gives every downstream initializer a stable source. Three separate reads is three opportunities for drift; one snapshot is zero.
- **Back-date reference points instead of teaching consumers about offsets.** Restoring a derived value by adjusting its inputs preserves the existing call graph. Inserting a new term into the derivation multiplies it.
- **Reconstruct invariants, not data, when persistence is lossy.** `skippedExerciseIndexesRef` is rebuilt with dummy negative indexes because the only consumer reads `.size`. Don't bloat the schema to round-trip data you didn't end up needing.
- **Revalidate time-sensitive CTAs at click time by re-calling the same validator the mount used.** Reuses the freshness logic; no new constants to keep in sync.
- **Clear destructive intent _before_ navigating to a screen that might not write for several seconds.** The reconciler can't tell "user closed the tab during the new run's warmup" from "user crashed mid-set." Pre-clearing closes that resurrection window.
- **Push special cases to the boundary.** 0-completed checkpoints are eagerly cleared at the home mount instead of being threaded through the UI as a "Resume but only sometimes" case. The rest of the code stays uniform.
- **Discriminated unions force conditional rendering up the tree.** `resume-failed` lives as its own branch on `InitialWorkoutState`, which forces `WorkoutPage` to branch before mounting `WorkoutBody`. That keeps `WorkoutBody`'s hook list stable and lets TypeScript narrow `initial` to the non-failure cases.

---

## Antipatterns

- **Trusting that an invariant nothing has ever crossed is documented.** Four sites in `workout.tsx` all encoded "ready always means index 0." Each looked locally correct. The first feature that broke the invariant — Resume — would have broken silently in three different ways simultaneously if the rubber-duck pass hadn't pulled the thread.
- **Re-reading the same persistent source for each initializer.** `loadCheckpoint()` called three times during mount is three timing windows for inconsistency. One snapshot, three readers.
- **Mount-time validation taken as click-time validation.** A 30-minute-old CTA backed by a 30-minute-old mount-time read is a Resume that bypasses freshness if the user lingered.
- **Navigate-then-clear on destructive actions.** Any gap between the navigation and the next screen's first persistent write is a window where the reconciler can resurrect the thing you just told the user was gone.
- **Conditional hooks instead of conditional render.** If `WorkoutPage` had tried to `useEffect(navigate, [])` inside an `if` branch, rules-of-hooks would have broken. `ResumeFailedRedirect` is a four-line component because it has to be — and that's fine.
- **Reconstructing data the schema didn't persist by widening the schema.** If V4 had needed faithful skip-set restoration, the right answer would still not be to add `skippedExerciseIndexes: number[]` to the checkpoint — it would be to ask whether anything other than `.size` actually needs the set. The schema reflects what the consumers need; widen it only when the consumers do.

---

## Open questions

- **Should Discard surface an undo affordance?** V4 ships with a no-confirmation Discard button on the theory that the destructive style + verb already telegraph the consequence and the alternative (a confirmation dialog) is more friction than the action warrants. A toast with a 5-second undo would be a middle ground that costs another piece of state and a `setTimeout`. Defer until a user reports an accidental tap.
- **Should Resume after a long pause surface a "Workout saved as partial" toast when the click-time reconciler returns non-fresh?** Currently, the CTA silently disappears and today's count / streak update. The user might wonder where their Resume button went. The smallest version is a transient banner; the larger version is a redesign that distinguishes "fresh" from "credited as partial" from "discarded" outcomes. Not blocking; worth revisiting if anyone says "I tapped Resume and nothing happened."
- **Should the freshness window be exposed as a config rather than a constant?** V4's click-time revalidation depends on `reconcileCheckpoint` keeping the freshness threshold consistent across mount and click — which is automatic today because there's only one constant. If freshness ever becomes user-configurable (e.g., a "remember my workout for up to N minutes" setting), the call sites are already correct; only the constant moves.

---

## TL;DR

- V4 surfaces V3's `fresh` checkpoint as a Resume CTA on the home screen and lifts the implicit "ready only happens at index 0" invariant out of `workout.tsx` — both happen in one slice because the second is a prerequisite for the first.
- A rubber-duck pass on the plan caught the index-0 hardcoding (audio cue, `completedExercisesFor`, two `advancePhase` lines) before implementation; the fix is the `initial`-snapshot pattern, where state initializers, ref initializers, and the initial audio cue all derive from one materialized value computed exactly once.
- Restoration tricks worth keeping: back-date `startTimeRef` so existing elapsed-time math just works, and reseed `skippedExerciseIndexesRef` with dummy negative indexes to satisfy `.size` without round-tripping the full set.
- The two destructive paths bracket the lesson: Resume revalidates at click time (mount-time freshness is stale by the time the user taps), and Start over clears before navigating (the new run's first checkpoint write is several seconds out and the reconciler would otherwise resurrect the old run on a tab close in that gap).

— Goodfellow
