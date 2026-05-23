// Haptic feedback for phase transitions.
//
// `navigator.vibrate` takes either a single millisecond duration or an array
// of alternating [on, off, on, off, ...] durations. It is synchronous,
// returns false if unsupported, and the user does not need to grant
// permission. iOS Safari does NOT support this API — calls are silently
// no-ops there, which is the right fallback (audio cues still play).

function vibrate(pattern: number | number[]): void {
  if (typeof navigator === "undefined") return;
  const nav = navigator as Navigator & {
    vibrate?: (p: number | number[]) => boolean;
  };
  if (typeof nav.vibrate !== "function") return;
  try {
    nav.vibrate(pattern);
  } catch {
    // Some browsers throw on rapid back-to-back calls. Swallow — haptics
    // are a progressive enhancement, never required.
  }
}

// A definite "go" pulse at the start of a work interval.
export const startBuzz = () => vibrate(100);

// Lighter pulse for the start of rest — "ease off."
export const restBuzz = () => vibrate(60);

// Triple pulse to celebrate the end of the round. Mirrors the rising
// 3-tone cadence of finishBeep().
export const finishBuzz = () => vibrate([200, 100, 200, 100, 400]);
