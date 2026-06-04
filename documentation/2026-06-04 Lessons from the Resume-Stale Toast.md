# Lessons from the Resume-Stale Toast

**Date:** 2026-06-04
**Case:** V5 of the "save partial workouts on quit" arc. V4 shipped a Resume / Start over / Discard cluster with click-time revalidation. The revalidation closed the data-correctness gap (no resume into a stale checkpoint) but left a UX gap: if the click-time reconcile said "stale," the CTA silently disappeared and any partial was written to history without telling the user. From the user's perspective: "I tapped Resume and nothing happened." V5 adds a 2-second top-center toast scoped to exactly that branch.

---

## The case in three sentences

V4's `onResume` either navigates (when the click-time reconcile returns `fresh`) or quietly clears state (when it returns anything else). The "anything else" path silently performed up to two visible side effects — a partial row appearing in History and the home page's today / streak counters incrementing — without acknowledging the tap that caused them. V5 inserts a single `toast()` call between the early return and the state cleanup, with branch-aware wording that only claims "saved to history" when something actually was, and deliberately leaves the other two converging paths (Discard, passive-mount stale) silent because they don't have the same user-confusion shape.

---

## Angle 1 — One slice, one branch, three deliberate non-toasts

The three paths that converge on "CTA disappears, no navigation" have different user contexts. V5 toasts exactly one of them.

| Path                                            | User context                                     | Toast?  |
| ----------------------------------------------- | ------------------------------------------------ | ------- |
| Click-time stale on Resume                      | User just tapped a button expecting navigation   | **Yes** |
| Discard                                         | User just tapped a button expecting nothing else | No      |
| Passive mount stale (home reload after timeout) | User didn't tap anything                         | No      |

The reasoning is consistent: a toast carries new information only when the user has an expectation that the UI is contradicting. Discard's expectation was already "nothing else happens." Passive-stale has no expectation at all — the user didn't act. Click-stale Resume is the one path where the user took an action expecting a specific outcome (navigation into a workout) and got the opposite (the button disappeared).

This is also the principle that ruled out an undo action on the toast. Sonner makes `action: { label, onClick }` trivial, and a "View history" link sounded helpful at first. But the toast's whole job is to acknowledge a tap that resolved silently — adding a second interactive affordance to that acknowledgment converts the notification back into a prompt. The user has to decide: was the toast information or instruction? The toast that says "Workout timed out — saved to history" with no action is unambiguous: it's a receipt. History is one tap away in the home header if the user wants to look.

The narrower lesson: toasts in response to user actions should either offer undo (Gmail's "Conversation archived · Undo" pattern, which preserves the user's ability to reverse the action) or carry no action at all (a pure receipt). The hybrid — informational toast with an unrelated link — pushes the user back into a decision space the action was supposed to resolve.

---

## Angle 2 — Branch-aware wording costs a discriminated-union check and avoids a small lie

`onResume`'s non-fresh branches partition cleanly into "wrote to history" and "didn't":

```ts
switch (result.kind) {
  case "reconciled-partial":
  case "reconciled-completed":
    toast("Workout timed out — saved to history", { id: "resume-stale" });
    break;
  case "none":
  case "discarded":
    toast("Workout timed out", { id: "resume-stale" });
    break;
  default: {
    const _exhaustive: never = result;
    void _exhaustive;
  }
}
```

A simpler `toast("Workout timed out — saved to history")` would have been six fewer lines and a small lie. The `none` branch (multi-tab race where another tab cleared the checkpoint before our click) and the `discarded` branch (sub-threshold checkpoint, mostly unreachable from the same run but defensively possible) don't write any history row. Telling the user "saved to history" in those cases sets up a confusion loop — they check History expecting to see the row, don't find it, and now mistrust the toast.

The cost is one boolean derivation. The benefit is that anyone who later does check History after the toast will find what the toast promised.

The exhaustive `switch` with the `never` default is the future-proofing layer. `ReconcileResult` currently has five arms (`none`, `fresh`, `reconciled-partial`, `reconciled-completed`, `discarded`). The `fresh` arm is handled by the earlier early return. If a sixth arm gets added later — say, `reconciled-needs-confirmation` for some hypothetical future flow — TypeScript will refuse to assign `result` to `never` in the default branch, surfacing as a compile error at the V5 site and forcing the author to think about the toast wording for the new arm. Without the exhaustive check, the new arm would silently fall through to nothing (no toast) or to the wrong message (if the simpler `wroteToHistory` ternary had been used).

---

## Angle 3 — De-duping a double tap with a shared toast `id`

A user who's frustrated that nothing happened on the first tap may tap Resume a second time within the 2-second toast window. Without precaution, that produces two toasts stacked on top of each other:

- First tap: `reconciled-partial` → "Workout timed out — saved to history"
- Second tap: `none` (the checkpoint was just cleared by the first tap) → "Workout timed out"

Two toasts, contradictory wording (one claims a save, the other doesn't), both correct in isolation. The user reads them in order and concludes the app is malfunctioning.

Sonner solves this with a single character of code: pass a shared `id` and the second toast replaces the first rather than stacking. V5 uses `id: "resume-stale"` for both branches. The second tap visually re-asserts the first toast (or replaces its message with the new one if the branch differs), and the user sees exactly one notification per gesture cluster regardless of how many times they tap.

The general lesson: any toast that's emitted from a handler the user might tap multiple times should carry a stable id. The cost is one option; the benefit is one toast per user intent rather than one toast per tap.

---

## Angle 4 — Wiring shadcn's Sonner into TanStack Start is a one-line render in the root

`src/components/ui/sonner.tsx` had been in the repo since shadcn install but was never mounted. The whole wiring is one import and one render inside `RootComponent`:

```tsx
import { Toaster } from "@/components/ui/sonner";
// ...
<QueryClientProvider client={queryClient}>
  <Outlet />
  <UpdateBanner />
  <Toaster
    position="top-center"
    duration={2000}
    mobileOffset={{ top: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
  />
</QueryClientProvider>;
```

Sonner v2 renders an empty `<section>` server-side and uses `suppressHydrationWarning` for the parts that aren't deterministic across server / client; the TanStack Start render path didn't produce a hydration warning in dev or in `bun run build`. That was the only SSR concern worth checking — `toast()` itself is client-only and bails harmlessly if called pre-hydration.

Three positional choices were locked in by the surrounding UI:

- **`top-center`** because `UpdateBanner` lives at `bottom-4 inset-x-4` on mobile and `sm:right-4` on desktop. Top-center keeps the toast clear of the iOS home-indicator swipe area and avoids overlapping the update banner (the rare case where both are visible).
- **`duration={2000}`** because the toast is a receipt, not a prompt. Long enough to read a four-word message, short enough to not linger on a page where the user has already moved their attention to "what do I do next."
- **`mobileOffset={{ top: "calc(env(safe-area-inset-top, 0px) + 12px)" }}`** because `__root.tsx` already declares `viewport-fit=cover` and `apple-mobile-web-app-status-bar-style: black-translucent`, so on iOS the safe-area-inset-top is non-zero (notch / dynamic island) and the toast without padding would clip under it. The `+12px` floor handles Android, where the inset is 0 but a small breathing margin still reads better than flush-to-top.

---

## Patterns

- **Toast user actions only when the UI's response is the opposite of the expectation.** Discard's "nothing else happens" doesn't need a toast. Passive-stale's "user didn't act" doesn't either. Click-stale Resume's "I tapped, nothing happened" does.
- **A toast is either a receipt (no action) or an undo (action that reverses the cause).** Hybrid toasts that link to an unrelated affordance reintroduce the decision space the action was supposed to resolve.
- **Branch-aware wording costs a discriminated-union check; honest messaging costs nothing else.** The simpler one-string toast would have been a small lie on the `none` / `discarded` branches.
- **Exhaustive `switch` with a `never` default at the wording site.** A future arm on `ReconcileResult` surfaces as a TypeScript error at this exact line, forcing the author to think about how to word it. The cost is three lines; the alternative is silent regression.
- **Shared toast `id` for any handler the user can re-tap within the toast's lifetime.** Sonner replaces same-id toasts instead of stacking; the user sees one notification per intent, not one per tap.
- **Lock toast position to the surrounding UI, not to a generic best practice.** Top vs. bottom is settled by where the existing fixed-position elements already are.
- **Use `env(safe-area-inset-*)` with a fallback floor when positioning fixed-position UI on mobile.** Phones with notches need the inset; phones without need a non-zero margin to not look flush.

---

## Antipatterns

- **Toasting in response to an explicit user action that already produced a visible side effect with no surprise component.** A Discard toast tells the user the button they pressed did the thing they expected. Noise.
- **Toasting passive state changes the user didn't cause.** Tells the user the system did something while they weren't looking, with no action available. Anxiety, not information.
- **One-string toasts for multi-branch outcomes when the branches have different truth values.** "Saved to history" is wrong on `none` and `discarded`; the user who checks History and finds nothing now mistrusts every toast.
- **Skipping the exhaustive default on a discriminated-union switch because today's arms are covered.** A future arm gets the default behavior silently; the smell never surfaces until a user notices the wrong wording in production.
- **Letting double taps produce stacked toasts.** Two messages with different wording within 2 seconds reads as a malfunctioning UI even when each is locally correct.
- **Mounting Sonner without `mobileOffset` on a viewport-fit=cover PWA.** The toast clips under the notch on iOS and looks like a layout bug.

---

## Open questions

- **Should the multi-tab race on `onResume`'s click-time reconcile get fixed?** The rubber-duck pass on V5 surfaced a pre-existing V4 bug: `reconcileCheckpoint()` at click time isn't scoped to `resumable.runId`, so a second tab that wrote a new checkpoint between Tab A's home mount and Tab A's Resume tap could cause Tab A to either (a) navigate into the wrong workout if the new checkpoint is fresh, or (b) toast "saved to history" referring to the wrong run if it's stale. V5 doesn't make this worse — it just doesn't fix it. The right shape is probably `reconcileCheckpoint({ expectedRunId })` returning a non-mutating result on mismatch. Deferred to a follow-up slice ("close the multi-tab race on Resume") with its own rubber-duck pass.
- **Is 2 seconds the right duration?** Short enough that the toast doesn't loiter, long enough to read a four-word message — but unverified against real users. If a user reports missing it, 2500–3000ms is a one-character change.
- **Should the toast be tap-to-dismiss?** Sonner supports it natively (swipe up / tap). Default is on. Not configured explicitly in V5; if it ever becomes a complaint, an explicit `dismissible: true` on the call would be the fix.

---

## Resolves from V4

V4's lessons doc left this as an open question:

> Should Resume after a long pause surface a "Workout saved as partial" toast when the click-time reconciler returns non-fresh? Currently, the CTA silently disappears and today's count / streak update. The user might wonder where their Resume button went.

V5 answers: yes, but branch-aware, no action, 2 seconds, top-center, scoped to this one branch only. The other two converging paths (Discard, passive-stale) stay deliberately silent for the reasons in Angle 1.

---

## TL;DR

- V5 fills the click-time-stale UX gap V4 left open: a 2-second top-center toast that acknowledges the Resume tap when the click-time reconcile returns non-fresh, without disturbing Discard or passive-stale flows.
- Branch-aware wording (`"Workout timed out — saved to history"` for `reconciled-*`, `"Workout timed out"` for `none`/`discarded`) costs a discriminated-union check and avoids a small lie on the branches that didn't actually write anything.
- An exhaustive `switch` with a `never` default future-proofs the wording site against new `ReconcileResult` arms; a shared toast `id` collapses rapid double-taps into one notification.
- Wiring Sonner into TanStack Start was one import and one render in `__root.tsx`; the only fiddly part was `mobileOffset` with a safe-area-inset calc so the toast doesn't clip under the iOS dynamic island on a `viewport-fit=cover` PWA.
- The rubber-duck pass surfaced a pre-existing V4 multi-tab race (`onResume`'s reconcile isn't scoped to `resumable.runId`); V5 doesn't make it worse but doesn't fix it either — deferred to its own slice.

— Goodfellow
