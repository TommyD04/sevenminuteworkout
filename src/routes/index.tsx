import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Play, History, Flame, ChevronRight, Lock, RotateCcw } from "lucide-react";
import {
  loadSessions,
  todayCount,
  last7Days,
  currentStreak,
  loadSelectedRoutine,
  saveSelectedRoutine,
  reconcileCheckpoint,
  clearCheckpoint,
  type Checkpoint,
  type Session,
} from "@/lib/storage";
import { ROUTINES, DEFAULT_ROUTINE_ID } from "@/lib/workout";
import { unlockAudio } from "@/lib/audio";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "7-Minute Workout" },
      {
        name: "description",
        content: "The classic 7-minute scientific workout. Right on your phone.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedRoutine, setSelectedRoutine] = useState<string>(DEFAULT_ROUTINE_ID);
  // A resumable checkpoint is one the user can pick up where they left off:
  // fresh (within the freshness window), routine still valid, and at least
  // one exercise completed. A 0-completed fresh checkpoint is functionally
  // identical to a fresh start, so we clear it eagerly below and never
  // surface a Resume CTA for it.
  const [resumable, setResumable] = useState<Checkpoint | null>(null);

  useEffect(() => {
    // Reconcile BEFORE loading sessions so a freshly-written reconciled
    // row is included in the metrics (today's count, streak, last-7).
    // The reconciler is idempotent and SSR-safe on its own.
    const result = reconcileCheckpoint({
      isRoutineValid: (id) => ROUTINES.some((r) => r.id === id && !r.locked),
    });
    setSessions(loadSessions());
    setSelectedRoutine(loadSelectedRoutine(DEFAULT_ROUTINE_ID));
    if (result.kind === "fresh") {
      if (result.checkpoint.completedExercises >= 1) {
        setResumable(result.checkpoint);
      } else {
        // 0-completed fresh checkpoint: no progress to preserve, so a
        // Resume CTA would just duplicate Start workout. Clear it now to
        // keep storage tidy; any new run will write its own checkpoint
        // on the first phase transition.
        clearCheckpoint({ runId: result.checkpoint.runId });
      }
    }
  }, []);

  const selectRoutine = (id: string, locked: boolean) => {
    if (locked) return;
    setSelectedRoutine(id);
    saveSelectedRoutine(id);
  };

  function onResume() {
    if (!resumable) return;
    // Revalidate at click time: the stored `resumable` may be many minutes
    // stale if the user mounted home, took a long phone call, and is now
    // tapping Resume well past the freshness window. Asking the reconciler
    // for a fresh read will either confirm the checkpoint is still fresh
    // (navigate) or convert it into a partial session and clear (update
    // home state, no nav).
    const result = reconcileCheckpoint({
      isRoutineValid: (id) => ROUTINES.some((r) => r.id === id && !r.locked),
    });
    if (result.kind === "fresh") {
      unlockAudio();
      navigate({
        to: "/workout",
        search: { test: false, routine: result.checkpoint.routineId, resume: true },
      });
      return;
    }
    // Stale or already-reconciled. Re-pull sessions so any newly written
    // partial is visible in today's count / streak, and drop the CTA.
    setSessions(loadSessions());
    setResumable(null);
  }

  function onStartOver() {
    if (!resumable) return;
    // Clear *before* navigating: if the user closed the tab in the brief
    // window between mount and the new workout's first phase transition,
    // the reconciler would otherwise resurrect the old checkpoint as a
    // partial — silently reversing the user's explicit "start over"
    // decision. Scoped to the checkpoint's runId so we can't clobber a
    // different in-progress run.
    clearCheckpoint({ runId: resumable.runId });
    const routineId = resumable.routineId;
    setResumable(null);
    unlockAudio();
    navigate({ to: "/workout", search: { test: false, routine: routineId } });
  }

  function onDiscard() {
    if (!resumable) return;
    clearCheckpoint({ runId: resumable.runId });
    setResumable(null);
  }

  const today = todayCount(sessions);
  const week = last7Days(sessions);
  const streak = currentStreak(sessions);

  return (
    <main className="min-h-screen flex flex-col px-6 pt-20 pb-8 max-w-md mx-auto">
      <header className="mb-10">
        <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground font-mono">
          The Scientific-ish
        </p>
        <h1 className="text-5xl font-display font-bold leading-[0.95] mt-2">
          7-Minute
          <br />
          Workout<span className="text-primary">.</span>
        </h1>
      </header>

      {/* Today */}
      <section className="rounded-3xl bg-card border border-border p-6 mb-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted-foreground uppercase tracking-wider">Today</span>
          <span className="text-5xl font-display font-bold tabular">
            {today}
            <span className="text-lg text-muted-foreground font-normal">
              {today === 1 ? " round" : " rounds"}
            </span>
          </span>
        </div>
      </section>

      {/* Streak + week */}
      <section className="rounded-3xl bg-card border border-border p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm text-muted-foreground uppercase tracking-wider">
            Last 7 days
          </span>
          <span className="flex items-center gap-1.5 text-primary font-display font-bold">
            <Flame className="w-4 h-4" />
            {streak} day{streak === 1 ? "" : "s"}
          </span>
        </div>
        <div className="flex justify-between gap-1.5">
          {week.map((d, i) => {
            const intensity = Math.min(d.count, 3);
            const WD = ["S", "M", "T", "W", "T", "F", "S"];
            const label = WD[d.date.getDay()];
            return (
              <div key={i} className="flex flex-col items-center gap-2 flex-1">
                <div
                  className="w-full aspect-square rounded-lg border border-border flex items-center justify-center text-xs font-mono tabular"
                  style={{
                    backgroundColor:
                      intensity === 0
                        ? "transparent"
                        : `color-mix(in oklab, var(--primary) ${intensity * 33}%, transparent)`,
                    color: intensity > 0 ? "var(--primary-foreground)" : "var(--muted-foreground)",
                  }}
                >
                  {d.count > 0 ? d.count : ""}
                </div>
                <span className="text-[10px] uppercase text-muted-foreground">{label}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Routine selector */}
      <ul className="mt-auto mb-6">
        {ROUTINES.map((r) => {
          const isSelected = r.id === selectedRoutine;
          const baseClasses = `w-full flex items-center justify-between gap-3 py-1.5 -mx-2 px-2 rounded-lg transition-colors ${
            r.locked
              ? "text-muted-foreground/60 cursor-not-allowed"
              : isSelected
                ? "text-primary font-bold"
                : "text-muted-foreground active:bg-card"
          }`;
          return (
            <li key={r.id} className="relative">
              <button
                type="button"
                onClick={() => selectRoutine(r.id, r.locked)}
                disabled={r.locked}
                aria-pressed={isSelected}
                className={baseClasses}
              >
                <span className="flex items-center gap-3 text-left">
                  <span
                    className={`inline-block w-1.5 h-1.5 rounded-full ${
                      isSelected && !r.locked ? "bg-primary" : "bg-transparent"
                    }`}
                  />
                  <span>{r.name}</span>
                </span>
                {/* Spacer to reserve room for the chevron / lock */}
                <span className="w-9 h-5" aria-hidden />
              </button>
              {r.locked ? (
                <span className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-muted-foreground/60 pointer-events-none">
                  <Lock className="w-4 h-4 opacity-60" />
                </span>
              ) : (
                <Link
                  to="/routine/$id"
                  params={{ id: r.id }}
                  aria-label={`Open ${r.name} details`}
                  className="absolute right-0 top-1/2 -translate-y-1/2 p-3 text-muted-foreground active:text-primary"
                >
                  <ChevronRight className="w-4 h-4 opacity-60" />
                </Link>
              )}
            </li>
          );
        })}
      </ul>

      {/* CTAs */}
      <div className="space-y-3">
        {resumable ? (
          <ResumeCluster
            checkpoint={resumable}
            onResume={onResume}
            onStartOver={onStartOver}
            onDiscard={onDiscard}
          />
        ) : (
          <Link
            to="/workout"
            search={{ test: false, routine: selectedRoutine }}
            onClick={() => unlockAudio()}
            className="flex items-center justify-center gap-3 w-full rounded-2xl bg-primary text-primary-foreground py-6 font-display font-bold text-2xl transition-transform active:scale-[0.98]"
          >
            <Play className="w-6 h-6 fill-current" />
            Start workout
          </Link>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Link
            to="/workout"
            search={{ test: true, routine: selectedRoutine }}
            onClick={() => unlockAudio()}
            className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-border py-4 font-medium text-muted-foreground transition-colors active:bg-card"
          >
            <Play className="w-4 h-4" />
            Test run
          </Link>
          <Link
            to="/history"
            className="flex items-center justify-center gap-2 rounded-2xl border border-border py-4 font-medium text-muted-foreground transition-colors active:bg-card"
          >
            <History className="w-4 h-4" />
            History
          </Link>
        </div>
      </div>
    </main>
  );
}

function ResumeCluster({
  checkpoint,
  onResume,
  onStartOver,
  onDiscard,
}: {
  checkpoint: Checkpoint;
  onResume: () => void;
  onStartOver: () => void;
  onDiscard: () => void;
}) {
  // "X min ago" is computed once at render time — close enough for a CTA
  // the user is about to act on. The home page re-mounts on every nav, so
  // this label stays fresh in normal use. A user lingering on the home
  // page for >10 minutes is exactly the case the click-time freshness
  // recheck in `onResume` covers.
  const minutesAgo = Math.max(
    1,
    Math.round(Math.max(0, Date.now() - checkpoint.updatedAt) / 60000),
  );
  const ago = minutesAgo === 1 ? "1 min ago" : `${minutesAgo} min ago`;

  return (
    <>
      <button
        type="button"
        onClick={onResume}
        className="flex flex-col items-center justify-center gap-1.5 w-full rounded-2xl bg-primary text-primary-foreground py-5 transition-transform active:scale-[0.98]"
      >
        <span className="flex items-center gap-3 font-display font-bold text-2xl leading-none">
          <Play className="w-6 h-6 fill-current" />
          Resume {checkpoint.routineName}
        </span>
        <span className="text-[11px] uppercase tracking-wider font-mono opacity-80">
          {checkpoint.completedExercises} of {checkpoint.totalExercises} done · {ago}
        </span>
      </button>
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={onStartOver}
          className="flex items-center justify-center gap-2 rounded-2xl border border-border py-4 font-medium text-muted-foreground transition-colors active:bg-card"
        >
          <RotateCcw className="w-4 h-4" />
          Start over
        </button>
        <button
          type="button"
          onClick={onDiscard}
          className="flex items-center justify-center gap-2 rounded-2xl border border-destructive/40 py-4 font-medium text-destructive transition-colors active:bg-destructive/10"
        >
          Discard
        </button>
      </div>
    </>
  );
}
