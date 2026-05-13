# `/routine/*` Deep-Link Crash — Shaping

**Status:** Shaping
**Linked audit:** [2026-05-12 Initial Product Audit](./2026-05-12%20Initial%20Product%20Audit.md) (Finding 🔴 #1)

---

## Frame

### Source

> `/routine/<id>` is broken on direct load. Open `sevenminuteworkout.lovable.app/routine/core` in a new tab — blank screen + `Invariant failed` in console. Same for `/classic` and `/advanced`. Works only when you navigate via the in-app link.
>
> — Initial Product Audit, Finding 🔴 #1

### Problem

- Visiting `/routine/core`, `/routine/classic`, or `/routine/advanced` directly (refresh, paste-URL, share, bookmark, Add-to-Home-Screen) renders blank with `Invariant failed` in the console.
- Client-side navigation from `/` works — so users only hit this when they leave and come back.
- This silently breaks "share a routine" as a social motion, and breaks PWA installs that pin a routine page.

### Outcome

- All three routine deep-links load successfully on cold visit, refresh, and share.
- No regression to client-side navigation, history page, or workout flow.
- Whatever fix we pick stays consistent with the project's TanStack Start SSR posture (don't globally disable SSR to mask the bug).

---

## Requirements (R)

| ID | Requirement | Status |
|----|-------------|--------|
| R0 | `/routine/core`, `/routine/classic`, `/routine/advanced` load without console errors on direct hit | Core goal |
| R1 | Refresh on `/routine/<id>` reloads the page without crashing | Must-have |
| R2 | Pasted/shared `/routine/<id>` URL works for a first-time visitor | Must-have |
| R3 | Existing client-side navigation from `/` to `/routine/<id>` still works | Must-have |
| R4 | Invalid routine IDs render the existing "Routine not found." state | Must-have |
| R5 | Per-routine `<title>` (e.g. "The Core 7 — 7-Minute Workout") still set in `<head>` for SEO/share | Must-have |
| R6 | No regression on `/`, `/history`, or `/workout` | Must-have |
| R7 | Fix stays inside the route file and `lib/workout.ts`; no SSR opt-out or framework reconfiguration unless we hit a wall | Leaning yes |
| R8 | Fix is surgical — small, reviewable diff with a clear root-cause story | Nice-to-have |

---

## Spike: Confirm root cause

Strong hypothesis exists; spike confirms before we pick a shape.

### Context

The route file `src/routes/routine.$id.tsx` defines a TanStack Router `loader` that returns a `Routine` object. That object contains `exercises[i].icon`, which is a Lucide React **component function** (e.g. `Anchor`, `Zap`). TanStack Start serializes loader return values to send them from SSR → client for hydration. Functions are not JSON-serializable.

Client-side navigation from `/` runs the loader directly in the browser — no serialization — which is why that path works. A direct hit forces the SSR roundtrip, exposing the bug.

### Goal

Confirm that the `Invariant failed` originates from the loader-data dehydration / hydration round-trip caused by non-serializable values in the `Routine` returned by the loader. Rule out alternative causes (router-tree generation, h3 swallowing, etc.) before committing to a shape.

### Questions

| # | Question | Answer |
|---|----------|--------|
| **SX1** | Does `vite dev` reproduce the same `Invariant failed` on direct hit to `/routine/core`? | ✅ Yes — identical blank screen, identical invariant in client console |
| **SX2** | What is the actual call stack of the invariant when sourcemaps are loaded? | Client: `hydrate` in `@tanstack/router-core/dist/esm/ssr/ssr-client.js` — "Expected to find a dehydrated data on `window.$_TSR.router`, but we did not." Server log reveals the upstream cause: `seroval` throws `Seroval Error (specific: 1)` with `value: Symbol(react.forward_ref)` — the Lucide icon's forwardRef marker. |
| **SX3** | If the loader is changed to return a plain serializable object (e.g. just `{ id }`), does the crash go away? | ✅ Yes — verified live. Page renders, zero console errors. |
| **SX4** | Does removing the loader entirely also resolve it? | ✅ Yes by construction — no loader return = nothing to dehydrate = no serializer path to crash. This is Shape B. |
| **SX5** | Are there other routes/loaders in the app at risk of the same issue? | ✅ No — `routine.$id.tsx` is the only route with a `loader`. `index.tsx`, `workout.tsx`, and `history.tsx` all do client-side state and don't roundtrip data through SSR. |

### Acceptance

Spike is complete when we can describe (a) where the invariant originates, (b) which values trigger it, and (c) which of A/B/C below would resolve it without regressing R3–R6.

### Findings (post-spike)

**Root cause:** TanStack Start uses [`seroval`](https://github.com/lxsmnsyc/seroval) (not plain `JSON.stringify`) to dehydrate route state. Seroval is richer than JSON — it can represent `Date`, `Map`, `Set`, `URL`, recursive refs — but it bails on React-specific symbols. Every Lucide icon is wrapped in `React.forwardRef`, which tags it with `$$typeof: Symbol(react.forward_ref)`. When seroval encountered `exercises[0].icon = Anchor` it threw immediately.

**Cascade producing the visible symptom:**

1. Server runs SSR → calls loader → builds `Routine` object with icon component refs.
2. Server starts dehydrating route state into a `<script>` for the client.
3. `seroval` throws on the forwardRef symbol.
4. `server.ts` error middleware tries to catch it, but the HTML response has already been partially streamed (head + shell). It can't replace the body.
5. The client receives a partial HTML with `<Scripts />` but **no `$_TSR.router` payload**.
6. Client boots, `hydrateStart` looks for `window.$_TSR.router`, finds nothing, fires the invariant.

The visible "blank screen + invariant" is **three layers downstream** of the real failure.

**Implication for shape choice:** Shape A (slim loader returning `{ id }`) and Shape B (no loader, lookup in component) both resolve the bug. Shape B preferred — it removes the boundary entirely so a future contributor can't accidentally reintroduce the bug by re-expanding the loader return.

---

## Shapes

> Note: pre-spike. Mechanisms below are sketches; ⚠️ flags will resolve when SX1–SX5 are answered.

### A: Slim loader (return only the routine `id`)

| Part | Mechanism | Flag |
|------|-----------|:----:|
| A1 | Change loader to `return { id: r.id }` — drop the icon-bearing exercises array | |
| A2 | In `RoutineDetail`, replace `Route.useLoaderData()` with `ROUTINES.find(r => r.id === useParams().id)` (or import from a helper) | |
| A3 | Keep existing `notFound()` throw in the loader so 404 path is preserved | |
| A4 | Keep existing `head()` lookup against `ROUTINES` (already works — no change) | |

### B: No loader at all (lookup in component, validate in `beforeLoad`)

| Part | Mechanism | Flag |
|------|-----------|:----:|
| B1 | Replace `loader` with `beforeLoad: ({ params }) => { if (!ROUTINES.find(...)) throw notFound(); }` — no return value, nothing to serialize | |
| B2 | `RoutineDetail` uses `Route.useParams()` to look up the routine from `ROUTINES` at render time | |
| B3 | `notFoundComponent` and `errorComponent` continue to work unchanged | |
| B4 | Same `head()` lookup as today | |

### C: Make `Routine` serializable across the wire

| Part | Mechanism | Flag |
|------|-----------|:----:|
| C1 | Change `Exercise.icon` from `LucideIcon` (function) to `iconName: keyof typeof ICON_MAP` (string) in `lib/workout.ts` | |
| C2 | Introduce an `ICON_MAP` (string → LucideIcon) for render-time lookup | |
| C3 | Update every consumer that reads `ex.icon` — `routine.$id.tsx`, `workout.tsx`, and `index.tsx` if applicable | ⚠️ |
| C4 | Loader can return the full `Routine` (now serializable) | |

### D: Per-route SSR opt-out

| Part | Mechanism | Flag |
|------|-----------|:----:|
| D1 | Add `ssr: false` (or equivalent) to `createFileRoute("/routine/$id")` config | ⚠️ |
| D2 | Verify per-route SSR opt-out is supported by current TanStack Start version (1.167.x) | ⚠️ |
| D3 | Accept the cost: blank initial paint, no SSR `<title>` for share-cards | |

### E: Anti-shape — error boundary fallback only

| Part | Mechanism | Flag |
|------|-----------|:----:|
| E1 | Leave the bug; rely on `errorComponent` to show a friendly "try again" | |
| E2 | Doesn't satisfy R0 or R2 — listed only to make the trade-off explicit | |

---

## Fit Check (R × shapes)

| Req | Requirement | Status | A | B | C | D | E |
|-----|-------------|--------|---|---|---|---|---|
| R0 | `/routine/*` loads without console errors on direct hit | Core goal | ✅ | ✅ | ✅ | ✅ | ❌ |
| R1 | Refresh on `/routine/<id>` reloads without crashing | Must-have | ✅ | ✅ | ✅ | ✅ | ❌ |
| R2 | Pasted/shared `/routine/<id>` URL works for first-time visitor | Must-have | ✅ | ✅ | ✅ | ✅ | ❌ |
| R3 | Client-side navigation from `/` still works | Must-have | ✅ | ✅ | ✅ | ✅ | ✅ |
| R4 | Invalid routine IDs render "Routine not found." | Must-have | ✅ | ✅ | ✅ | ✅ | ✅ |
| R5 | Per-routine `<title>` still set in `<head>` for SEO/share | Must-have | ✅ | ✅ | ✅ | ❌ | ✅ |
| R6 | No regression on `/`, `/history`, `/workout` | Must-have | ✅ | ✅ | ⚠️ | ✅ | ✅ |
| R7 | Fix stays inside the route file + `lib/workout.ts` | Leaning yes | ✅ | ✅ | ❌ | ❌ | ✅ |
| R8 | Surgical, small, reviewable diff | Nice-to-have | ✅ | ✅ | ❌ | ✅ | ✅ |

**Notes:**
- **A** and **B** are both small and surgical. **B** is slightly cleaner (no loader return at all means no risk of someone later putting an unserializable value back).
- **C** is the "correct" long-term refactor but touches every consumer of `Exercise.icon` and risks R6 regressions in `workout.tsx`. Worth keeping in mind as a future cleanup, not as the fix here.
- **D** breaks R5 — without SSR, the routine `<title>` won't appear in the initial HTML, so iMessage/Slack share previews won't say "The Core 7."
- **E** is listed only to be explicit about the cost of doing nothing.
- The ⚠️ on **C6** reflects that we'd need to verify the icon refactor doesn't regress `workout.tsx`.

---

## Leaning

**Shape B** unless the spike turns up something surprising. It's the smallest possible diff, the only thing crossing the loader boundary is a `notFound()` throw (cleanly serializable as an HTTP outcome), and it removes the failure mode entirely rather than dancing around it. **A** is a close second.

**C** stays on the backlog as a "do this when we're ready for a proper icon refactor."

---

## Status

**Selected shape:** B — No loader; `beforeLoad` validates the param, component does the lookup at render time.

**Implementation:** Committed in this branch. `src/routes/routine.$id.tsx` now uses `beforeLoad: ({ params }) => { if (!ROUTINES.find(...)) throw notFound(); }` and `Route.useParams()` inside the component.

**Verified:**
- `/routine/core`, `/routine/classic`, `/routine/advanced` — all render on cold load, zero console errors (R0, R1, R2)
- `/routine/does-not-exist` — renders `Routine not found.` (R4)
- Client-side nav from `/` → `/routine/<id>` still works (R3)
- `/`, `/history`, `/workout` — no regressions (R6)
- `<head>` title still per-routine via `head({ params })` callback (R5)
- `npm run build` succeeds; only lint failures are pre-existing CRLF noise (R8)

---

## Next steps (proposed)

1. Run the spike: confirm SX1–SX5 with `vite dev` + a tiny change to the loader.
2. If spike confirms hypothesis: implement Shape B, verify all three routines load on cold hit, ship.
3. If spike surprises: come back to this doc, update R + shapes, re-run fit check.
