# Seven Minute Workout

A small, opinionated take on the [Scientific 7-Minute Workout](https://www.nytimes.com/2013/05/12/magazine/the-scientific-7-minute-workout.html). Three routines, a clean phone-first UI, local history. No accounts, no telemetry, no ads.

**Live:** https://sevenminuteworkout.lovable.app

---

## How this came to be

A recent Sunday afternoon, I had an hour to kill at a coffee shop while my wife was in a class across the street. My son had been pushing me to start working out again — I'd paused after a serious injury last fall, and even though I'm mostly recovered, restarting the habit has been hard.

On a whim, I vibe-coded this PWA from my iPhone using [Lovable](https://lovable.dev). I had strong opinions about the design and performance, and was learning my way through everything else.

I'm happy with where the user experience landed. I've decided to use the project as a chance to **go deeper** — learn the stack underneath, sharpen the rough edges, write down what I learn along the way. Everything — the audit, the bugs, the design decisions, the rough edges — lives in [`documentation/`](./documentation). Read along. Disagree with me. Open issues.

If you're here just to do a 7-minute workout: tap a routine and go.

As of writing, I still haven't resumed working out.

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

| Layer | Choice | Why I picked it (or what I'm learning) |
|---|---|---|
| **Framework** | [TanStack Start](https://tanstack.com/start) | Modern full-stack React with SSR. Lovable chose it; I'm sticking with it for the SSR learning. |
| **Router** | [TanStack Router](https://tanstack.com/router) | File-based routes under `src/routes/`. Type-safe. Loaders and `beforeLoad` are the SSR-aware primitives. |
| **UI** | React 19 + [shadcn/ui](https://ui.shadcn.com) + [Tailwind 4](https://tailwindcss.com) | Component primitives copied into the repo, styled with Tailwind. Easy to modify without fighting a library. |
| **Icons** | [Lucide React](https://lucide.dev) | These were also the source of [the SSR crash that taught me about serialization boundaries](./documentation/2026-05-12%20Lessons%20from%20the%20Routine%20Deep%20Link%20Crash.md). |
| **Build** | [Vite 7](https://vitejs.dev) | Fast, well-supported, no opinions to fight. |
| **Runtime/PM** | [Bun](https://bun.sh) | See above. |
| **Hosting** | [Cloudflare Workers](https://workers.cloudflare.com) via Wrangler | Cheap, fast, edge-deployed. Configured in `wrangler.jsonc`. |
| **Storage** | `localStorage` | No backend. Everything's on-device. |

---

## Learning log

Reverse-chronological. Each entry links to longer-form notes where they exist.

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
- A PWA manifest that's *almost* installable but missing the 192×192 icon and a registered service worker.
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

The list below comes straight from the [initial audit](./documentation/2026-05-12%20Initial%20Product%20Audit.md). I'm working through it roughly in order of *reach × leverage* — i.e., things that affect the most users for the smallest amount of code, first.

### Now (P0 — bugs and basics)

- [x] **Fix `/routine/<id>` deep-link crash.** SSR was serializing icon components in the loader return. ([details](./documentation/2026-05-12%20Lessons%20from%20the%20Routine%20Deep%20Link%20Crash.md))
- [ ] **Make the PWA actually installable.** Add a 192×192 icon, a separate maskable icon, and register a service worker. Today Chrome rejects the install prompt.
- [ ] **Fix OG metadata.** `og:title` still says "Short Seven" and the OG image is the default Lovable preview. Shared links look generic.
- [ ] **Remove `user-scalable=no` from the viewport.** Accessibility regression (WCAG 1.4.4 — users must be able to zoom).
- [ ] **Replace the `window.confirm()` quit dialog** with an in-app modal styled to match the rest of the UI.

### Next (P1 — UX gaps)

- [ ] **Acquire a wake lock during workouts** so the screen doesn't dim mid-burpee.
- [ ] **Haptic feedback on phase changes** (`navigator.vibrate`) to back up the audio cues.
- [ ] **Make "Test run" actually do something.** Either shorten the intervals (5s work / 2s rest) or rename the option to be honest about what it does.
- [ ] **Save partial workouts on quit.** Right now quitting throws away the progress. At minimum: record that a session was started.
- [ ] **Fix the rest screen.** Currently shows the previous exercise's icon and label; should preview the *next* one.
- [ ] **Match the manifest `background_color` to the actual app background.** Today there's a visible color flash on PWA launch.

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
- The science: [Klika & Jordan (2013)](https://journals.lww.com/acsm-healthfitness/Fulltext/2013/05000/HIGH_INTENSITY_CIRCUIT_TRAINING_USING_BODY_WEIGHT_.5.aspx) — *High-Intensity Circuit Training Using Body Weight*.
- Everything that broke and taught me something: see [`documentation/`](./documentation).

---

## License

MIT. Build whatever you want with it.
