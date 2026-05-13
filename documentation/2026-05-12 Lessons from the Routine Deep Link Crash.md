# Lessons from the Routine Deep-Link Crash

**Date:** 2026-05-12
**Case:** `/routine/<id>` deep-link returns a blank screen with `Invariant failed` on cold load. Works fine when navigated to from the home screen. One-line fix; three-day worth of learning.

This is a field-notes doc. The actual fix is small and is in [`2026-05-12 Routine Deep Link Crash - Shaping.md`](./2026-05-12%20Routine%20Deep%20Link%20Crash%20-%20Shaping.md). What's here is the meta — the patterns, the framings, the antipatterns to recognize next time. Read it as five angles on the same case.

---

## The case in two sentences

A TanStack Start route used a `loader` that returned a `Routine` object whose `exercises[i].icon` was a Lucide React icon component. On a direct hit (refresh, deep link, shared URL), SSR tried to serialize that return value via `seroval`, choked on the icon's `Symbol(react.forward_ref)`, threw mid-stream, and shipped partial HTML to the client — which then failed to find the dehydrated router state it expected and threw `Invariant failed`.

The visible symptom — a blank screen with a generic invariant message — was **three layers downstream** of the actual cause.

---

## Angle 1 — Engineering: boundaries are contracts, treat them like one

The single most useful frame here: **anywhere data crosses a layer is a contract**.

A loader return value is a network/serialization boundary. Whatever you put on the left side of `return` has to survive a trip through a serializer, over the wire, into another process, and back into a live JS heap. That trip has rules. Functions don't survive. Class instances don't survive. React components don't survive. DOM nodes don't survive. `Symbol`s with library-specific tags don't survive. The set of things that *do* survive depends on the serializer — and most serializers are stricter than they look.

Tools that hide the boundary (loaders, server actions, RSC props, GraphQL resolvers, even `postMessage`) are convenient precisely because they let you write code that *looks like* it's all one process. That convenience is a trap. The boundary still exists. When it fails, the failure manifests far from where the violation happened.

**Practical rules I'm internalizing:**

1. **Loader return values should be plain data.** Strings, numbers, arrays, plain objects, dates if your serializer supports them. Treat the return value like the body of a JSON API response.
2. **If you ever feel tempted to put "a thing" in a loader return — a component, a function, a class instance, a `useRef` value — stop.** That's the boundary screaming at you.
3. **Prefer IDs over objects across boundaries.** Pass `{ id: 'core' }` across the wire; do the lookup on the other side. That's not a workaround; that's correct boundary hygiene.
4. **The fewer boundaries you cross, the fewer ways things fail.** Static reference data (like our `ROUTINES` array) doesn't need to roundtrip the server at all. Look it up in the component.

This was the load-bearing insight that made me pick Shape B (no loader) over Shape A (slim loader). The "trim the loader" fix works, but it leaves the boundary in place — and the next developer can innocently re-expand the return value and reintroduce the bug. **Removing the boundary eliminates the failure class. Trimming it only narrows the failure window.**

> **The bigger principle:** *Subtraction is often safer than addition.* When you don't need something, deleting it beats sanitizing it.

---

## Angle 2 — Debugging: hypothesis discipline and three-layer cascades

I came in with a confident hypothesis: "loader returns contain non-serializable values; serialization fails; therefore the client can't hydrate." That was **directionally right** but **mechanically wrong in three ways**:

| What I thought | What's actually true |
|---|---|
| Serializer is `JSON.stringify` | It's `seroval` — richer than JSON, can handle `Date`/`Map`/`Set`, but bails on React's `forwardRef` symbol |
| Functions are the problem | Specifically, the `$$typeof: Symbol(react.forward_ref)` tag on the icons is what seroval refuses |
| Failure is "data garbled in transit" | Failure is "server crashed mid-stream, partial HTML shipped, client looked for state that was never written" |

This is the **three-layer cascade pattern**. The visible symptom is several steps away from the cause:

```
Root cause:  seroval throws on Symbol(react.forward_ref)
              ↓
Layer 1:     Server error middleware tries to recover, but...
              ↓
Layer 2:     HTML response is already partially streamed (head + shell sent)
              ↓
Layer 3:     Client boots, looks for window.$_TSR.router, finds nothing
              ↓
Symptom:     "Invariant failed" + blank screen
```

**Why this matters for debugging:**

1. **The error message is rarely where the bug lives.** Most invariants are checks that something earlier in the chain went wrong. Treat them as smoke detectors, not pinpoints.
2. **Server logs and client logs together >> either alone.** The client said "missing dehydrated state." The server quietly said "seroval threw on a symbol." Either alone is misleading. Together, the cascade is obvious.
3. **Hypothesis is a tool, not a destination.** A confident hypothesis is great for choosing where to look first. But you must remain falsifiable — the spike is where you find out whether the *mechanism* matches your guess, not just the *direction*.

**Debugging heuristic I'm keeping:** *Trust the symptom enough to start looking. Distrust it enough to keep looking after the first match.*

### The differential-diagnosis move

The most valuable single tool in the spike was free and took 30 seconds: I listed every route in the app and asked which ones have a `loader`. One did. Three didn't. The crashing route was the one that did. That observation alone collapsed the hypothesis space by ~80%.

This is differential diagnosis: when one case fails and similar cases don't, the difference between them is your suspect. It's almost always the first move worth making, and it's almost always free.

---

## Angle 3 — Product/PM: severity × likelihood × trust cost

You asked early: *"How serious is this?"* That's the right question, and the way most engineers answer it is incomplete. Severity alone undersells real bugs and oversells theatrical ones.

I think the right model has **three axes**:

| Axis | Question | What it tells you |
|---|---|---|
| **Severity** | When this fires, how bad is the blast? | The damage radius |
| **Likelihood** | How often does it fire? | The frequency of damage |
| **Trust cost** | What does the user *infer* about your product when it fires? | The compounding cost beyond the immediate incident |

For this bug:

- **Severity:** High when it fires (totally broken page, no recovery)
- **Likelihood:** Low-medium (only on direct hit, not on click)
- **Trust cost:** **High and asymmetric.** Here's why:

> Refresh is what users do when something already feels off. Sharing a URL is what users do when they want a friend to use your product. Restoring a session is what users do when they trust your product enough to come back. **Every single one of those flows hits the broken path.** This bug doesn't fire randomly — it fires at the exact moments where the user's confidence is being tested.

That's what makes "low-likelihood" misleading. A low-likelihood bug that fires at high-stakes moments costs more per occurrence than a high-likelihood bug that fires when the user is already mid-flow. The frequency-weighted blast underestimates the actual damage.

**Two product framings worth pocketing:**

1. **Trust battery.** Every user has a finite tolerance for weirdness before they conclude your product is unreliable. Each glitch drains it; each successful flow recharges it. Bugs that drain on actions adjacent to *trust-testing* (refresh, share, return-visit) drain faster than the same bug firing during normal use.
2. **Path-weighted impact.** When triaging, score bugs by the importance of the *path* that hits them, not the *frequency* of users hitting them. Onboarding paths, payment paths, share paths, recovery paths — all carry higher weight per occurrence than core-loop paths.

**The triage takeaway:** "Only 5% of users hit this" is not a defense if those 5% are the users testing whether to trust you.

---

## Angle 4 — Design/UX: refresh is a stress test

Tangential to the bug, but worth naming explicitly because it'll come up again:

**Refresh is the universal "is this real?" gesture.** Users refresh when something feels stuck, when they're not sure their action registered, when they're sharing screens and want to start clean, when the network blinked. Refresh is implicitly a stress test against your application's state model.

Apps that survive refresh well share three properties:

1. **URL is the source of truth for state that matters.** If a user can be in a meaningful place in your app, that place has a URL.
2. **State that doesn't fit in the URL gets persisted somewhere durable.** localStorage, server-side session, indexedDB — pick one, but don't hold meaningful state only in memory.
3. **Cold-load and warm-nav are the same.** Whatever you can reach by clicking from `/`, you can reach by typing the URL. No exceptions.

The bug we just fixed is the *exact* violation of #3. Cold-load and warm-nav weren't the same — they used different code paths under the hood and only one was tested.

**Design antipattern to recognize:** *"It only breaks on refresh"* and *"it only breaks when you share the link"* and *"it only breaks when you reload the page"* are all the same bug wearing different costumes. They all mean: **you have two code paths to the same screen, and only one is working.** Always converge them.

---

## Angle 5 — Process: spikes, shapes, and the value of removing things

Three process moves that paid off here:

### 5a. Spike before commit

The temptation was to read the symptom, name the bug, and ship the fix in one motion. The shaping methodology forced a spike: *what do we believe, and how would we know?* That cost maybe 20 minutes and produced three concrete payoffs:

1. It rejected the wrong mechanism (JSON, not seroval) before I wrote code based on it.
2. It surfaced the three-layer cascade, which is now a debugging pattern I'll recognize next time.
3. It generated the "no other route has a loader" insight, which expanded the fix from "patch this route" to "this is the only route at risk."

**Heuristic:** *Spike when the symptom is far from the cause.* If the error message points to one layer and your hypothesis points to a different layer, you don't yet understand the bug — even if your hypothesis is right.

### 5b. Comparing shapes before committing

The shaping doc had five shapes (A through E). Picking the first one that works is almost always wrong. The discipline of writing them down forced me to notice that Shape A *trims* the boundary while Shape B *removes* it. Both fix the symptom. Only one eliminates the failure class.

If I'd skipped the shapes table, I'd have shipped Shape A. It would have worked. The bug would quietly wait for a future contributor to re-expand the loader.

### 5c. Subtraction over addition

The final fix removed code. No new function, no new module, no clever wrapper — just deleted the loader and moved the lookup to the component. **Deletion is underrated.** It eliminates rather than mitigates. It reduces surface area. It removes the construct that could fail.

Pattern: **before you add a fix, ask whether you can remove what's failing instead.** Often the construct you're trying to patch is the construct you don't actually need.

---

## Patterns and antipatterns to recognize next time

### Patterns ✅

- **Boundary thinking.** Every place data crosses a layer is a contract. Whether or not the language hides it, the boundary exists.
- **Differential diagnosis.** When one case fails and a similar case doesn't, the difference is your suspect.
- **Three-axis triage.** Severity × likelihood × trust cost. Not just severity.
- **Path-weighted impact.** Score bugs by the importance of the path, not the frequency of users.
- **URL is the source of truth.** If a screen matters, it has a URL. If state matters, it survives refresh.
- **Cold-load == warm-nav.** Always converge them.
- **Spike when the symptom is far from the cause.**
- **Subtraction over addition.** Remove what's failing before you patch it.
- **Closed feedback loop.** Verify the fix doesn't just remove the error — also verify it doesn't regress anything adjacent.

### Antipatterns ❌

- **"It works in development."** Dev often skips boundaries (SSR/CSR convergence, network roundtrip, build minification). Anything that only fails in production is suspect.
- **"Only 5% of users hit this."** True frequency without path-weighting hides asymmetric trust costs.
- **"Just add a try/catch."** Catching an error from a broken boundary is not the same as fixing the boundary. Error handling is a backstop, not a load-bearing wall.
- **Trimming a boundary you can remove.** If you can delete it, deletion is safer than tightening.
- **Picking the first shape that works.** Without writing alternatives down, you can't compare. Without comparing, you can't know whether you picked the best one.
- **Treating invariants as pinpoints.** They're smoke detectors. The fire is upstream.
- **Reading only client logs (or only server logs).** Three-layer cascades live in the gap between them.
- **Working on a thesis without a falsification test.** A hypothesis without a way to be wrong is theology.

---

## Open questions worth answering in the next session

1. **Are there other latent SSR-serialization bombs in the app?** We confirmed no other route has a `loader`, but TanStack Start has other serialization boundaries (route context, search params, server functions). Worth a survey.
2. **Should we add a CI check for loader return shapes?** A simple type-level guard ("loader returns must be `JsonValue`") could prevent this entire class of bug at compile time. Is the cost worth it for a hobby app? Probably no. Worth knowing the technique exists.
3. **Is there a generalizable test for `cold-load == warm-nav`?** A Playwright pass that visits every route both ways and asserts the same DOM would catch this whole bug family. Worth doing once.
4. **Where else does "refresh stress test" apply in this app?** The workout screen mid-session is the obvious candidate. If a user refreshes during a workout, what happens? (Probably: lose all state. Probably bad.)

---

## TL;DR — what to carry forward

- **Boundaries are contracts.** Loader returns, server actions, postMessage, any IPC. Plain data only.
- **Severity isn't enough.** Multiply by likelihood and trust cost; weight by path importance.
- **Refresh is a stress test.** If your app dies on refresh, your state model is broken, not just the page.
- **Spike when the symptom is far from the cause.** Cheap insurance against shipping a fix based on the wrong mechanism.
- **Subtraction > addition** when you can manage it. Remove the construct; don't patch it.
- **Invariants are smoke detectors, not pinpoints.** Look upstream.
- **Differential diagnosis is the first move and it's almost always free.**

— Goodfellow
