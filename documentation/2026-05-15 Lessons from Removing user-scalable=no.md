# Lessons from Removing `user-scalable=no`

**Date:** 2026-05-15
**Case:** A one-line viewport meta change — delete `user-scalable=no` from `__root.tsx` — that takes about eight seconds to make and has more layers underneath than its size suggests. Worth dwelling on because it sits at the intersection of accessibility, inherited defaults, asymmetric platform behavior, and the seductive logic of "make it feel like a native app."

---

## The case in two sentences

The app shipped with `<meta name="viewport" content="…, user-scalable=no">` — a hint to mobile browsers to disable pinch-to-zoom. Apple has ignored this since iOS 10 (2016) on accessibility grounds, but Chrome on Android still honors it, which means every Android user was silently locked out of the one zoom mechanism mobile browsers give them — exactly the wrong thing for a workout app where the phone sits on the floor.

---

## Angle 1 — Engineering: what the tag actually says

The viewport line was:

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
```

Each comma-separated token is a separate hint:

| Token | What it does |
|---|---|
| `width=device-width` | Make the layout viewport match the device's CSS width. Without this, mobile browsers assume a 980px desktop layout and shrink it. |
| `initial-scale=1` | Start at 1:1 zoom — 1 CSS pixel = 1 device-independent pixel. |
| `viewport-fit=cover` | Render under the iPhone notch / Dynamic Island instead of letterboxing away from it. This is what `env(safe-area-inset-*)` then carves up. |
| `user-scalable=no` | **Disable pinch-to-zoom and double-tap zoom.** Equivalent in most browsers to `maximum-scale=1`. |

The first three are hygiene. The fourth is the one we're killing.

The mental model: **the viewport tag is a manifest of hints, not a single switch.** You can audit it token by token. That kind of decomposition is how you avoid the "we have always had this line, leave it alone" trap.

---

## Angle 2 — Accessibility: this is the most direct WCAG-AA failure mobile has

**WCAG 2.1 Success Criterion 1.4.4 (Resize Text, Level AA):** *"Except for captions and images of text, text can be resized without assistive technology up to 200 percent without loss of content or functionality."*

On a mobile browser, pinch-zoom is the *one* magnification mechanism every user has by default. `user-scalable=no` strips it. There is no graceful failure mode — you just can't zoom.

The audience this hurts isn't a hypothetical edge case:

- Anyone over ~45 with presbyopia
- Anyone with low vision short of needing a screen reader
- Anyone reading in bad light, bright sun, or with sweat in their eyes
- Anyone who took off their glasses to work out

**Heuristic worth keeping:** *accessibility is not an edge case — it is the steady state of using your product in real conditions.* Most a11y antipatterns aren't "this hurts a small minority of users." They're "this hurts a large majority of users some of the time."

---

## Angle 3 — Cross-platform reality: the asymmetric blast

Here's the part I find genuinely interesting from an engineering-rigor perspective:

> Apple decided in 2016 that accessibility trumps the developer's preference and made iOS Safari ignore `user-scalable=no` for pinch gestures. Chrome on Android still honors it.

What that means in practice:

| Platform | Behavior with `user-scalable=no` shipped |
|---|---|
| iOS Safari | Pinch-zoom works anyway. The tag is silently ignored. |
| iOS Chrome / Firefox (which all use WebKit on iOS) | Same as iOS Safari — pinch-zoom works. |
| Android Chrome | Pinch-zoom blocked. |
| Android Firefox | Pinch-zoom blocked. |
| Desktop browsers | Tag is ignored (desktop zoom is browser-chrome, not page-touch). |

So the bug had a real blast radius — half the global mobile market — and it was **invisible to the half of users we (developers) most often test on**. iPhone-first development is how this kind of bug stays in the tree forever.

**Pattern worth internalizing:** *when platform behavior is asymmetric, the platform you don't test on is where the regression lives.* Every cross-platform decision should ask: *which platform am I testing on, and what is being silently right or wrong on the other one?*

The trust-cost framing from [the deep-link crash doc](./2026-05-12%20Lessons%20from%20the%20Routine%20Deep%20Link%20Crash.md#angle-3--productpm-severity--likelihood--trust-cost) applies here too. The blast isn't just "low-vision Android users." It's "every Android user, every time they try to read something they can't quite make out." Friction-per-occurrence is low; frequency is high; compounding trust-cost is real.

---

## Angle 4 — Product/PM: this app, specifically

The default product instinct on a viewport accessibility audit finding is "fix it, move on." That misses the chance to ask: *is this antipattern even more wrong for this specific product than for the average web app?*

For a 7-minute workout app, yes — meaningfully so. Real-world conditions when someone is using it:

- **Phone on the floor while doing push-ups.** Viewing distance: ~3 feet. Eye strain mode.
- **Glasses off.** Especially common for people over 40 who keep reading glasses for fine print.
- **Sweat in the eyes mid-set.** Literally blurs the screen.
- **Outdoors / bright gym lighting.** Washes out contrast, makes small text harder to parse.
- **One-handed use** between exercises.

Every one of those conditions is a moment a user might want to pinch-zoom. The product is *built for the conditions where the accessibility affordance matters most*. Disabling it is a worse decision here than it would be for, say, a documentation site read on a desk.

**Framing worth keeping:** *accessibility violations have variable cost per product.* A blanket WCAG finding hits harder when the product's real-world use case overlaps with the disability it ignores.

---

## Angle 5 — Process: inherited defaults are a stealth source of bugs

This tag wasn't a decision anyone on this project made. **Lovable scaffolded it in, and the project inherited it without auditing.** That's not a Lovable problem — it's a generic property of every scaffold, template, starter kit, and copy-pasted Stack Overflow snippet on earth.

The same thing that produced this also produced:

- The OG title `"Short Seven"` (fixed earlier today)
- The default Lovable R2 OG image (also fixed earlier today)
- The decision to skip a service worker ([deliberately, it turns out](../README.md#2026-05-13--missing-vs-intentionally-absent))

**Two of those were bugs. One was a deliberate trade.** You don't know which is which until you read the prior author's notes — or, in the scaffold's case, audit the defaults and ask "why?" for each one.

Heuristic carrying forward:

> **"Inherit-and-audit."** When you adopt code you didn't write — scaffold, starter, template, snippet — schedule a pass through the defaults *as a separate, named task*. Don't trust that "it was set up that way" means "someone thought about it."

The deep-link crash doc captured the cousin of this: *before fixing a "missing" thing, check whether it was missed or removed on purpose.* This one is the inverse: *before keeping a "present" thing, check whether it was added on purpose or just inherited.*

---

## Angle 6 — Engineering: the seductive "but it feels more native" argument

The historical justifications for `user-scalable=no` are worth unpacking because they're a *category* of antipattern, not just one tag:

1. **"It makes the page feel more app-like."** Native apps don't pinch-zoom their UI, so disabling zoom is supposed to close the gap. This conflates *aesthetic similarity* with *functional fitness*. Native apps also don't have a URL bar — you wouldn't strip your address bar to feel more native.
2. **"It prevents accidental zoom while scrolling fast."** True problem. Wrong fix. The right fix is [`touch-action: manipulation`](https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action) on specific tap targets, which suppresses the double-tap-to-zoom gesture *on that element only* without disabling pinch globally.
3. **"It removes the 300ms tap delay on iOS."** Used to be true (pre-2014). Modern iOS Safari already eliminated this delay for pages with `width=device-width` set. Not a current concern.

The general pattern:

> **Stripping browser features to mimic native is almost always wrong, because the features you strip are the ones that make the web *better than native* — universal accessibility, deep-linkable URLs, view source, no install gate.**

When you find yourself disabling a browser default for "polish," check if the polish is actually paying for itself or just performing native-ness theatrically.

---

## What removing the tag will *not* break

Listing this because it's the part developers worry about — usually without reason:

- ❌ The page **won't** start scaling weirdly. `width=device-width` + `initial-scale=1` still pin the default layout. Removing `user-scalable=no` doesn't change the initial render.
- ❌ Buttons **won't** suddenly require double-tap. That's a `touch-action` thing, not a viewport thing.
- ❌ Forms **won't** suddenly zoom on focus. (That iOS behavior is triggered by font-size ≤ 16px on inputs, not by viewport. We don't have any small-font inputs.)
- ❌ The "native feel" **won't** evaporate. Native feel comes from full-bleed layout, large tap targets, smooth transitions, fast navigation, and offline support — none of which depend on this tag.

What *will* happen: Android users can now pinch-zoom. iPhone users see no change (they could already). That's the entire diff.

---

## Patterns and antipatterns to recognize next time

### Patterns ✅

- **Decompose multi-token configuration.** A viewport meta tag, a CSP header, a `tsconfig.json`, an ESLint config — when something has many comma- or space-separated parts, audit them as a list, not a blob.
- **Inherit-and-audit.** When you adopt a scaffold, schedule a pass through every default and ask "why?" Cousin to *"before fixing a missing thing, check whether it was missed or removed on purpose."*
- **Accessibility-as-steady-state.** Default to thinking about a11y as "what every user needs sometimes," not "what some users need always."
- **Asymmetric-platform check.** When testing, list which platforms you tested on and what could be silently right or wrong on the others.
- **Variable-cost framing.** An accessibility violation has different cost per product. Score the violation against the product's real-world use conditions.
- **Right fix, right scope.** When solving a sub-problem (accidental zoom while scrolling), prefer the scoped fix (`touch-action: manipulation` on the element) over the global hammer (disable zoom for everyone).

### Antipatterns ❌

- **"Native feel" as a justification for stripping browser features.** Stripping URL bars, disabling zoom, hiding scroll position — all are this same antipattern with different costumes.
- **Inheriting scaffold defaults without auditing them.** The default is always *somebody else's preference*, not yours.
- **Testing only on the platform that's most forgiving of your bug.** iPhone-first dev hides Android-only failures; Chrome-first dev hides Safari-only failures; etc.
- **Treating accessibility findings as binary "compliant / not compliant"** instead of as "how much does this hurt, for this product, given who's likely to use it?"

---

## Open questions for next time

1. **What other tokens in this app's defaults are unexamined?** The viewport audit took 30 seconds. The same audit on `manifest.json`, `tsconfig.json`, the ESLint config, and the head links is probably hours but probably worth it.
2. **Should `touch-action: manipulation` be added to the workout-screen buttons?** They're large and likely don't have a double-tap-zoom problem, but pause/skip/quit are timing-critical and any 300ms delay would be felt. Worth measuring before adding.
3. **Is there a CI-level a11y check we could add cheaply?** [`@axe-core/cli`](https://github.com/dequelabs/axe-core-npm) catches viewport-zoom violations among many others. A single-page Playwright pass + axe scan would catch this whole class. Maybe worth it; maybe overkill for a hobby app. Worth knowing the option exists.

---

## TL;DR — what to carry forward

- **The viewport meta tag is a list of hints. Audit it token by token.**
- **`user-scalable=no` is the most direct WCAG 1.4.4 violation mobile development offers.** Don't ship it.
- **iOS Safari has ignored this tag since 2016.** That's why the bug stayed invisible to iPhone-only testing.
- **Accessibility violations cost more in products whose real-world use depends on the affordance.** A workout app blocking zoom is worse than a documentation site blocking zoom.
- **Inherit-and-audit.** Scaffolded defaults are *somebody else's preferences* — make them yours deliberately or replace them.
- **"Native feel" is not a sufficient reason to strip a browser feature.** The features you'd strip are usually the ones that make the web better than native in the first place.
- **When solving a sub-problem, use the scoped fix.** `touch-action: manipulation` on specific elements > disabling zoom for everyone.

— Goodfellow
