# Lessons from the First Caller of a New Schema

**Date:** 2026-05-25
**Case:** V2 of the "save partial workouts on quit" arc — the user-facing slice that lights up the V1 schema. The X-button quit dialog grows a third action: "Save partial" (when there's something to save). The completed-workout save path is also retrofitted to use `elapsedActiveSeconds` so paused/dialog time isn't double-counted in either flow. About 80 lines in one file, but the design pressure came from elsewhere.

---

## The case in three sentences

V1 had carefully crafted a contract for partial workouts — schema, idempotency, history rendering, reconciliation — but the only path to a partial row in history was a manual DevTools injection. V2 wires up the first real caller: the quit dialog now offers "Save partial" alongside "Keep going" and "Discard workout," and that single new action exercises essentially every guarantee V1 made (back-compat, idempotency, test-mode isolation, active-duration accounting). The work landed in 80 lines because V1 had done the hard part; the lesson is what V2 _didn't_ have to do.

---

## Angle 1 — A first caller is the validation that the schema's right

It's easy to invent a clean-looking schema in isolation. The proof that the schema was actually the right shape is that the first real caller can use it without changing anything. V2 added `status: "partial"`, `completedExercises`, `totalExercises`, `skippedCount`, `sourceRunId` — every field V1 introduced — and didn't have to re-open V1's design. The optional fields were optional because they had to be (back-compat); the values that V2 wanted to write were exactly the ones V1 had typed for.

If V2 had needed to reach back and add `quitReason: "user" | "background"` to the schema, that would have been a signal that V1's design was incomplete — that the contract was inferred from the storage shape rather than from the use cases. The fact that it didn't is the evidence that V1's "schema-first means read-site-first" discipline (see the V1 lessons doc) actually worked.

The general principle: when a feature is sliced contract-then-caller, the second slice's diff size is the verdict on the first slice's design. A small caller diff means the contract was the right shape; a large one means the contract leaked decisions that should have been the caller's, or vice versa.

---

## Angle 2 — Three actions instead of two changes the question being asked

The pre-V2 quit dialog had two buttons: "Keep going" (cancel) and "Quit workout" (destructive). The user's mental model of the decision: _do I keep going or do I bail?_

The post-V2 dialog has three: "Keep going," "Save partial," and "Discard workout" (the destructive variant now has a more specific verb). The user's mental model is now: _what do I want to happen to the work I've already done?_ Bail-or-stay is a continuation decision. Save-or-discard is an outcome decision, and the new third option makes the outcome explicit.

The framing change matters because the original two-button dialog was implicitly asking the user to abandon their work without saying so. A user who tapped X mid-workout and saw "Quit workout?" had no language for "I want to stop but I also want credit for what I did." They'd either hit cancel reluctantly or hit quit resentfully. The third button names the option that was previously invisible.

The contextual conditional — "Save partial" only renders when `partialExercises > 0`, and "Discard workout" reverts to "Quit workout" when there's nothing to discard — keeps the dialog honest. A user who hits X during the 5-second ready countdown sees the original two-button dialog, because there's literally nothing to save. The UI doesn't lie about the options.

A subtler design choice: the destructive verb shifted from "Quit" to "Discard" specifically when there's progress to discard. That's not synonyms — "quit" describes the navigation event, "discard" describes the data event. When the data event is the load-bearing decision, the button needs to name the data event.

---

## Angle 3 — Retrofit the completed path while you're touching the math

V2's primary work is the quit dialog, but the commit also moves the _completed_ workout's `durationSeconds` computation onto `elapsedActiveSeconds()`. Before this change, the completed save read its duration from a value snapshotted at work→done, which didn't account for time spent on the DoneScreen rating the workout. The partial path was using `elapsedActiveSeconds()` (which excludes paused intervals and the quit-dialog modal time); the completed path used a different number.

Two paths computing "duration" two different ways is a bug-in-waiting even if nobody's reported it. The fix is small — read from the same helper in both places — but the time to make it is when you're already in the file thinking about active-duration accounting. Six months from now the completed path's snapshot logic looks load-bearing and nobody will remember why it was different.

The general pattern: when a new path forces you to reason about a piece of math, audit the existing paths that use related math. The new caller is the cheapest opportunity to harmonize. The second-cheapest is "after someone files a bug"; that's much later and much more expensive.

A small caveat: harmonizing in the same commit means the diff carries two stories — "the new partial save" and "a small correctness fix for the existing completed save." The commit message has to acknowledge both. The alternative — two commits, one before the other — is sometimes worth it, but here the second is so tightly coupled to the first (same file, same imports, same conceptual decision about what "duration" means) that splitting would have made both reviews worse.

---

## Angle 4 — Test mode is a constraint pushed down into the affordance

V2 doesn't introduce a new test-mode check; it inherits the one V1 baked in. `saveCheckpoint` is a no-op when `test` is true. `clearCheckpoint({ runId })` no-ops because test runs never write a checkpoint with that runId. `saveSession` doesn't have a built-in test-mode guard, but V2's `savePartialAndQuit` does its own `if (test) { confirmQuit(); return; }` at the top — the only test-mode code V2 adds.

That asymmetry is intentional and worth understanding. The helpers in the storage layer enforce test-mode safety where they can (saveCheckpoint, clearCheckpoint via runId), but `saveSession` is shared with the completed-workout path that already has its own test handling. Pushing the test check into `saveSession` would mean changing a function that's been correct for months and that gets called from places that don't have a `test` flag in scope. The route-level guard in `savePartialAndQuit` is cheaper and more local.

The principle: test-mode safety should live as close to the boundary between "decision to write" and "write" as possible. Sometimes that's inside the helper (when the helper is the only path); sometimes it's in the caller (when the helper has many paths with different policies). The wrong place is "scattered across every caller without any helper-level enforcement" — that's where one missed check ships test-mode pollution to a user's real history.

---

## Angle 5 — The "nothing to save" branch is the easy case to mishandle

The most-likely-to-go-wrong path in V2 is the one where the user opens the quit dialog before completing any exercise. The expected behavior: the dialog should not offer "Save partial" (there's nothing to save), the destructive button should read "Quit workout" (because nothing's being discarded), and the description should say so plainly. If `Save partial` is tapped anyway via some race condition, it should silently behave like Quit.

V2 handles this in three places: the dialog conditionally renders the "Save partial" button, the description text branches on `canSavePartial`, and `savePartialAndQuit` itself guards with `if (completedExercises < 1) { confirmQuit(); return; }` as a final safety net. Three layers of defense for a path that probably can't be reached given the UI conditional, but the third layer is what guarantees the property even if a future refactor disconnects the first two.

The general rule: when a UI conditional controls whether a destructive-adjacent action is reachable, mirror the conditional in the handler. The UI is the user-experience guard; the handler is the data guard. If they ever drift — and they will, eventually, in any project with more than one contributor — the handler keeps the data correct while the UI is being fixed.

This is a slightly stricter version of "validate at the boundary." The boundary here isn't HTTP or a database; it's "the operation that mutates persistent storage." Any path that reaches it must satisfy the precondition, even if every UI route to that path already satisfied it.

---

## Patterns

- **A small first-caller diff is the verdict on the schema's design.** V2 wrote every field V1 defined, without adding new ones. That's the evidence that V1's schema-first work was the right shape.
- **Name the data event, not the navigation event, in destructive buttons.** "Discard workout" tells the user what's about to happen to their data; "Quit workout" tells them what's about to happen to their screen. The first matters more when there's data at stake.
- **Three options frame a different question than two.** Save vs. discard is an outcome decision; cancel vs. quit is a continuation decision. Choosing the right framing depends on what's actually at stake.
- **Audit related math when a new caller forces you into the file.** Harmonizing duration accounting across save paths in V2 is cheaper than the eventual bug report. Don't leave inconsistencies in place because they're "pre-existing."
- **Test-mode safety lives at the decision-to-write boundary.** Sometimes in the helper, sometimes in the caller, depending on whether the helper has one policy or many. Never scattered across every caller without helper-level enforcement.
- **Mirror UI conditionals in the handler.** Three layers of defense for a path that probably can't be reached is the right shape when the handler is the data guard.

---

## Antipatterns

- **Calling the destructive button "Quit" when discard is the actual stakes.** "Quit" feels like a navigation verb; "Discard" feels like a data verb. The user reads one button label, not the full dialog. Make it the right verb.
- **Two paths with two different "duration" computations.** When one path was retrofitted but the other wasn't, the system has two sources of truth that will diverge under any non-trivial usage. Fix both at the same time.
- **`if (test) return` scattered across every caller without helper-level enforcement.** One missed check ships test-mode writes to a user's real history. Push the guard down where you can; keep the caller-level guard where you can't.
- **Trusting the UI conditional to keep the handler safe.** They will drift. The handler has to enforce the invariant regardless of what the UI is supposed to show.
- **A schema commit followed by "wire up callers" later as separate work.** This was the V1 doc's lesson too. V2 validates it: the only reason V2 is 80 lines is that V1 already paid the schema-design tax. Without V1's discipline, V2 would have been 300 lines and three architectural decisions deep.

---

## Open questions

- **Should "Save partial" pre-select itself when the user has completed most of the workout?** A user who quit at exercise 12 of 13 probably wanted to save. Auto-focusing the Save action would reduce taps but might create a confirm-by-accident risk. Worth instrumenting.
- **What's the right behavior on app crash mid-workout?** V2 only handles the explicit quit dialog. Crashes (process killed, OOM, etc.) are V3's territory via the on-mount reconciler. The split makes sense, but worth verifying it's clearly documented somewhere a future reader can find without grepping commit messages.
- **Is the dialog the right place for "Save partial," or should there be a separate save-and-keep-going action?** Some users might want to bank a partial as a checkpoint without exiting — for example, before a phone call. Not in scope today; the quit path is the only explicit-save path. The reconciler covers the implicit case.

---

## TL;DR

- V2 ships the first real caller of V1's schema: the quit dialog now offers "Save partial" when there's something to save, alongside the renamed "Discard workout" destructive action.
- The diff is small (~80 lines, one file) because V1 had already paid the schema-design tax. The smallness is the validation that the schema was the right shape.
- The slice also harmonizes `durationSeconds` accounting across the completed-save and partial-save paths — both now read from `elapsedActiveSeconds()` so paused/dialog time is excluded consistently.
- Generalizable rules: a destructive button names the data event, not the navigation event; three-action dialogs change the question being asked; test-mode safety lives at the decision-to-write boundary; UI conditionals don't replace handler-level guards.

— Goodfellow
