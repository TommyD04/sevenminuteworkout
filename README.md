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

- [ ] **Acquire a wake lock during workouts** so the screen doesn't dim mid-burpee.
- [ ] **Haptic feedback on phase changes** (`navigator.vibrate`) to back up the audio cues.
- [ ] **Make "Test run" actually do something.** Either shorten the intervals (5s work / 2s rest) or rename the option to be honest about what it does.
- [ ] **Save partial workouts on quit.** Right now quitting throws away the progress. At minimum: record that a session was started.
- [ ] **Fix the rest screen.** Currently shows the previous exercise's icon and label; should preview the _next_ one.
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
