# Lessons from the PWA Offline Arc

**Date:** 2026-05-23
**Case:** Four small commits shipped over a few sessions that took the app from "a website that happens to run on a phone" to "a phone-shaped app that survives a flight to Hawaii and tells you when it's been updated." Worth dwelling on because — for one of the first times on this project — I broke a piece of work into vertical slices on purpose, used a rubber-duck pass to catch real bugs before writing code, and saw the same patterns (snapshot-at-boot, content-hashed everything, SSR boundaries) show up at every layer.

---

## The arc in four sentences

V1 ([4278080](https://github.com/TommyD04/sevenminuteworkout/commit/4278080)) shipped the icons and manifest colors needed for the app to be _installable_ without a white-flash splash. V2 ([ba8402d](https://github.com/TommyD04/sevenminuteworkout/commit/ba8402d)) added a handwritten service worker that cached pages and assets on the fly, so any previously-visited route worked offline. V3 ([696e87d](https://github.com/TommyD04/sevenminuteworkout/commit/696e87d)) added a build-time precache manifest so even routes the user _never_ visited worked on a cold-start offline. V4 ([b136525](https://github.com/TommyD04/sevenminuteworkout/commit/b136525)) closed the loop with an in-app "A new version is available — Reload" banner, because without that, the new SW politely waits for every tab to close before activating, which in practice never happens.

---

## Angle 1 — Engineering: the PWA mental model decomposes into three things

I used to think "PWA" was one big box. It's actually three small ones:

| Ingredient                                  | Purpose                                                                    | This project's instance                                              |
| ------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `manifest.json`                             | Tells the OS "I'm an app — name, icon, colors, scope"                      | `public/manifest.json`                                               |
| Icons (multiple sizes + a maskable variant) | What the home screen, splash, and tab actually show                        | `public/icon-{192,512,maskable-512}.png`, `apple-touch-icon-180.png` |
| Service worker                              | A JS file the browser runs out-of-band that can intercept network requests | `public/sw.js`                                                       |

Each is independently meaningful. You can ship just the manifest and have an installable-but-not-offline app. You can ship just a SW and have an offline-but-not-installable app. You can ship all three and still have a forgettable app if you don't think about updates (which is what V4 is about).

**Heuristic worth keeping:** _before working on a black-boxed concept, list its parts._ "PWA" had three. "Viewport meta tag" had four tokens. "TanStack Start" has a router, a server entry, a serialization boundary, and a build plugin. When the name is the box, the parts are the work.

---

## Angle 2 — Engineering: the service worker lifecycle is the whole game

The SW spec is small but the lifecycle is non-obvious. The states you have to internalize:

```
download → installing → installed (waiting) → activating → active → redundant
```

The events that fire in those transitions are the entire developer API surface:

| Event                                             | Fires when                            | What we use it for                                   |
| ------------------------------------------------- | ------------------------------------- | ---------------------------------------------------- |
| `install`                                         | New SW first downloaded               | Pre-populate caches (V2 app shell, V3 full precache) |
| `activate`                                        | New SW takes over                     | Purge old `workout-pwa-*` caches + `clients.claim()` |
| `fetch`                                           | Every page request goes through       | NetworkFirst for HTML, CacheFirst for assets         |
| `message`                                         | Page posts to SW                      | V4's `SKIP_WAITING` handshake                        |
| `updatefound` (on the registration)               | Browser detected a new SW byte stream | V4's "show the banner" trigger                       |
| `statechange` (on a worker)                       | Worker moved through its lifecycle    | V4 listens for `state === "installed"`               |
| `controllerchange` (on `navigator.serviceWorker`) | Active SW for this page changed       | V4's reload-on-takeover hook                         |

The "waiting" state is the central UX problem of PWAs. By default, a freshly installed SW _will not activate_ while any tab is open under the old one. The browser is being conservative — it doesn't want to swap your JS out from under a running page. But "every tab closes" essentially never happens for an installed PWA. So without `skipWaiting()` _and_ a way to tell the user "hey, click this," your users silently run stale code for days.

**Heuristic worth keeping:** _the conservative default in a spec is often a usability bug at the application layer._ The spec is right to be careful. The app has to be the layer that gives the user the steering wheel.

---

## Angle 3 — Architecture: build-time / runtime split with a hashable seam

V3's plugin is 115 lines and does one thing: walk `dist/client/`, list the URLs, hash them, and substitute two tokens in `public/sw.js`:

```js
const VERSION = "__SW_VERSION__"; // → "cf51e8fc259f"
const PRECACHE = ["__PRECACHE__"]; // → ["/", "/assets/index-XYZ.js", …]
```

Two pieces of leverage here that generalize:

**1. Make templates valid versions of themselves.** Both placeholders are _already_ valid JavaScript before substitution. `"__SW_VERSION__"` is a valid string literal; `["__PRECACHE__"]` is a valid one-element array. The build plugin _refines_ them; it doesn't make them valid. That means `public/sw.js` lints clean, runs in dev if we ever needed it to, and is editable as a regular file. Anytime your template is broken without the templating engine, you've introduced a debugging surface for no reason.

**2. Hash the manifest, not the timestamp.** The 12-char sha256 is computed over the precache _list_, not over wall-clock time or the git SHA. That means:

- Asset changes → list changes → hash changes → SW byte stream changes → browser sees an update.
- Doc-only commits → asset list unchanged → hash unchanged → no spurious SW update.

The hash _is_ the invariant you want the browser to react to. Timestamps and SHAs are proxies that drift apart from intent.

The same primitive (content hash) shows up at _two_ layers in this stack: Vite hashes individual asset filenames (`index-Bx7Yh2.js`), which is what makes a CacheFirst SW strategy safe; the plugin hashes the _list_ of those filenames, which is what makes the SW versioning correct. Same idea, nested.

**Pattern worth keeping:** _prefer a content hash over wall-clock or revision identity for any "did this actually change?" gate._

---

## Angle 4 — Engineering: SSR-safety as recurring texture, not a one-time gotcha

This is the third lessons doc on this project where SSR has been the thing that bites. The [Routine Deep Link Crash](./2026-05-12%20Lessons%20from%20the%20Routine%20Deep%20Link%20Crash.md) was about serializing icons across the SSR boundary. The [viewport one](./2026-05-15%20Lessons%20from%20Removing%20user-scalable%3Dno.md) was about a default in the SSR'd HTML. This one was about not registering a service worker on the server (because `navigator` doesn't exist there) and not running the Vite plugin on the SSR build pass (because it would re-stage and overwrite the already-substituted client SW).

The constraint shows up at three concrete points in V1-V4:

1. **`useEffect` guards every browser API touch.** `src/hooks/use-service-worker.ts` does _all_ its `navigator.serviceWorker` work inside a `useEffect`. If we put it at the module level we'd crash the SSR pass.
2. **`if (import.meta.env.DEV) return;`** isn't an SSR check, but it's the same shape — bail out in the environments where the code isn't meant to run.
3. **`vite-plugin-sw.ts` checks `this.environment?.name`** and bails on anything that isn't `"client"`. TanStack Start runs `closeBundle` twice (once per environment); without the check, the SSR pass would re-read a fresh copy of `public/sw.js` from source and clobber our substituted output.

**Pattern worth internalizing:** _"runs on the server" and "runs in the browser" are different execution contexts in this codebase, and every cross-context boundary needs a gate._ The gate is sometimes `useEffect`, sometimes `typeof window === "undefined"`, sometimes a Vite environment check, sometimes a `*.server.ts` filename — but it's always a deliberate choice. When you forget to choose, you get a build that "just works" until the day someone hits the path you didn't think about.

---

## Angle 5 — Process: vertical slicing of infrastructure work

The thing I'd done wrong on this kind of work in the past is what I'll call **The Iceberg PR**: a single 700-line commit titled `feat: add PWA support` that adds the manifest, the icons, the SW, the precache, _and_ the update banner all together. It's a nightmare to review. It's a nightmare to revert. And if any one piece is wrong (say, the SW is over-aggressive about caching) you can't peel just that piece off.

V1–V4 were deliberately _vertical_: each commit is on its own _shippable_, _demonstrable_, and _reversible_.

| Slice | What ships             | Demonstrable how                                                     |
| ----- | ---------------------- | -------------------------------------------------------------------- |
| V1    | Icons + colors aligned | "It installs, splash flows into app"                                 |
| V2    | Cache-on-fetch SW      | "Visit `/history`, go offline, refresh — works"                      |
| V3    | Build-time precache    | "Install, go offline, navigate to a route you never visited — works" |
| V4    | Update banner          | "Deploy a change, banner appears, click reload — new code"           |

Each slice was self-contained enough to commit with a real message, and each one moved a user-observable property from one state to another. None of them were "scaffolding for the next step" without delivering value of their own.

**Heuristic worth keeping:** _infrastructure work is the most tempting case for The Iceberg PR, and it benefits most from vertical slicing because each layer has a real failure mode you want to learn from in isolation._ If V3's precache had bricked the SW install, V2 would still have been working — we could have rolled back V3 without losing V2.

---

## Angle 6 — Process: the rubber-duck pass before writing code

For V4, before touching any file, I wrote down the plan and gave it to the rubber-duck agent. It came back in under a minute with two real bugs I had not seen:

1. **Multi-tab gap.** My original plan attached a `controllerchange` listener at _click time_ inside `applyUpdate()`. That meant only the tab the user clicked in would reload; other tabs would silently get claimed by the new SW and keep running old JS against new caches. The fix was to install one persistent listener at mount, gated on a `wasControlled` snapshot — which gives multi-tab reload for free.
2. **Stale `waitingRef`.** I was stashing a reference to the `ServiceWorker` at `statechange === "installed"` and using that ref at click time. But that worker can be _replaced_ between stash and click. The fix: read `registration.waiting` live at click time, fall back to the stashed ref.

The duck also pointed at three real polish items I'd have shipped without: `isApplying` state for double-click guard; `role="status" aria-live="polite"` for screen reader announcement; a fallback `setTimeout` in case `controllerchange` never fires.

Cost: one tool call, maybe 90 seconds of reading. Counterfactual: probably 30 minutes of "why is tab B showing the wrong icon" debugging _after_ shipping.

**Pattern worth keeping:** _for any non-trivial change, get an independent critique on the plan before writing code._ The earliest moment is the cheapest moment. Once code exists, every fix carries some "but I just wrote that" friction.

---

## Angle 7 — Engineering: cross-tab consistency is free if you pick the right primitive

I had assumed multi-tab support would need explicit coordination — a `BroadcastChannel` or an `onstorage` listener that tells siblings to reload. It doesn't. `controllerchange` is _already_ broadcast: when `skipWaiting() + clients.claim()` activates the new SW, the event fires in every controlled tab simultaneously. The whole multi-tab reload reduces to:

```ts
const wasControlled = !!navigator.serviceWorker.controller;
navigator.serviceWorker.addEventListener("controllerchange", () => {
  if (wasControlled) window.location.reload();
});
```

Each tab makes its own decision based on its own snapshot. Zero coordination code.

The general shape: **before adding a coordination mechanism, check whether the underlying primitive already broadcasts.** Sometimes the platform did the work for you and is just waiting for you to use it.

The `wasControlled` snapshot is also worth flagging on its own. It's a tiny pattern — _take a measurement at boot, compare on event, decide based on the diff_ — that recurs everywhere: distinguishing "user changed the URL" from "router changed the URL," distinguishing "first install" from "update," distinguishing "this is a re-render" from "this is a route change." Snapshot at mount; compare on event; one bit of state, no race.

---

## Angle 8 — Engineering: custom 115-line plugin > heavy dep when the integration surface is weird

V3 could have been two lines of `vite-plugin-pwa` (Workbox under the hood). I deliberately wrote a custom plugin instead, for two reasons:

1. **Our config base is `@lovable.dev/vite-tanstack-config`,** which already opinions on plugins, environments, build order, and the Cloudflare adapter. Any third-party plugin that registers itself with assumptions about a vanilla Vite setup risks fighting that base in ways that are expensive to debug. The plugin we wrote does one thing and asks for one extension point.
2. **A 115-line file is _readable in one sitting_.** If V3 misbehaves, the entire substitution path is right there. Workbox has more code than this entire app.

**Heuristic worth keeping:** _the right "build vs buy" answer for tooling depends on the integration surface, not the feature surface._ A library that does 10× what you need can still be the wrong choice if integrating it costs more than reimplementing the slice you actually use.

This isn't an anti-library stance — it's a "match the dependency cost to the project's tolerance for it" stance. For a hobby project where the cost of debugging a build plugin conflict is "an afternoon I wanted to spend differently," a small custom plugin wins.

---

## Patterns and antipatterns to recognize next time

### Patterns ✅

- **Decompose black-box concepts into parts.** "PWA" is three things. "SW lifecycle" is six events. List them; reason about them individually.
- **Vertical-slice infrastructure work.** Each slice ships, each slice is demonstrable, each slice can be reverted without losing the others.
- **Make templates valid versions of themselves.** Substitution narrows; it shouldn't activate.
- **Content-hash the thing whose identity matters.** Hash the precache list, not the timestamp. Hash the asset content, not its slot in the bundle.
- **Snapshot at boot, compare on event.** `wasControlled` is one instance. The pattern is everywhere.
- **Check whether the primitive already broadcasts.** Before adding coordination, see if the platform did the work for you.
- **Rubber-duck the plan, not just the implementation.** The earliest moment is the cheapest.
- **SSR-boundary gates everywhere browser APIs are touched.** `useEffect`, env checks, `*.server.ts` filenames — the gate is contextual; the discipline is universal.
- **Self-announcing UI needs `role="status" + aria-live="polite"`.** Unsolicited screen reader announcements without focus theft.
- **Fallback timeouts for any "wait for an event that should fire."** If the user took an action, honor it even if the event you were waiting on goes missing.

### Antipatterns ❌

- **The Iceberg PR.** "Add PWA support" in one commit. Three layers of regressions, no roll-back granularity, painful review.
- **Coordination code where the primitive broadcasts.** Adding `BroadcastChannel` when `controllerchange` already does the work.
- **Stashing a reference at event time and trusting it at click time.** The thing can be replaced in between.
- **Wall-clock or revision identity used where content identity is what you mean.** Spurious updates, real updates missed.
- **A template that's broken without its templating engine.** Two debugging surfaces for the price of one.
- **Heavy dep with weird integration surface, picked for ergonomic feature parity.** The integration cost is the dependency cost.

---

## Open questions for next time

1. **V5 — stale-while-revalidate for cross-origin Google Fonts.** The current SW passes cross-origin requests through. Worth caching with SWR so fonts render offline on cold boot. Small slice; should be one commit.
2. **Update banner copy.** "A new version is available" is fine but bland. Worth experimenting with copy that signals _what_ changed — but only if we can do that without a manifest of release notes the user has to read.
3. **What's the right cadence for `registration.update()`?** Browsers auto-check the SW byte stream periodically (every 24h, plus on each navigation). For a hobby app that's fine. For an app where deploys are more frequent, a manual `reg.update()` on tab focus would shorten the latency from deploy to banner-shown.
4. **Telemetry temptation.** It would be useful to know "how often is the banner shown vs clicked?" — but adding telemetry would compromise the no-account, no-tracking promise of this app. Worth being deliberate about _not_ adding it, and writing down why.
5. **Are there other "the platform default is conservative for safety, but the app needs to surface it" patterns lurking?** The `beforeunload` warning is one. Wake locks (in the roadmap) are another. Maybe worth a pass.

---

## TL;DR — what to carry forward

- **A PWA is three things: a manifest, icons, and a service worker.** Each ships independently.
- **The SW "waiting" state is the central UX problem of PWAs.** The browser default is correct and conservative; your app has to give the user the steering wheel.
- **Vertical-slice infrastructure work.** V1→V2→V3→V4. Each slice ships. Each slice is reversible.
- **Content-hash the thing whose identity matters.** Same primitive at every layer.
- **Make templates valid versions of themselves.** Substitution narrows; it doesn't validate.
- **Snapshot at boot, compare on event.** One-line pattern that fixes whole classes of "first time vs update" bugs.
- **Check whether the primitive already broadcasts.** `controllerchange` is multi-tab reload for free.
- **Rubber-duck the plan before writing code.** Two real bugs caught in V4 at zero implementation cost.
- **SSR-boundary discipline is the texture of this codebase, not a one-time gotcha.** Three lessons docs in a row have touched it. There will be more.
- **Custom small code beats heavy dep when the integration surface is weird.** 115 readable lines >> a feature-complete library you can't debug.

— Goodfellow
