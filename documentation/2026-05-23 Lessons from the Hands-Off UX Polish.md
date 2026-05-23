# Lessons from the Hands-Off UX Polish

**Date:** 2026-05-23
**Case:** Two small P1 gaps — a stronger screen wake lock and `navigator.vibrate` cues on phase transitions — that share a single underlying theme: **the workout happens away from the screen.** During a plank or a burpee, the user's eyes and hands are elsewhere. The phone has to keep the screen alive when they look back, and surface state through a non-visual channel when they don't. Two small commits, but they sit on the boundary between browser APIs that look simple and browser realities that aren't.

---

## The case in three sentences

The app already had a one-shot `navigator.wakeLock.request("screen")` call in the workout mount effect, but no recovery path — the OS auto-releases the lock the first time the document goes hidden (tab switch, phone call, screen-off), and after that the screen dims for the rest of the workout. The app also had no haptic feedback at all, so on a device in your pocket or face-down on the floor, the audio cues were doing all the work. Both fixes are short — under 150 lines combined — but they require understanding revocation events, the asymmetry between visibility and acquisition, and the platform reality that iOS Safari implements neither `navigator.vibrate` nor the audit pattern most fitness apps assume.

---

## Angle 1 — The "fire-and-forget acquire" trap

The pre-fix code looked roughly like this:

```ts
useEffect(() => {
  navigator.wakeLock?.request("screen").then(
    (lock) => { wakeLockRef.current = lock; },
    () => {},
  );
  return () => { wakeLockRef.current?.release().catch(() => {}); };
}, []);
```

This is a *category* of bug, not a one-off. Every browser API that hands you a *handle to a resource the OS can revoke* has this shape, and every one needs the same answer: pair the one-shot acquire with the matching revocation event. Members of the family include:

| API | Acquires | OS revokes when |
|---|---|---|
| `navigator.wakeLock` | `request("screen")` returns a sentinel | Document hidden, low battery, manual OS lock |
| Geolocation `watchPosition` | Watcher ID | Permission revoked, sleep, GPS off |
| `AudioContext` | `new AudioContext()` | Tab backgrounded too long (Chrome auto-suspends) |
| `getUserMedia` | Stream returned | Another tab takes the camera, permission revoked |
| Persistent storage | `navigator.storage.persist()` | Quota pressure, OS-level cleanup |

The trap is that the *acquire* call returns successfully so the code feels like it worked. The OS-driven revoke arrives silently. By the time the user notices the screen dimming, you have a stale ref pointing at a dead sentinel and your `if (sentinel) return;` guard is now lying — it says "we have a lock" when in fact we lost it ten minutes ago.

**The pattern that fixes the whole family**: every acquire of a revocable resource needs (a) a way to be told the resource is gone, and (b) a way to ask for it again. Not having both is a slow-motion bug.

---

## Angle 2 — Two listeners tell different sides of the same story

The fix listens to two events that look superficially similar but mean different things:

```ts
document.addEventListener("visibilitychange", onVisibilityChange);  // "I want a lock again"
lock.addEventListener("release", () => { sentinel = null; });        // "the lock you had is gone"
```

It's tempting to listen to only one. Both are necessary:

- **Without `release`**, the stored `sentinel` ref stays non-null after the OS takes the lock away. Then on the next visibility-change, the `if (sentinel) return;` guard in the `acquire` function fires and we never re-request.
- **Without `visibilitychange`**, we'd know the lock is gone but never try to ask for a new one.

The two events are conjugate: `release` is *observation* (something just happened to my state), `visibilitychange` is *intent* (I want a fresh acquire attempt now that we're back in foreground). Most resource-management code in browsers has this same observation/intent split somewhere. When you see only one of them wired up, the bug is almost always next door.

---

## Angle 3 — Async acquires need two concurrency guards, not one

The fix uses two flags around the in-flight request:

```ts
let cancelled = false;   // set in the cleanup function
let inFlight = false;    // set around the await

const acquire = async () => {
  if (cancelled || sentinel || inFlight) return;
  inFlight = true;
  try {
    const lock = await api.request("screen");
    if (cancelled) { lock.release().catch(() => {}); return; }
    sentinel = lock;
    // ... wire up release listener
  } finally {
    inFlight = false;
  }
};
```

The two flags close two different windows:

1. **`inFlight`** closes the *re-entry* window. Between `await api.request(...)` and the line that stores the sentinel, a second `acquire()` call (from a `visibilitychange` event, say) would otherwise issue a second request. We'd get two sentinels, the second one wins the assignment, and the first one leaks — the OS keeps the screen on but our ref points at the wrong handle, so cleanup releases only one.

2. **`cancelled`** closes the *unmount-during-request* window. The component can unmount while the `await` is still pending. When the request later resolves, `sentinel = lock` would set a ref on a torn-down component, *and* the cleanup function has already run — so the new lock will never be released. Slow battery drain. The `cancelled` check catches this case and releases the just-arrived lock immediately.

These are different bugs with different symptoms (one is a leak per visibility-change, one is a leak per unmount), but they have a shared shape: **state that lives across an `await` boundary needs a guard at both ends of the boundary.** This generalizes — any time you `await` inside a React effect or event handler, ask yourself "what could have happened to the world while I was suspended?"

---

## Angle 4 — Cue density is a UX decision, not just an engineering one

The audio module already had four named cues: `tickBeep` (the 5-4-3-2-1 countdown), `startBeep`, `restBeep`, `finishBeep`. The naive translation to haptics would be: "add a `vibrate()` next to every beep call." That's wrong.

What I shipped fires haptics at three sites — `startBuzz`, `restBuzz`, `finishBuzz` — and *deliberately not* on the tick countdown. The reasoning:

- A buzz every second for five seconds, then every 25 seconds during work, then every 5 seconds again, is the pattern that makes users disable notifications app-wide. Cue fatigue is real and reversible — once a user mutes you, they don't come back to flip it on.
- The auditory tick already covers the countdown. Haptics are a *redundant* channel for things audio already conveys at appropriate density, not an *additional* channel layered on every audio event.
- Phase changes (work-→-rest, rest-→-work, last-rep-→-done) are the moments when the user actually has to *change what they're doing*. That's where the buzz earns its keep — the signal carries information the user acts on, not just information.

The principle generalizes: **pick cue moments where the signal changes the user's behavior, not every moment you *could* fire.** Density of notifications and density of useful information are unrelated quantities; conflating them is how apps end up either annoying or ignored.

---

## Angle 5 — iOS Safari has no haptics, and that's the design constraint

`navigator.vibrate` is one of the largest open gaps in the mobile web platform. It works on Android Chrome, Firefox for Android, Samsung Internet. It does **not exist** on iOS Safari — not "asks permission first," not "needs a flag," but `typeof navigator.vibrate === "undefined"`. Apple has held this position for over a decade, citing battery and abuse concerns; the Web Apps Working Group has had open issues about it since 2014. There is no polyfill that doesn't require a native shell (Capacitor, Cordova) because the underlying motor APIs aren't exposed.

What this means in practice:

- **Feature-detect every call**, silently. The hook does `if (typeof nav.vibrate !== "function") return;` and that's the entire iOS branch.
- **Audio must remain the load-bearing feedback channel** — it's the only one available on every target. Anything that's "you'll feel it when X happens" without a paired audio cue means iPhone users won't get it.
- **Test on both platforms or accept asymmetric experiences as a permanent design constraint.** This app explicitly does the latter; iOS users still get the beep + TTS + screen, just not the buzz. That's a defensible choice when the haptic is a redundancy enhancement rather than the primary channel.

A useful mental model: treat `navigator.vibrate` as a *Progressive Enhancement* in the precise CSS-historical sense. Build the experience without it, then add it as a bonus on the platforms that have it. Never the other way around.

---

## Angle 6 — Parallel modules buy a cheap seam for a future settings page

The haptics work could have lived inside `audio.ts` — it's small, it fires at the same moments, the alternative requires one more `import`. I split it into `src/lib/haptics.ts` with parallel-named exports (`startBuzz` next to `startBeep`, `restBuzz` next to `restBeep`, etc.).

The reason isn't aesthetics — it's that the very next requested feature ("a mute toggle for the workout") almost certainly wants *independent* controls. Audio annoys in shared spaces; haptics annoy in quiet meetings. A user who's at a coffee shop might want haptics-only; a user with a sleeping kid might want neither. The realistic settings UI is two toggles, not one.

With the modules split, adding that becomes:

```ts
// src/lib/haptics.ts
function vibrate(pattern: number | number[]) {
  if (getSettings().haptics === false) return;
  // ... existing implementation
}
```

One module, one location, one change. With audio and haptics fused, the same feature is a refactor: extract the haptic calls back out, decide where the guard goes, change every existing call site. **The cost of premature separation here is one extra import; the cost of premature fusion is a refactor under feature-pressure.** When two things share call sites today but are likely to be controlled separately tomorrow, separate them today.

---

## Patterns

- **Acquire + revoke event together.** Any browser API that hands you a revocable handle needs both an acquire call and a revoke listener. If you only have one, the other is the bug.
- **Observation vs. intent listeners.** Resource events come in conjugate pairs — one says "your state changed," one says "I want to drive new state." Wire both.
- **`inFlight` + `cancelled` around any `await` in an effect.** The world can change at both ends of an `await`. Two flags, two windows.
- **Audio and haptics share a beat.** When both feedback channels fire at the same moment, the cadence should match. `finishBeep` plays three rising tones; `finishBuzz` is a three-pulse pattern with matching gaps. The feedback feels intentional rather than coincidental.
- **Parallel modules for parallel concerns.** When two things share call sites today but are likely to be controlled separately tomorrow, separate them today. The cost is one import.
- **Progressive enhancement, in the original sense.** Build the experience to be complete without optional APIs (vibrate, wake lock, speech synthesis), then layer them on as bonuses.

---

## Antipatterns

- **One-shot `request()` in a mount effect.** If the resource has a revocation event, this is always wrong. Today it works, tomorrow it doesn't, you won't notice for a week.
- **`if (sentinel) return;` without a `release` listener.** The guard lies as soon as the OS revokes out from under you. Always pair the early-return guard with a path that resets it to `null`.
- **One buzz per beep.** Cue density is a UX decision. The naïve mirror-everything approach is how apps train users to mute notifications.
- **Treating `navigator.vibrate` as universally available.** It is not on iOS. Feature-detect, always, and never make the user-facing experience require it.
- **Throwing audio and haptics into one module "for now."** When the settings page lands, you'll regret it. Cheap to separate; expensive to extract.

---

## Open questions

- **Should rest also re-acquire the wake lock more aggressively?** The current implementation re-acquires on `visibilitychange → visible`. If a user has the screen *visible* but idle for longer than the system's user-presence timeout, some platforms may still dim. Worth testing on a real device for the longest interval (work=30s, rest=10s) over a full round.
- **Is the `finishBuzz` pattern long enough?** `[200, 100, 200, 100, 400]` = ~1 second total. On wrist-worn haptics that's plenty; on a phone in a pocket during a heavy breath, it's possible the user misses the first pulse. May need a softer-but-longer ramp for the "you're done" celebration.
- **Should haptics be louder during the last 3 ticks?** I deliberately skipped tick haptics — but the case for *only* the last three (when the user is most likely looking away because they're at the end of an exercise) is real. Holding off until there's evidence one way or the other.
- **Where does the mute toggle live?** Settings page (none exists yet), a button on the workout screen, or a toggle on the home screen? Different placements imply different mental models. Worth designing on paper before implementing.

---

## TL;DR

- Wake lock and haptics look like one-line API calls. They aren't, because (a) the wake lock has a revocation lifecycle the OS drives, and (b) `navigator.vibrate` simply does not exist on iOS.
- The wake lock fix is structural: an acquire is incomplete without a paired revocation listener, an `await` in an effect needs concurrency guards at both ends, and `visibilitychange` is the "I want a new acquire" signal that pairs with the sentinel's `release` event.
- The haptics shipped at three phase boundaries — not on tick countdowns — because cue density is a UX decision, not just an engineering one.
- iOS Safari has no haptic API at all. Audio remains the load-bearing feedback channel; haptics are progressive enhancement layered on Android.
- Splitting `haptics.ts` from `audio.ts` cost one extra import and bought a cheap seam for the future independent-mute settings toggle.

— Goodfellow
