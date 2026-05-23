// Robust Screen Wake Lock. The OS auto-releases the lock whenever the document
// becomes hidden (tab switch, phone call, manual lock), and we don't get any
// useful signal that screen-dim is now back on the table — except via the
// sentinel's `release` event and the document's `visibilitychange` event.
// This hook re-acquires on visibility, so the lock survives a tab switch
// rather than dying silently after the first one.
//
// Caller passes `active = true` while the lock should be held; the hook does
// the rest. SSR-safe.

import { useEffect } from "react";

type WakeLockSentinelLike = {
  release: () => Promise<void>;
  addEventListener?: (type: "release", listener: () => void) => void;
};

type WakeLockApi = {
  request: (type: "screen") => Promise<WakeLockSentinelLike>;
};

export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    if (typeof navigator === "undefined" || typeof document === "undefined") return;

    const api = (navigator as Navigator & { wakeLock?: WakeLockApi }).wakeLock;
    if (!api) return;

    let cancelled = false;
    let sentinel: WakeLockSentinelLike | null = null;
    let inFlight = false;

    const acquire = async () => {
      if (cancelled || sentinel || inFlight) return;
      inFlight = true;
      try {
        const lock = await api.request("screen");
        if (cancelled) {
          // The component unmounted while the request was in flight.
          lock.release().catch(() => {});
          return;
        }
        sentinel = lock;
        // The OS will fire this when it auto-releases (hidden tab, low battery,
        // OS lock). Null our reference so the next visibility-driven acquire
        // can proceed.
        lock.addEventListener?.("release", () => {
          if (sentinel === lock) sentinel = null;
        });
      } catch {
        // NotAllowedError / NotSupportedError / no user gesture — silently
        // give up. The user gets the default screen-dim behavior.
      } finally {
        inFlight = false;
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void acquire();
      }
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      sentinel?.release().catch(() => {});
      sentinel = null;
    };
  }, [active]);
}
