# Seven Minute Workout

A small, opinionated take on the [Scientific 7-Minute Workout](https://www.nytimes.com/2013/05/12/magazine/the-scientific-7-minute-workout.html). Three routines, a clean phone-first UI, local history. No accounts, no telemetry, no ads.

**Live:** https://sevenminuteworkout.lovable.app

---

## Learning in public

Last Sunday, I had some time to kill at a coffee shop while my wife was in a class across the street. My son had recently been encouraging me to start working out again — I'd paused and never restarted after an injury — and on a whim I checked the app store for an update to the "7-minute workout" app I had several phones ago. I hated everything I saw.

Sitting in that coffee shop, I vibe-coded a quick PWA from my iPhone using [Lovable](https://lovable.dev). I had strong opinions about the design and the user experience. My user experience. What would work for me, what wouldn't. What I needed and — reflecting on the app store — what very much wouldn't.

I picked it up again that night after Sam went to bed, and transitioned to a desktop so I could be more pointed on a few facts. As PM, I was pretty happy with the result. As a builder — even a baby builder — I wanted to do better.

I've started using this quick project as a chance to **go deeper** — learn the stack underneath, sharpen the rough edges, capture what I learn along the way. Everything — the audit, the bugs, the design decisions, the rough edges — lives in [`documentation/`](./documentation). Read along. Disagree with me. Open issues.

As of writing, I haven't quite gotten around to working out.

If you're here just to do a 7-minute workout: tap a routine and go. Want it on your home screen as an app? Use **Share → Add to Home Screen** on iPhone, or your browser menu → **Add to Home screen** on Android. It'll launch full-screen like a native app.

---

## The product

- **Three routines:** Core (the original Scientific 7), Classic, Advanced.
- **Standard 7-minute structure:** 12 exercises × 30s work / 10s rest.
- **No login.** History stays on your device (`localStorage`).
- **CSV export.** Your data, your problem.
- **Self-rated difficulty:** 1–5 after each session — eventually used to suggest the next routine.

---

## Getting started

This project uses [Bun](https://bun.sh) as the package manager and runtime.

```bash
# install dependencies
bun install

# run dev server (Vite under the hood)
bun run dev

# build for production
bun run build

# lint
bun run lint
```

That's it. The app runs at http://localhost:8080 by default.

### Why Bun?

Lovable scaffolded this with `npm` originally. I switched to Bun mid-project for three reasons:

1. **Speed.** `bun install` is meaningfully faster than `npm install` on a clean tree. On a small project it's a few seconds vs. a coffee — but the feedback loop matters.
2. **One tool.** Bun is package manager, script runner, and (optionally) runtime in one binary. Less stuff to keep in my head.
3. **Lockfile clarity.** `bun.lock` is the new text-based format; it's reviewable in a diff in a way `package-lock.json` mostly isn't.

What I'm still learning:

- When Bun's runtime diverges from Node (it mostly doesn't, but there are edges around `fs.watch`, native modules, and some Node-specific globals).
- How Bun's resolver handles peer deps differently from npm's, and when that matters.
- Whether `bun run dev` actually invokes Bun's runtime or shells out to Node-via-Vite (mostly the latter, in this project).

I'll add to this as I learn. If you have strong opinions about Bun in 2026, I want to hear them.

---

## Tech stack

| Layer          | Choice                                                                                | Why I picked it (or what I'm learning)                                                                                                                                             |
| -------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Framework**  | [TanStack Start](https://tanstack.com/start)                                          | Modern full-stack React with SSR. Lovable chose it; I'm sticking with it for the SSR learning.                                                                                     |
| **Router**     | [TanStack Router](https://tanstack.com/router)                                        | File-based routes under `src/routes/`. Type-safe. Loaders and `beforeLoad` are the SSR-aware primitives.                                                                           |
| **UI**         | React 19 + [shadcn/ui](https://ui.shadcn.com) + [Tailwind 4](https://tailwindcss.com) | Component primitives copied into the repo, styled with Tailwind. Easy to modify without fighting a library.                                                                        |
| **Icons**      | [Lucide React](https://lucide.dev)                                                    | These were also the source of [the SSR crash that taught me about serialization boundaries](./documentation/2026-05-12%20Lessons%20from%20the%20Routine%20Deep%20Link%20Crash.md). |
| **Build**      | [Vite 7](https://vitejs.dev)                                                          | Fast, well-supported, no opinions to fight.                                                                                                                                        |
| **Runtime/PM** | [Bun](https://bun.sh)                                                                 | See above.                                                                                                                                                                         |
| **Hosting**    | [Cloudflare Workers](https://workers.cloudflare.com) via Wrangler                     | Cheap, fast, edge-deployed. Configured in `wrangler.jsonc`.                                                                                                                        |
| **Storage**    | `localStorage`                                                                        | No backend. Everything's on-device.                                                                                                                                                |

---

## Learning log

Reverse-chronological. Each entry links to longer-form notes where they exist.

### 2026-06-06 — Patterns and antipatterns: a retrospective across the whole repo

Not a slice. A synthesis across the 14 lessons docs from the May 12 deep-link crash through the V6 multi-tab race — the cross-cut of things that kept showing up. Organised as patterns worth repeating (vertical slicing, schema-first contracts, tagged unions with `never`-default switches, runId-scoped destructive operations, one-snapshot-seeds-everything, acquire+revoke listener pairs, two-guard async effects, cache-lifetime-paired-to-its-invalidator, content-hashed identities, test instruments that isolate side effects, verification matrices chosen for branch coverage), antipatterns that bit us (SSR-serializing non-serializable values, native browser primitives in a phone-first PWA, inherit-and-don't-audit, copy that compensates for a wrong model, invariants nobody has ever crossed, UI conditionals without paired handler guards, hybrid toasts, refresh-in-place loops bypassing freshness guards, short-circuits placed after writing branches, asymmetric platform testing), and the meta-lessons that run underneath all of them (rubber-duck the plan not the implementation, subtraction over addition, documentation is forward-looking not retrospective, slices accumulate compound interest). The partial-save V1→V6 arc is treated as the worked example.

Full notes: [Patterns and Antipatterns — A Retrospective](./documentation/2026-06-06%20Patterns%20and%20Antipatterns%20-%20A%20Retrospective.md)

### 2026-06-04 — Closing the multi-tab race on Resume (V6 of partial-save)

V6 closes the pre-existing V4 bug V5's rubber-duck pass flagged: `onResume`'s click-time `reconcileCheckpoint()` wasn't scoped to `resumable.runId`, so a second tab writing a different checkpoint between Tab A's home mount and Tab A's Resume tap could either drop the user into the wrong workout (if Tab B's checkpoint was still fresh) or have Tab A write Tab B's run into history on Tab B's behalf (if Tab B's checkpoint had aged past threshold). V6 adds an optional `expectedRunId` to `ReconcileOptions` and a `stale-runid` arm to `ReconcileResult` that returns _before any writing branch_ on mismatch, scopes the three internal `clearCheckpoint()` calls inside `reconcileCheckpoint` to `cp.runId` to close the same race in miniature, and surfaces the new arm through `onResume`'s exhaustive switch with a "Workout no longer available" toast. V5's `never`-typed default caught the new arm as a compile error the moment the union grew — exactly the future-proofing it was designed to provide.

**Patterns I'm internalizing:**

- **The short-circuit goes before the writing branches, not after.** A non-mutating new arm has to return before any side-effect line in the function, or the caller is just being told about damage that's already done.
- **Audit refresh-in-place loops when adding a new arm to a side-effecting function.** A re-call after the new arm bypasses the guard you just added. V6's first plan included a `discoverResumable()` helper that would have re-introduced the bug via an unscoped re-entry; the rubber-duck pass correctly killed it.
- **Toast wording describes the local fact, not the inferred remote intent.** "Workout no longer available" is unconditionally true. "Resumed in another tab" assumes the other actor is the user, is resuming, and chose the same routine — none of which is knowable from this tab (think iOS BFCache wake-up).
- **Propagate scope arguments down the call stack.** When `reconcileCheckpoint` got an `expectedRunId`, the three internal `clearCheckpoint()` calls inside it needed `{ runId: cp.runId }` too. The guarantee leaks otherwise — the race the scope exists to prevent is still present inside the function's own implementation.
- **A `never`-default exhaustive switch is a forcing function for design conversations.** V5 paid three lines; V6 collected on them. The next slice that adds an arm to the union will get the same compile error at the wording site, asking "what do we say here?" at the moment it can be answered cheaply.
- **Verification matrix shape beats matrix size.** Four Tab-B-state cases that each exercise a different writing branch (fresh / stale-above-threshold / completed-pending / 0-completed-fresh) catch "guard placed too late" bugs that a single happy-path case would mask.

Full notes: [Lessons from Closing the Multi-Tab Race](./documentation/2026-06-04%20Lessons%20from%20Closing%20the%20Multi-Tab%20Race.md)

### 2026-06-04 — Resume-stale toast (V5 of partial-save)

V5 fills the UX gap V4 left open. V4's click-time revalidation on the Resume CTA was correct on data — no resuming into a stale checkpoint — but silent on outcome: the button disappeared, today's count / streak ticked up, and a partial row showed up in History without ever acknowledging the tap that caused them. From the user's seat, "I tapped Resume and nothing happened." V5 inserts a 2-second top-center toast scoped to exactly that branch, with branch-aware wording (`"Workout timed out — saved to history"` when the reconcile actually wrote a row, bare `"Workout timed out"` when it didn't), no action button (a toast is either a receipt or an undo, not a hybrid), and a shared toast `id` so a frustrated double-tap collapses into one notification. The other two convergent silent paths — Discard and passive mount-time stale — stay deliberately quiet because they don't share the "I tapped a button expecting navigation" expectation.

**Patterns I'm internalizing:**

- **Toast user actions only when the UI's response is the opposite of the expectation.** Discard's "nothing else happens" doesn't need a toast. Passive-stale's "user didn't act" doesn't either. Click-stale Resume's "I tapped, nothing happened" does.
- **A toast is either a receipt (no action) or an undo (action that reverses the cause).** Hybrid toasts that link to an unrelated affordance reintroduce the decision space the action was supposed to resolve.
- **Branch-aware wording costs a discriminated-union check and avoids a small lie.** A one-string toast would have claimed "saved to history" on `none` / `discarded` branches that wrote nothing. The user who later checks History and finds nothing now mistrusts every toast.
- **Exhaustive `switch` with a `never` default at the wording site.** A future arm on `ReconcileResult` surfaces as a TypeScript error at this exact line, forcing the author to think about wording. Without it, the new arm silently gets no toast or the wrong toast.
- **Shared toast `id` for any handler the user can re-tap within the toast's lifetime.** Sonner replaces same-id toasts instead of stacking; one notification per intent, not one per tap.
- **`mobileOffset` with a safe-area-inset calc on viewport-fit=cover PWAs.** Without `calc(env(safe-area-inset-top, 0px) + 12px)` the top-center toast clips under the iOS dynamic island and looks like a layout bug.

Full notes: [Lessons from the Resume-Stale Toast](./documentation/2026-06-04%20Lessons%20from%20the%20Resume-Stale%20Toast.md)

### 2026-06-04 — Resuming mid-workout (V4 of partial-save)

V4 turns V3's silent `fresh` checkpoint state into a Resume / Start over / Discard cluster on the home screen and lifts the implicit "ready only ever happens at index 0" invariant out of `workout.tsx`. The rubber-duck pass on the V4 plan caught four sites in `workout.tsx` that hardcoded `EXERCISES[0]` or `index: 0` — all correct under the old invariant, all wrong the moment a Resume hands the state machine a non-zero starting index. The fix is the `initial`-snapshot pattern: `WorkoutPage` computes a one-time snapshot (`useState(() => compute(...))`), branches on `resume-failed` (rendering a tiny redirect component so the conditional render doesn't conflict with rules-of-hooks), and passes the snapshot into `WorkoutBody`, which seeds every `useState`, every `useRef`, and the initial audio cue from the same source. The home screen pre-clears 0-completed checkpoints (functionally identical to Start over, so no CTA needed), revalidates Resume freshness at click time by re-calling `reconcileCheckpoint` (so a CTA that's been sitting on screen for 30 minutes doesn't bypass the freshness window), and clears the checkpoint _before_ navigating on Start over (so a tab close in the 6-second gap before the new run's first checkpoint write can't resurrect the old run as a partial).

**Patterns I'm internalizing:**

- **Invariants that nothing has ever crossed aren't documented; they're assumed.** Four sites in `workout.tsx` encoded "ready always means index 0" identically because under the old behaviour there was no daylight between "the literal `0`" and "the current `index`." The first feature that crossed the invariant — Resume — would have broken silently in three places at once. Find every site that was leaning on the invariant; don't just teach the new feature to fit it.
- **One snapshot seeds state, refs, and side-effects together.** `useState(() => compute(...))` materializes the truth once; three separate `loadCheckpoint()` reads is three opportunities for inconsistency.
- **Back-date the reference point instead of teaching consumers about an offset.** `startTimeRef = Date.now() - savedElapsed * 1000` lets every existing consumer of `startTimeRef` pick up the restored elapsed time without any consumer-side changes. Restoring derived state by adjusting its inputs preserves the call graph.
- **Reconstruct invariants, not data, when persistence is lossy.** The checkpoint stores a `skippedCount`, not the set. Rebuilding the ref with dummy negative indexes satisfies the only consumer (`.size`) without bloating the schema to round-trip data nobody reads.
- **Revalidate stale CTAs at click time by reusing the mount-time validator.** `reconcileCheckpoint` is idempotent and is the single source of truth for freshness; calling it again from `onResume` reuses the logic with no new constants to keep in sync.
- **Clear before you navigate when the destination might not write for several seconds.** V3's terminal actions clear synchronously and nothing else writes; V4's Start over clears synchronously and a writer mounts that doesn't checkpoint until the first phase transition. The order matters specifically when the navigation transitions into a delayed writer.

Full notes: [Lessons from Resuming Mid-Workout](./documentation/2026-06-04%20Lessons%20from%20Resuming%20Mid-Workout.md)

### 2026-06-03 — Wiring the checkpoint plumbing (V3 of partial-save)

V1's checkpoint helpers (which had sat unused since they shipped) finally got their callers: `saveCheckpoint` writes on every phase transition in `advancePhase`, `clearCheckpoint({runId})` fires on every terminal path (Save, Discard, Skip, DoneScreen Save, DoneScreen Skip), and `reconcileCheckpoint` runs on home mount _before_ `loadSessions()` so any reconciled row is in the metrics. A rubber-duck pass on the plan caught a bug where DoneScreen's bare `<Link to="/">Skip</Link>` would have let the reconciler resurrect the just-skipped completed run as a difficulty-null history row — fixed by converting Skip to a button that clears the checkpoint first. V4's Resume CTA reads the `fresh` checkpoint state that V3 now produces; no plumbing changes needed on top.

**Patterns I'm internalizing:**

- **Refs lag the state setters that just changed.** A `useEffect` that syncs `ref.current = state` runs _after_ the render that consumed the new state, which is _after_ the synchronous block that called `setState`. Helpers called from inside `advancePhase` had to take post-transition `phase`/`index` as explicit arguments because the refs hadn't caught up yet.
- **Every explicit terminal user action must clear its checkpoint.** Save, Discard, Skip — all are decisions the user made. The reconciler is for the _implicit_ case (process death, tab close). If an explicit path doesn't clear, reconciliation will reverse the user's decision on the next mount.
- **RunId-scoped destructive operations replace explicit `if (test)` guards.** Test runs never write a checkpoint with `testRunId`, so `clearCheckpoint({runId: testRunId})` is automatically a no-op against any real checkpoint. The token does the work that a scattered `if (test) return` would have.
- **Document field semantics when a future slice will read them.** Adding a docstring to `Checkpoint.exerciseIndex` ("next exercise to perform on resume") in V3 removed a decision V4 would otherwise have to make about whether to add a `phase` field. Cheap docs, concrete scope reduction.
- **Plumbing slices produce values; UI slices consume them.** V3 stores the fresh checkpoint in state but renders nothing. That looks like dead code at the line level; it's actually a seam.
- **Rubber-duck the plan, not the implementation.** The Skip-resurrection bug got caught in 30 seconds before any code was written. Catching it after would have meant code, lint, build, and re-review cycles to unwind.

Full notes: [Lessons from Wiring the Checkpoint Plumbing](./documentation/2026-06-03%20Lessons%20from%20Wiring%20the%20Checkpoint%20Plumbing.md)

### 2026-05-25 — Lighting up a new schema (V2 of partial-save)

V2 wires up the first real caller of V1's checkpoint schema: the quit dialog grows a third action, "Save partial" (when there's something to save), and the destructive button label shifts from "Quit workout" to "Discard workout" specifically when there's progress on the line. The whole slice is ~80 lines in one file — the smallness is the point, because it's the verdict on V1's design. The diff also retrofits the completed-save path onto `elapsedActiveSeconds()` so paused/dialog time isn't double-counted in either flow; harmonizing the two save paths' duration math while you're already in the file is much cheaper than the eventual bug report.

**Patterns I'm internalizing:**

- **A small first-caller diff is the validation that the schema's right.** V2 wrote every field V1 defined without adding new ones. If V2 had needed to reach back and add `quitReason`, that would have been a signal V1's design was incomplete. The smallness is the evidence.
- **Name the data event, not the navigation event, in destructive buttons.** "Discard workout" tells the user what happens to their data; "Quit workout" tells them what happens to the screen. When data is at stake, the verb has to point at the data.
- **Three options frame a different question than two.** Save vs. discard is an outcome decision; cancel vs. quit is a continuation decision. The pre-V2 dialog was implicitly asking the user to throw away their work without giving them the language to ask for credit.
- **Audit related math when a new caller forces you into the file.** Harmonizing `durationSeconds` accounting across both save paths cost nothing extra; leaving the inconsistency in place would have become someone's bug report in a month.
- **UI conditionals don't replace handler-level guards.** "Save partial" is only rendered when `completedExercises > 0`, and `savePartialAndQuit` _also_ guards with `if (completedExercises < 1) confirmQuit()`. The UI is the experience guard; the handler is the data guard. They will drift eventually; the handler keeps the data correct in the meantime.

Full notes: [Lessons from the First Caller of a New Schema](./documentation/2026-05-25%20Lessons%20from%20the%20First%20Caller%20of%20a%20New%20Schema.md)

### 2026-05-25 — Landing a schema before its callers (V1 of partial-save)

The partial-save arc was always going to touch six things — schema, reconciliation, write paths, clear paths, history rendering, and a future Resume CTA — and shipping that as one commit would have made every regression and every review comment a search through ~600 lines of diff for the part that mattered. V1 carves off the parts that are pure contract: the `Checkpoint` type, four storage helpers (`loadCheckpoint`, `saveCheckpoint`, `clearCheckpoint`, `reconcileCheckpoint`), an `isCompletedSession` predicate, a new `sourceRunId`-based idempotency on `saveSession`, and every history-page change that depends on the new shape (Partial badge, em-dash for null difficulty, average-difficulty filter, CSV columns). Zero new callers for the helpers; the only path to a partial row is a manual DevTools injection. The interesting design choices are the ones that make V2 and V3 cheap.

**Patterns I'm internalizing:**

- **A schema commit is a contract commit.** Every read site that touches the new shape has to ship in the same commit. Splitting "schema now, history rendering later" creates a half-true period where any developer running V2 against their local history sees broken rows. The bigger commit is paid once; the half-true period is paid by everyone working on the repo until it's fixed.
- **Idempotency keys come from event identity, not row identity.** `sourceRunId` is the identity of the in-progress workout, carried across both the explicit-save path (V2) and the on-mount reconciler (V3). A UUID generated at save time can't dedupe across two writers; a UUID generated at the start of the conceptual event can.
- **Reconciliation is a state machine.** Four outcomes (`reconciled-completed`, `fresh`, `reconciled-partial`, `discarded`, plus `none`) collapsed into "if checkpoint, save as partial" would have lost completed-pending recovery and silently destroyed any fresh checkpoint the user wanted to resume. Tagged unions force callers to handle each case explicitly; the compiler catches the missed ones.
- **RunId-scope every destructive operation.** `clearCheckpoint({runId})` no-ops when the persisted runId doesn't match. That's the safety guarantee that turns "test mode discard" and "multi-tab clobber" from race-condition bugs into automatic correctness without anyone having to think about them.
- **Back-compat is encoded in the predicate, not asked of every caller.** A missing `status` field reads as `'completed'` because that's what `isCompletedSession(s)` returns for old sessions. Every `todayCount` / `currentStreak` / `last7Days` filter routes through that predicate, so back-compat lives in one place.

Full notes: [Lessons from Landing a Schema Before Its Callers](./documentation/2026-05-25%20Lessons%20from%20Landing%20a%20Schema%20Before%20Its%20Callers.md)

### 2026-05-23 — Closing the workout loop (test tempo + celebration + side-plank split)

Three changes shipped together because they reinforce each other. A `?test=1` URL flag compresses the workout tempo to 5/2/2 seconds AND short-circuits the history write, turning a 7-minute iteration loop into ~84 seconds. With that loop in place, the DoneScreen got a staged celebration: a green ring strokes in, the checkmark draws inside it, the three stat tiles fade up from below, and only then — after the user's eye has landed — the "Today's rounds" and "Day streak" numbers bump if they incremented. `prefers-reduced-motion` collapses the whole thing to the static end-state. And "Side Plank — 30s each side" turned out to be a copy fix for a model bug: the tip said two sides, the timer only counted one. It's now two real entries (Right and Left) in all three routines.

**Patterns I'm internalizing:**

- **Build the test instrument before iterating.** A URL flag that compresses time and skips writes is a small change that pays for itself in two rounds of polish. Animation work is gated by the speed of the iteration cycle; the loop is the asset.
- **Test instruments must isolate side effects.** Compressing time is fine; mutating real history would have inverted the relationship between the tool and the data. The flag has to guarantee no observable user state is touched — that rule then pulled forward into the partial-save shaping ("test mode writes nothing").
- **Stage reveals to match the user's questions.** "Did I finish?" → "What did I do?" → "What changed?" arrives in that order, so the animation arrives in that order. Numbers that haven't been on screen yet can't be felt as having changed.
- **Every flourish needs a quiet fallback.** Animations that convey information must work as a still image when motion is disabled. If turning off motion destroys meaning, the meaning was riding on the motion instead of being supported by it.
- **Copy that compensates for a wrong model is technical debt.** "30s each side" was the user's job to reconcile because the timer ignored it. Fix the model — two entries, two sides, two timers — and the copy can be honest.

Full notes: [Lessons from Closing the Workout Loop](./documentation/2026-05-23%20Lessons%20from%20Closing%20the%20Workout%20Loop.md)

### 2026-05-23 — Pointing the rest screen forward

The rest interval was showing the icon of the just-finished exercise and a generic "Catch your breath" label, when the moment is actually about previewing what's coming in 10 seconds. The `index` state correctly tracked the active exercise (including across its trailing rest), but the render block was applying a state-mirroring display contract when it needed a forward-looking one. Fix: introduce a `previewed = phase === "rest" ? (next ?? current) : current` derived value and route icon, name, and tip through it. Mirrors the existing `"First up: <name>"` convention from the ready phase as `"Up next: <name>"`. Net effect: fewer lines of code, correct behavior, no new visual shapes invented.

**Patterns I'm internalizing:**

- **Name the forward-looking concept when it diverges from "current."** As soon as the display contract is "show what the user is about to deal with," that's a different variable from `current`. The data model didn't need to change — only the derived value the view reads from.
- **Reuse the encoding of the screen next door.** "First up:" → "Up next:" is the same shape with a different prefix. Don't invent a layout for a new use case if an existing one already encodes the concept.
- **Identify the user's internal question and answer it.** "Catch your breath" tells the user what they already know. The valuable copy answers the question they're computing in their head right now — _what am I about to do?_
- **Subtraction over addition (again).** Three nested conditionals reading from `current` and `next` collapsed into one derived variable. The fix made the file shorter, mirroring the earlier deep-link-crash lesson that removals are often safer than additions.
- **Defensive fallbacks document invariants.** `next ?? current` can never fire (the last work transitions straight to `done`), but the fallback plus comment tells a future maintainer what's true and where to look if `advancePhase` ever changes.

Full notes: [Lessons from Pointing the Rest Screen Forward](./documentation/2026-05-23%20Lessons%20from%20Pointing%20the%20Rest%20Screen%20Forward.md)

### 2026-05-23 — Off-screen feedback: wake lock and haptics

Two small P1 gaps shipped together because they share a theme: **the workout happens away from the screen.** The existing wake lock acquired once on mount and never came back — the OS auto-releases the lock the first time the document goes hidden (tab switch, phone call), so after the first interruption the screen dimmed for the rest of the workout. Extracted into a `useWakeLock` hook that listens to both `visibilitychange` (intent: I want a new lock) and the sentinel's `release` event (observation: my lock is gone), plus `inFlight` + `cancelled` guards around the async acquire. Then added `navigator.vibrate` cues at the three phase boundaries — work start, rest start, finish — pulses cadenced to mirror the existing audio beeps. Lives in a new `src/lib/haptics.ts` module parallel to `audio.ts` so a future independent mute toggle is a one-line change.

**Patterns I'm internalizing:**

- **Acquire + revoke event together.** Every browser API that hands you a revocable handle (wake lock, audio context, geolocation watch, media stream, persistent storage) needs both an acquire call and a paired revocation listener. If you only have one, the other is the bug-in-waiting.
- **Observation vs. intent listeners.** Resource events come in conjugate pairs — one says "your state changed," one says "I want to drive new state." Wire both. With `release` alone you know the lock is gone but never ask for a new one; with `visibilitychange` alone you ask for a new one without knowing the old reference is stale.
- **Two concurrency guards around any `await` in an effect.** `inFlight` closes the re-entry window between starting and finishing the request. `cancelled` closes the unmount-during-request window. Different bugs, different symptoms, same shape — anything that lives across an `await` needs a guard at both ends.
- **Cue density is a UX decision.** Naïve translation "every audio cue gets a haptic cue" is wrong. The 5-4-3-2-1 countdown is already audible; adding a buzz per tick is how apps train users to mute notifications. Phase changes — moments when the user has to _change_ what they're doing — are where the buzz earns its keep.
- **Progressive enhancement in the original sense.** `navigator.vibrate` doesn't exist on iOS Safari, full stop. Audio must remain the load-bearing feedback channel because it's the only one available on every target. Haptics layer on Android as a bonus.
- **Parallel modules for parallel concerns.** Audio and haptics share call sites today but are likely to be controlled separately tomorrow (mute one without the other). Splitting `haptics.ts` from `audio.ts` cost one import and bought a cheap seam for the future settings page.

Full notes: [Lessons from the Hands-Off UX Polish](./documentation/2026-05-23%20Lessons%20from%20the%20Hands-Off%20UX%20Polish.md)

### 2026-05-23 — The PWA offline arc, sliced five ways

Took the app from "a website on a phone" to "a phone-shaped app that survives a flight, tells you when it's been updated, and renders in the right typeface offline," in five small commits. V1 shipped the icons + manifest colors needed to be installable without a white-flash splash. V2 added a handwritten service worker for cache-on-fetch. V3 added a build-time precache so even never-visited routes work on a cold-start offline. V4 closed the update loop with an in-app "A new version is available" banner — without it, the browser's "waiting" state silently parks deploys behind every-tab-closes, which in practice never happens. V5 added stale-while-revalidate for Google Fonts in a deliberately separate cache that survives deploys.

**Patterns I'm internalizing:**

- **Decompose black-box concepts into parts.** A PWA is three things: manifest, icons, service worker. Each ships independently. Same shape as the viewport-tag-is-four-tokens decomposition from the last entry.
- **Vertical-slice infrastructure work.** V1→V2→V3→V4→V5. Each slice is shippable, demonstrable, reversible. The alternative — one 700-line "feat: add PWA support" commit — is what I'll call The Iceberg PR. Nightmare to review, impossible to roll back partially, no learning per layer.
- **Content-hash the thing whose identity matters.** Hash the precache list to derive the SW version, not the timestamp. Asset content gets hashed into filenames. Same primitive at multiple layers and multiple scopes — the SW _file bytes_ and the _precache list hash_ are independent content-identities.
- **Make templates valid versions of themselves.** `public/sw.js` lints clean with `"__SW_VERSION__"` and `["__PRECACHE__"]` as placeholders because both are _already_ valid JS. The build plugin refines them; it doesn't validate them.
- **Snapshot at boot, compare on event.** The `wasControlled = !!navigator.serviceWorker.controller` trick distinguishes "this is the first install" from "this is an update" with one bit of state. Generalizes everywhere.
- **Check whether the platform primitive already broadcasts.** `controllerchange` fires in every controlled tab when one tab calls `skipWaiting()`. Multi-tab reload is free if you use it.
- **Pair cache lifetime to its invalidator.** Fonts and the app bundle invalidate for different reasons (Google updates a subset vs. we ship a deploy) and belong in separate caches. "One cache for everything" is convenience masquerading as design.
- **Default-deny cross-origin side effects.** Same-origin can opt-out; cross-origin should opt-in via an explicit allowlist (`FONT_ORIGINS`).
- **Rubber-duck the plan, not just the implementation.** Two real bugs in V4 caught at zero implementation cost. The earliest moment is the cheapest moment.

Full notes: [Lessons from the PWA Offline Arc](./documentation/2026-05-23%20Lessons%20from%20the%20PWA%20Offline%20Arc.md)

### 2026-05-15 — Pinch-zoom is an accessibility right

A one-line viewport meta change — delete `user-scalable=no` from `__root.tsx` — that sits at the intersection of accessibility, inherited scaffolds, and asymmetric platform behavior. iOS Safari has silently ignored this tag since 2016 on accessibility grounds; Chrome on Android still honors it. So the bug had real blast radius (half the global mobile market) but was invisible to iPhone-first testing. It was also never a decision anyone on this project made — Lovable's scaffold put it there and the project inherited it without auditing.

**Patterns I'm internalizing:**

- **Inherit-and-audit.** When you adopt a scaffold, schedule a pass through every default and ask "why?" Cousin to _"before fixing a missing thing, check whether it was missed or removed on purpose"_ — the inverse: _before keeping a present thing, check whether it was added on purpose or just inherited._
- **Asymmetric platform behavior hides bugs.** The platform you don't test on is where the regression lives. iPhone-first dev silently shipped this Android-only failure.
- **Accessibility-as-steady-state, not edge case.** Most a11y antipatterns don't hurt a small minority of users — they hurt a large majority of users some of the time. For a workout app used phone-on-the-floor with sweat in the eyes and reading glasses off, pinch-zoom is exactly the affordance the moment needs.
- **"Native feel" is a category of antipattern**, not a justification. The browser features people strip to "feel more native" are usually the ones that make the web better than native — universal accessibility, deep-linkable URLs, no install gate.

Full notes: [Lessons from Removing `user-scalable=no`](./documentation/2026-05-15%20Lessons%20from%20Removing%20user-scalable%3Dno.md)

### 2026-05-13 — "Missing" vs. "intentionally absent"

Auditing the repo for secrets before flipping it public turned up a useful surprise: [`.lovable/plan.md`](./.lovable/plan.md) (the original prompt-to-plan output Lovable generated for this project) explicitly states that **no service worker was intentional** — Lovable guidance, to avoid cache/preview weirdness during development.

Yesterday's [audit](./documentation/2026-05-12%20Initial%20Product%20Audit.md) called the missing SW a P0 fix. It's not — it's a deliberate trade. The reframed question is:

- Do we want **offline-in-the-gym** badly enough to take on the cache-management complexity that a service worker brings?
- If yes: add SW + 192×192 icon + maskable icon. Accept the update dance.
- If no: keep what we have. Chrome won't show "Install" (only "Add to Home screen"), but the UX is otherwise fine.

**Pattern I'm internalizing:** before fixing a "missing" thing, find out whether it was missed or _removed on purpose_. The same artifact looks like a bug from one angle and a design choice from another. Read the prior author's notes before assuming oversight.

Full reframe: [Audit addendum — PWA finding reframed](./documentation/2026-05-12%20Initial%20Product%20Audit.md#update--2026-05-13-pwa-finding-reframed)

### 2026-05-12 — SSR serialization boundaries are real

Fixed a `/routine/<id>` crash that only fired on cold load (refresh, deep link, share). Root cause was returning a Lucide icon component from a route loader; the SSR serializer (`seroval`) refused to encode the icon's `forwardRef` symbol, the server crashed mid-stream, and the client tried to hydrate against state that was never written.

**What I learned:**

- A loader return value is a network/serialization boundary. Treat it like a JSON API response.
- The visible error (an invariant about missing dehydrated state) was three layers downstream of the real cause.
- **Subtraction is often safer than addition.** I could have trimmed the loader to return `{ id }`, but removing the loader entirely eliminates the failure class.
- "Works on click, breaks on refresh" is a fingerprint of an SSR-only bug.

Full notes: [Lessons from the Routine Deep Link Crash](./documentation/2026-05-12%20Lessons%20from%20the%20Routine%20Deep%20Link%20Crash.md) · [Shaping doc](./documentation/2026-05-12%20Routine%20Deep%20Link%20Crash%20-%20Shaping.md)

### 2026-05-12 — Initial product audit

Walked through the live app end-to-end as if I were a product manager and mobile designer auditing it for the first time. Catalogued P0 bugs, UX gaps, antipatterns, and things that already work well.

Notable findings:

- A `window.confirm()` quit dialog (native browser dialog inside a phone-first PWA — antipattern).
- A PWA manifest that's _almost_ installable but missing the 192×192 icon and a registered service worker.
- A `viewport` meta with `user-scalable=no` (accessibility violation — see WCAG 1.4.4).
- The "Test run" mode that doesn't actually shorten intervals.

Full audit: [Initial Product Audit](./documentation/2026-05-12%20Initial%20Product%20Audit.md)

### Before that — the Lovable build

The original version was generated with Lovable from a short prompt. I added:

- A third "Advanced" routine.
- A 1–5 self-rated difficulty after each session.
- Per-second audio cues.
- A silent audio buffer at session start to unlock iOS Safari's audio permission gate.
- History view + CSV export.
- A few rounds of tightening padding and spacing.

Most commits in that period are titled "Changes" because I hadn't started writing real messages yet. (That's a small thing I'm fixing going forward.)

---

## Roadmap

The list below comes straight from the [initial audit](./documentation/2026-05-12%20Initial%20Product%20Audit.md). I'm working through it roughly in order of _reach × leverage_ — i.e., things that affect the most users for the smallest amount of code, first.

### Now (P0 — bugs and basics)

- [x] **Fix `/routine/<id>` deep-link crash.** SSR was serializing icon components in the loader return. ([details](./documentation/2026-05-12%20Lessons%20from%20the%20Routine%20Deep%20Link%20Crash.md))
- [x] **Decide what we want from PWA.** Shipped as a five-commit arc (V1 icons + manifest colors → V2 cache-on-fetch SW → V3 build-time precache for cold-boot offline → V4 in-app "update available" banner → V5 stale-while-revalidate for Google Fonts). Full notes: [Lessons from the PWA Offline Arc](./documentation/2026-05-23%20Lessons%20from%20the%20PWA%20Offline%20Arc.md).
- [x] **Fix OG metadata.** `og:title` was "Short Seven" and the OG image was the default Lovable preview. Now points to the production icon with a `summary` Twitter card.
- [x] **Remove `user-scalable=no` from the viewport.** Accessibility regression (WCAG 1.4.4 — users must be able to zoom). ([details](./documentation/2026-05-15%20Lessons%20from%20Removing%20user-scalable%3Dno.md))
- [x] **Replace the `window.confirm()` quit dialog** with an in-app modal styled to match the rest of the UI. Also swept the history "delete session" confirm at the same time.

### Next (P1 — UX gaps)

- [x] **Acquire a wake lock during workouts** so the screen doesn't dim mid-burpee. Existing one-shot acquire died on the first `visibilitychange`; now lives in a `useWakeLock` hook that re-acquires on visibility and tracks `release` events. ([details](./documentation/2026-05-23%20Lessons%20from%20the%20Hands-Off%20UX%20Polish.md))
- [x] **Haptic feedback on phase changes** (`navigator.vibrate`) to back up the audio cues. Three buzzes at the phase boundaries (work / rest / finish), not on the tick countdown. iOS Safari has no support — audio carries that platform. ([details](./documentation/2026-05-23%20Lessons%20from%20the%20Hands-Off%20UX%20Polish.md))
- [x] **Make "Test run" actually do something.** Now backed by a `?test=1` URL flag that compresses tempo to 5/2/2 seconds AND skips the history write, so the full flow (ready → all exercises → done → save-or-skip) runs in ~84 seconds for fast iteration. ([details](./documentation/2026-05-23%20Lessons%20from%20Closing%20the%20Workout%20Loop.md))
- [ ] **Save partial workouts on quit.** Right now quitting throws away the progress. At minimum: record that a session was started. (Shaping complete, V1 implementation pending.)
- [x] **Fix the rest screen.** Previously showed the just-finished exercise's icon and a generic "Catch your breath" label. Now routes icon, name, and tip through a derived `previewed` value that points at the next exercise during rest. Mirrors the existing "First up:" convention as "Up next:". ([details](./documentation/2026-05-23%20Lessons%20from%20Pointing%20the%20Rest%20Screen%20Forward.md))
- [x] **Match the manifest `background_color` to the actual app background.** Aligned to `#070e16` in V1 of the PWA arc — no more white flash on launch.

### Later (nice-to-haves)

- [ ] **Personal records / streaks.** "5 sessions this week." Local-only, no account.
- [ ] **Settings.** Custom interval lengths. Sound on/off. Haptics on/off.
- [ ] **More routines.** Maybe a "Mobility" or "Cool-down" addition.
- [ ] **Better difficulty suggestion logic.** Right now the 1–5 RPE rating is stored but not really used.
- [ ] **Replace `window.confirm` audit:** sweep for any other native browser dialogs.

### Open questions (things I haven't decided)

- Whether to add a real backend at any point. I lean no — the privacy and zero-ops story is part of the appeal.
- Whether the app should warn before quitting mid-session (it does today, via `confirm()`) or just save partial silently.
- Whether to allow per-routine custom intervals or keep the 30/10 structure sacred.

---

## Contributing

This is a personal learning project, but if you spot something interesting:

- **Bugs / suggestions:** [open an issue](https://github.com/TommyD04/sevenminuteworkout/issues).
- **Disagreements with what I wrote in `documentation/`:** also an issue, or a PR with your own notes appended. I'd love to have other perspectives in there.

I don't promise to merge every PR. I do promise to read every issue.

---

## Credits

- Original scaffold: [Lovable](https://lovable.dev).
- The science: [Klika & Jordan (2013)](https://journals.lww.com/acsm-healthfitness/Fulltext/2013/05000/HIGH_INTENSITY_CIRCUIT_TRAINING_USING_BODY_WEIGHT_.5.aspx) — _High-Intensity Circuit Training Using Body Weight_.
- Everything that broke and taught me something: see [`documentation/`](./documentation).

---

## License

MIT. Build whatever you want with it.
