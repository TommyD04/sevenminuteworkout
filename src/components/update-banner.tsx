import { Button } from "@/components/ui/button";
import { useServiceWorker } from "@/hooks/use-service-worker";

export function UpdateBanner() {
  const { updateReady, isApplying, applyUpdate } = useServiceWorker();

  if (!updateReady) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-4 bottom-4 z-50 flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 text-card-foreground shadow-lg sm:left-auto sm:right-4 sm:max-w-sm"
    >
      <p className="text-sm">A new version is available.</p>
      <Button size="sm" onClick={applyUpdate} disabled={isApplying}>
        {isApplying ? "Reloading…" : "Reload"}
      </Button>
    </div>
  );
}
