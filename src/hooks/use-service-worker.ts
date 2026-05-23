// Owns service worker registration AND tracks whether a new SW is waiting to
// take over. Returns { updateReady, isApplying, applyUpdate } so a banner
// component can prompt the user. SSR-safe (all browser API touches live in
// useEffect / useCallback). Dev gate prevents the SW from fighting Vite HMR.

import { useCallback, useEffect, useRef, useState } from "react";

export function useServiceWorker() {
  const [updateReady, setUpdateReady] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const isApplyingRef = useRef(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (import.meta.env.DEV) return;

    let cancelled = false;
    // Snapshot: was this page controlled by a SW at load time?
    //   true  -> any future controllerchange means a new SW took over → reload.
    //   false -> first-ever install; the eventual controllerchange is benign.
    // This is what makes the reload logic work across ALL tabs: skipWaiting +
    // clients.claim fires controllerchange in every controlled tab, and each
    // tab reloads based on its own snapshot.
    const wasControlled = !!navigator.serviceWorker.controller;

    const onControllerChange = () => {
      if (!wasControlled) return;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    const markUpdateReady = () => {
      if (cancelled) return;
      // Suppress the banner on first-ever install — there's no prior version
      // to update from, so "A new version is available" would be a lie.
      if (!navigator.serviceWorker.controller) return;
      setUpdateReady(true);
    };

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        if (cancelled) return;
        registrationRef.current = reg;

        // The user may have closed the tab last time without applying an
        // already-installed update. Catch that on this load.
        if (reg.waiting) markUpdateReady();

        reg.addEventListener("updatefound", () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (installing.state === "installed") markUpdateReady();
          });
        });
      })
      .catch((error) => {
        console.error("Service worker registration failed:", error);
      });

    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  const applyUpdate = useCallback(() => {
    if (isApplyingRef.current) return;
    isApplyingRef.current = true;
    setIsApplying(true);

    // Read the live waiting worker at click time — the stashed reference from
    // statechange can drift if another SW has since replaced it.
    const waiting = registrationRef.current?.waiting ?? null;
    if (!waiting) {
      window.location.reload();
      return;
    }

    waiting.postMessage({ type: "SKIP_WAITING" });

    // Fallback: if controllerchange never fires (stale worker, lifecycle
    // stall), force a reload anyway. The user clicked "Reload" — give them
    // a reload either way.
    window.setTimeout(() => {
      if (isApplyingRef.current) window.location.reload();
    }, 4000);
  }, []);

  return { updateReady, isApplying, applyUpdate };
}
