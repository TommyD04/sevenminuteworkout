# Lessons from Landing a Schema Before Its Callers

**Date:** 2026-05-25
**Case:** V1 of the "save partial workouts on quit" arc. The slice ships a `Checkpoint` type, four helpers (`loadCheckpoint`, `saveCheckpoint`, `clearCheckpoint`, `reconcileCheckpoint`), an `isCompletedSession` predicate, an `id`-based idempotency on `saveSession`, and history UI for partial rows — with zero new callers. Nothing changes for users; the only way to produce a partial row is to inject one via DevTools. The interesting question is _why_ that's a useful shape for a slice.

---

## The case in three sentences

The partial-save arc is going to touch six things at once — schema, reconciliation, write paths, clear paths, history rendering, and a future Resume CTA — and shipping all of that in a single commit would make every review comment and every regression a search through ~600 lines of diff for the part that mattered. V1 carves off the parts that are pure contract: the data shape and the helpers that operate on it, plus the read-side changes that need to be back-compat-safe whether or not anyone ever writes a partial row. The result is a commit that's testable by manual DevTools injection, has obvious failure modes that don't affect any real user, and turns V3 into a pure wiring change with a fully understood target.

---

## Angle 1 — A schema commit is a contract commit

The most expensive thing about adding a new field to a persisted record is not the field itself — it's all the read sites that have to know what to do when the field is missing, present-but-null, or present-and-meaningful. V1 forces those decisions early, in isolation, without the distraction of where the data is going to come from.

Concretely, V1 had to answer:

- **What does a missing `status` mean?** Answer: `completed`. Every old session pre-dating this arc is implicitly `status: "completed"`, and the `isCompletedSession` predicate (`s.status !== "partial"`) encodes that as the explicit invariant.
- **What does `difficulty: null` mean for the average-difficulty stat on the history page?** Answer: exclude it. A partial workout without a rating shouldn't drag the average toward zero. The stat now filters to rated sessions only.
- **What does a partial row look like in the history list?** Answer: a `Partial · 4/13` badge, with `(K skipped)` when relevant, and an em-dash in the difficulty column. The CSV export gains new columns and learns to escape null as the empty string.
- **What do today / streak / last-7 do with partial rows?** Answer: ignore them entirely. The metrics filter through `isCompletedSession` upstream of every reduce.

Every one of those questions had to be answered _before_ a partial row existed, because the next user who pulls main and runs `bun run dev` would see partial rows immediately if V2's quit path landed without V1's history changes. Schema-first means read-site-first.

---

## Angle 2 — Idempotency by composite key, not by random UUID

`saveSession` historically appended every new session as a fresh row, keyed by a UUID generated at save time. That's fine when the only writer is the DoneScreen and writes are once-per-finished-workout. It breaks the moment two writers can produce a record for the same conceptual event:

1. The user taps "Save partial" via the X-button (V2's quit path).
2. The user closes the tab without tapping save, reopens later, and reconciliation writes the same partial automatically (V3's home-mount path).

If both fire — say, the user taps Save, the app navigates, but on the next mount the checkpoint hasn't been cleared yet (a small race window or a different tab) — the naive append would create two history rows for the same run. The user would see "Partial 4/13" twice.

V1 fixes this by adding `sourceRunId?: string` to `Session` and teaching `saveSession` to replace-in-place when a session with the same `sourceRunId` already exists. New rows without a `sourceRunId` (the existing completed-workout flow) keep the old append behavior, so back-compat is preserved by default. The idempotency key is the in-progress workout's identity, not the persisted session's identity — those are two different things and conflating them is the bug.

The general rule: when two paths can write the same record, the dedup key has to be something that's identical across both paths. A UUID generated at write time fails this test by definition; a UUID generated at the start of the conceptual event — and carried through both paths — passes it.

---

## Angle 3 — Reconciliation is a state machine, not a function

The naive design for `reconcileCheckpoint` is "if there's a checkpoint, save it as a partial." That collapses four distinct cases into one and gets at least two of them wrong.

The four cases the actual reconciler distinguishes:

1. **Completed-pending** — `completedExercises >= totalExercises`. The user finished every exercise but closed the app before tapping Save on the DoneScreen. Write a `completed` session with `difficulty: null` and clear. This is _not_ a partial; the workout was finished, the rating was just never collected.
2. **Fresh + valid routine** — age < 10 minutes, routine still exists in the catalog. The user might be coming back to resume. Return the checkpoint for the caller (V4 will render a Resume CTA), don't write anything, don't clear.
3. **Stale or routine missing, above meaningful-progress threshold** — write a partial session and clear.
4. **Stale or routine missing, below threshold** — clear silently. A single ready→work transition with no completed exercise isn't worth a history row.

Encoding this as a tagged union return type (`none | fresh | reconciled-partial | reconciled-completed | discarded`) forces every caller to handle each case explicitly. The compiler will catch a V4 that forgets the `discarded` branch; an `if (checkpoint)` boolean check would silently misroute every case but one.

The options bag (`freshnessMs`, `thresholdExercises`, `isRoutineValid`, `now`) exists for testability, but also because each of these is a policy that V4 might want to override per-context. Hardcoding 10 minutes inside the reducer would have meant the tests are coupled to wall-clock time; passing `now` as a function turns reconciliation into a deterministic transform of inputs.

---

## Angle 4 — RunId scoping turns destructive operations into safe defaults

`clearCheckpoint({ runId })` looks up the existing checkpoint and refuses to clear if the persisted runId doesn't match. That sounds like over-engineering on a single-user PWA. It isn't.

The scenarios it solves are mundane and easy to write a bug into otherwise:

- **Test mode never writes a checkpoint.** If `?test=1` runs an end-of-workout flow and naively calls `clearCheckpoint()`, it would wipe a real workout the user had started in another tab. RunId-scoping makes the test-mode clear a guaranteed no-op without any explicit `if (test) return`.
- **The user starts run A, backgrounds the tab, starts run B in a second tab, comes back to tab A and quits.** Tab A's `confirmQuit` calls `clearCheckpoint({ runId: A })`; the persisted checkpoint is B's, the IDs don't match, the clear no-ops, B is preserved.
- **Stale event handlers.** A `setTimeout` from a prior render fires after the user has moved on. With runId-scoping, it can't damage the current run.

The general principle: when you have an in-flight token already (and runIds are that, for free — they're created at workout-start and live as long as the workout), thread it through every destructive operation. It costs one parameter and one if-check; it eliminates an entire class of "what if these two things race?" bugs without anyone having to reason about which race is actually possible.

---

## Angle 5 — Ship the read sites in the same slice as the schema

The temptation with V1 was to ship _only_ the storage helpers and the new type — the absolute minimum that V2 needed to compile. The history-page changes (the badge, the em-dash, the average-difficulty filter, the CSV columns) would have lived in a separate commit, possibly merged after V2.

That would have been a mistake. The window between "V1 ships, partial sessions can exist" and "history page knows about partial sessions" is a window where any developer running V2 against their own local history would see broken-looking rows — a missing badge, a `0` difficulty making the average meaningless, an export missing columns. The user-visible bug would be present for everyone on main during that gap.

The discipline: a schema change ships with every read site that touches the new shape, in the same commit. The schema change defines what's true; the read sites define what's visible. Splitting them creates a half-true period that's nobody's job to fix and everybody's job to discover.

The corollary: V1 had to be larger than the minimum-compile slice because the read sites are part of the contract. The +343 / -52 line count is what schema-first costs, and it's paid once.

---

## Patterns

- **Schema-first slices are read-site-first slices.** A new field's meaning is defined by what every reader does when it's present, missing, or null. Decide that before there's a writer.
- **Idempotency keys are about identity at the event level.** `sourceRunId` is the identity of the in-progress workout, not the identity of the persisted row. They're not the same thing.
- **Encode reconciliation outcomes as a tagged union.** Compilers catch missed cases; booleans hide them.
- **RunId-scope every destructive operation.** When a token already exists for free, threading it through eliminates a class of race-condition bugs cheaply.
- **Ship the contract and its readers together.** A half-applied schema is a guaranteed bug window. The cost of a bigger commit is paid once; the cost of a half-true period is paid by everyone who works on the repo until it's fixed.

---

## Antipatterns

- **"Storage layer + UI in a later commit."** This is the half-true-period bug. Every reader of the new shape has to ship in the slice that defines the shape.
- **Append-only `saveSession` with a save-time UUID.** Fine until two paths can write the same record. The next bug is a duplicate history row that nobody can explain.
- **`if (checkpoint) saveAsPartial(checkpoint)`.** Collapses four cases into one, gets at least two wrong (completed-pending becomes a partial; fresh checkpoints are silently destroyed before V4 can resume them).
- **Hardcoded freshness threshold inside the reducer.** Couples tests to wall-clock time and prevents per-context policy overrides.
- **Test-mode guards as ad-hoc `if` checks in every caller.** RunId-scoping pushes the safety into the helper itself; callers don't have to remember.

---

## Open questions

- **Should the freshness window be 10 minutes, or longer?** A user who starts a workout, gets pulled into a 20-minute conversation, comes back to the gym, would currently see their checkpoint reconciled to a partial instead of resumable. Plausible; 10 minutes was a round number. Worth instrumenting if anyone reports the friction.
- **Is `isRoutineValid` the right hook, or should it be `getRoutineMetadata`?** Today it returns a boolean. If V4 wants to show "your in-progress _Advanced_ workout" but the routine has been removed from the catalog, the checkpoint already carries `routineName` so the reconciliation result has enough info. But future routine renames (id stable, name changed) would benefit from a callback that returns fresh metadata instead of just yes/no.
- **Should `sourceRunId` ever be visible to the user?** Currently it's an opaque idempotency key. If the history page ever grows a "details" view, surfacing "Run started at 2:14 PM, quit at 2:19 PM" would require the checkpoint to have preserved `startedAt`, which it does. Worth keeping in mind for V5 or whatever follows.

---

## TL;DR

- V1 ships the contract — `Checkpoint`, `Session.status`, `isCompletedSession`, `sourceRunId`-keyed idempotency on `saveSession`, four checkpoint helpers, a tagged-union reconciler, and every history-page change that depends on the new shape — with no callers for the helpers yet.
- The interesting design choices are the ones that make V2 and V3 cheap: idempotency keyed on in-progress identity, reconciliation as a typed state machine, runId-scoped destructive operations.
- The slice is intentionally bigger than the minimum that compiles, because the read sites are part of the contract. Shipping the contract without its readers creates a half-true period that's nobody's job to fix.
- Generalizable rules: a new persisted field's meaning is defined by every read site; idempotency keys come from event identity, not row identity; outcome unions beat boolean reductions; in-flight tokens make destructive defaults safe.

— Goodfellow
