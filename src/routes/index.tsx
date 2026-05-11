import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Play, History, Flame, ChevronRight, Lock } from "lucide-react";
import {
  loadSessions,
  todayCount,
  last7Days,
  currentStreak,
  loadSelectedRoutine,
  saveSelectedRoutine,
  type Session,
} from "@/lib/storage";
import { ROUTINES, DEFAULT_ROUTINE_ID } from "@/lib/workout";

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
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedRoutine, setSelectedRoutine] = useState<string>(DEFAULT_ROUTINE_ID);

  useEffect(() => {
    setSessions(loadSessions());
    setSelectedRoutine(loadSelectedRoutine(DEFAULT_ROUTINE_ID));
  }, []);

  const selectRoutine = (id: string, locked: boolean) => {
    if (locked) return;
    setSelectedRoutine(id);
    saveSelectedRoutine(id);
  };

  const today = todayCount(sessions);
  const week = last7Days(sessions);
  const streak = currentStreak(sessions);

  return (
    <main className="min-h-screen flex flex-col px-6 pt-12 pb-8 max-w-md mx-auto">
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
          <span className="text-sm text-muted-foreground uppercase tracking-wider">
            Today
          </span>
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
            const label = d.date.toLocaleDateString(undefined, {
              weekday: "short",
            })[0];
            return (
              <div key={i} className="flex flex-col items-center gap-2 flex-1">
                <div
                  className="w-full aspect-square rounded-lg border border-border flex items-center justify-center text-xs font-mono tabular"
                  style={{
                    backgroundColor:
                      intensity === 0
                        ? "transparent"
                        : `color-mix(in oklab, var(--primary) ${intensity * 33}%, transparent)`,
                    color:
                      intensity > 0
                        ? "var(--primary-foreground)"
                        : "var(--muted-foreground)",
                  }}
                >
                  {d.count > 0 ? d.count : ""}
                </div>
                <span className="text-[10px] uppercase text-muted-foreground">
                  {label}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Routine selector */}
      <ul className="mt-auto mb-6 space-y-1">
        {ROUTINES.map((r) => {
          const isSelected = r.id === selectedRoutine;
          const baseClasses = `w-full flex items-center justify-between gap-3 py-3 -mx-2 px-2 rounded-lg transition-colors ${
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
        <Link
          to="/workout"
          className="flex items-center justify-center gap-3 w-full rounded-2xl bg-primary text-primary-foreground py-6 font-display font-bold text-2xl transition-transform active:scale-[0.98]"
        >
          <Play className="w-6 h-6 fill-current" />
          Start workout
        </Link>
        <div className="grid grid-cols-2 gap-3">
          <Link
            to="/workout"
            search={{ test: true }}
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
