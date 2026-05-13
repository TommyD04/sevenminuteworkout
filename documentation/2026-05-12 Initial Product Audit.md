# Seven-Minute Workout — Initial Product Audit

**Date:** 2026-05-12
**Auditor:** Goodfellow (acting as world-class mobile app designer + PM)
**App version audited:** https://sevenminuteworkout.lovable.app (live, viewport 390×844)
**Method:** Full hands-on walkthrough — home, routine details, workout flow (real + test), rest, pause, quit, completion, RPE rating, save, history (empty + populated), CSV export, PWA manifest, meta tags, console.

---

## TLDR

Real craft is visible — the visual system, the test-run mode, the RPE rating after a session, CSV export, the form-cue copy. But there are a handful of bugs and PWA gaps that would block this from feeling like a "real app" the moment a user refreshes or bookmarks. **Fix the deep-link crash and PWA install path first;** the rest is polish.

---

## 🔴 Bugs to fix now

1. **`/routine/<id>` is broken on direct load.** Open `sevenminuteworkout.lovable.app/routine/core` in a new tab — blank screen + `Invariant failed` in console. Same for `/classic` and `/advanced`. Works only when you navigate via the in-app link. **This means refresh, share, bookmark, and "Add to Home Screen → routine detail" all crash.** Classic Lovable/React-Router footgun: a hook is being called outside the router's context, or the route renders before route data is hydrated. Wrap the route in an error boundary and check whether the routine lookup is happening synchronously at render before params are resolved.
2. **Quit confirmation uses the native `window.confirm()` dialog.** Looks like a browser, not your app. Reads "sevenminuteworkout.lovable.app says…" — instant trust hit. Replace with an in-app modal.
3. **PWA install is half-wired.** Manifest has only one icon (`512×512`, marked `any maskable`). Chrome's PWA installability check wants a separate `192×192` and a separate `maskable` icon. No service worker is registered — so no offline workouts, which is the *entire point* of a workout PWA (gym wifi is garbage).
4. **`og:title` is "Short Seven"** and `og:image` is the default Lovable preview. When someone texts the link to a friend, the preview won't match the app. 5-minute fix, big compounding return.
5. **`viewport` has `user-scalable=no`.** Accessibility antipattern (WCAG 1.4.4) — blocks pinch-zoom for low-vision users. Remove it.

## 🟡 UX gaps worth fixing soon

- **No wake lock.** The `navigator.wakeLock` API is available — acquire it on workout start so the screen doesn't dim mid-plank. This is table-stakes for fitness apps.
- **No audio cue or haptics** at interval transitions. You have `AudioContext` and `navigator.vibrate()` available. A 3-2-1 beep + a buzz on phase change makes the app usable without watching. Add a mute toggle.
- **"Test run" doesn't actually speed up the intervals** — still 30s work. Either shorten test intervals to ~5s so it's a fast preview, or rename it "Practice run" so the label matches behavior.
- **Quitting a workout discards everything.** "Progress won't be saved" with no Strava-style "save partial" path. People bail at minute 5 of a 7-min workout *all the time* — let them keep the round.
- **Skip is rate-limited** (~400ms between presses). Feels sluggish. Either remove the debounce or animate the transition so the lag reads as "polished" instead of "stuck".
- **Rest screen reuses the previous exercise's icon.** You already say "Up next: Bicycle Crunches" — show the bicycle icon too.
- **Home pill ≠ Today's round.** "Today: 1 round" + the selected pill says "The Classic 7" but I actually did Core. Either show the routine in the Today card or move the pill selection visually further from the recap.
- **"M" in the 7-day calendar renders in magenta** for no apparent reason. Either it's a bug or an unlabeled feature. Both are bad.

## 🟢 What's working — keep it

- The visual system (mono-accent green + dark + the period accent on every heading) is genuinely distinctive. Don't dilute it.
- **Three routines, no more.** Hick's Law — you nailed the right number. The moment you add a fourth, you'll need a different picker.
- **CSV export from history.** This is the kind of "we trust our user" move that earns loyalty. Most apps would gate it.
- **Local-only storage.** No login, no email, no friction. For a workout timer, this is correct.
- **Form-cue copy is coaching, not filler** ("Lean back, rotate from the ribs not the arms"). This is the highest-leverage content in the app.

---

## Patterns & antipatterns worth internalizing

- **Native dialogs are an antipattern in app shells.** `alert/confirm/prompt` reveal the browser hiding behind your UI. Always build in-app modals.
- **Fitts's Law:** Primary action goes where the thumb naturally rests — bottom center, large, visually heavy. Your "Start workout" CTA does this correctly. Don't ever shrink it.
- **Two-step destructive actions:** Sweaty hands in a gym misfire taps. For quit/delete/reset, prefer either (a) a confirmation modal or (b) a long-press. You already do (a) for quit — good. Apply same logic before adding a "Clear history" button.
- **Splash flash:** `manifest.background_color` should match the first painted frame's background, not just be "close." Yours is `#1a1f2e` but the app paints darker. Result: a perceptible flash on PWA launch.
- **Empty states should always sell the next action.** Your history empty state says "Nothing here yet" — but no CTA back to Start. Always give the user the path forward.
- **Streaks are a sharp tool.** Powerful for habit, brutal when broken. Before leaning hard into streak UI, decide if you want "streak freeze" tokens (Duolingo) or a rolling 7-day visualization that's harder to fully "lose" (which is what you already have — keep it).
- **Don't over-design the workout view.** The timer ring + countdown + exercise + pause is the right minimum. Resist adding leaderboards, social, AI coaching here. The strength of a 7-min workout app is that it's a 7-min workout app.

---

## If I had a one-week sprint

1. Fix `/routine/*` invariant crash + add an error boundary.
2. Register a service worker, fix manifest icons (192 + 512 + maskable), set proper OG metadata.
3. Wake lock + simple beep/vibrate on interval change + a mute toggle.
4. Replace native `confirm()` with an in-app modal.
5. "Save partial workout" path on quit.

That's a small list, but if you ship it, this stops feeling like "an app built with Lovable" and starts feeling like a real product.

---

## Appendix — Evidence

| Finding | Source |
|---|---|
| `/routine/*` deep-link crash | Console error `Invariant failed` at `index-B2INyYs6.js:10:41243` on direct nav to `/routine/core`, `/routine/classic`, `/routine/advanced` |
| Native confirm dialog | Triggered by tapping X in workout view; dialog text: "Quit this workout? Progress won't be saved." |
| Manifest gaps | `/manifest.json` → single icon `{ "src": "/icon-512.png", "sizes": "512x512", "purpose": "any maskable" }`, no SW registered (`navigator.serviceWorker.controller === null`) |
| OG metadata mismatch | `og:title = "Short Seven"`, `og:image` points to `pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/...lovable.app-...png` |
| Viewport blocks zoom | `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">` |
| Storage shape (good) | `localStorage["seven-min-sessions-v1"]` = JSON array of `{id, completedAt, durationSeconds, difficulty, routineId, routineName}` |
| Test run still uses 30s intervals | Observed in `/workout?test=true&routine=core` — counter started at 30, banner read "TEST" but timings unchanged |

---

## Update — 2026-05-13: PWA finding reframed

While auditing the repo for secrets before flipping it public, I re-read [`.lovable/plan.md`](../.lovable/plan.md) — the original prompt-to-plan output Lovable generated for this project. Line 57:

> Manifest-only installability: `manifest.json` + apple-touch-icon + `apple-mobile-web-app-capable` meta. **No service worker** (per Lovable PWA guidance — avoids preview/cache issues; you still get the home-screen icon and fullscreen launch)

**The missing service worker isn't an oversight — it's a deliberate Lovable design choice.** That doesn't invalidate the audit finding, but it reframes the question:

| Original audit framing | Better framing |
|---|---|
| "Register a service worker to fix the broken PWA install" | "Decide whether we want offline support — and if so, accept the SW complexity that comes with it" |

**What the no-SW choice gives us today:**
- ✅ Simpler mental model — no cache invalidation hell
- ✅ Changes ship immediately — no SW update dance during dev
- ✅ "Add to Home Screen" + fullscreen launch works on both iOS and Android

**What it costs us:**
- ❌ No offline support — a workout app in the gym (sketchy wifi) is the actual canonical offline use case
- ❌ Chrome's "Install app" prompt won't fire (Chrome requires SW + maskable icon + scope rules to qualify)
- ❌ No precaching → slower repeat visits
- ❌ Locks out future capabilities like background sync and push notifications

**The decision worth making:** is the offline-in-the-gym use case strong enough to take on the SW complexity? Or is "open the app on wifi, then work out without losing state" sufficient? This is worth **shaping properly** before just adding a service worker.

**Lesson to internalize:** *before fixing a "missing" thing, find out whether it was missed or removed on purpose.* The same artifact looks like a bug from one angle and a design choice from another. Read the prior author's notes before assuming oversight.

The roadmap has been updated to reflect this as an investigation, not a fix.
