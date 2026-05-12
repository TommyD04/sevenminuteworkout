import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronLeft, Download, Trash2 } from "lucide-react";
import {
  loadSessions,
  deleteSession,
  currentStreak,
  type Session,
} from "@/lib/storage";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [{ title: "History — 7-Minute Workout" }],
  }),
  component: HistoryPage,
});

function HistoryPage() {
  const [sessions, setSessions] = useState<Session[]>([]);

  useEffect(() => {
    setSessions(loadSessions());
  }, []);

  const total = sessions.length;
  const streak = currentStreak(sessions);
  const avgDifficulty =
    total === 0
      ? 0
      : sessions.reduce((sum, s) => sum + s.difficulty, 0) / total;

  function remove(id: string) {
    if (!confirm("Delete this session?")) return;
    deleteSession(id);
    setSessions(loadSessions());
  }

  function exportCsv() {
    if (sessions.length === 0) return;
    const escape = (v: string | number) => {
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ["date", "time", "routine", "duration_seconds", "difficulty", "note"];
    const rows = sessions
      .slice()
      .sort((a, b) => a.completedAt - b.completedAt)
      .map((s) => {
        const d = new Date(s.completedAt);
        const date = d.toISOString().slice(0, 10);
        const time = d.toTimeString().slice(0, 5);
        const routine = s.routineName ?? "The Classic 7";
        return [date, time, routine, s.durationSeconds, s.difficulty, s.note ?? ""]
          .map(escape)
          .join(",");
      });
    const csv = [header.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `seven-minute-workout-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen flex flex-col px-6 pt-20 pb-8 max-w-md mx-auto">
      <Link
        to="/"
        className="flex items-center gap-1 text-muted-foreground -ml-2 mb-6 py-2 active:text-foreground"
      >
        <ChevronLeft className="w-5 h-5" />
        <span className="text-sm">Back</span>
      </Link>

      <h1 className="font-display font-bold text-4xl mb-6">
        History<span className="text-primary">.</span>
      </h1>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        <Stat label="Total" value={total} />
        <Stat label="Streak" value={streak} />
        <Stat
          label="Avg ⚡"
          value={total ? avgDifficulty.toFixed(1) : "—"}
        />
      </div>

      {sessions.length > 0 && (
        <button
          onClick={exportCsv}
          className="flex items-center justify-center gap-2 w-full rounded-2xl border border-border py-3 mb-6 text-sm font-medium text-muted-foreground active:bg-card transition-colors"
        >
          <Download className="w-4 h-4" />
          Export CSV
        </button>
      )}

      {/* Sessions */}
      {sessions.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-center text-muted-foreground">
          <div>
            <p className="font-display text-xl text-foreground mb-1">
              Nothing here yet.
            </p>
            <p className="text-sm">Finish a workout and it'll show up here.</p>
          </div>
        </div>
      ) : (
        <ul className="space-y-2">
          {sessions.map((s) => (
            <li
              key={s.id}
              className="rounded-2xl bg-card border border-border p-4 flex items-center justify-between"
            >
              <div>
                <div className="font-display font-bold">
                  {new Date(s.completedAt).toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                </div>
                <div className="text-xs text-primary mt-0.5 font-medium">
                  {s.routineName ?? "The Classic 7"}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 font-mono">
                  {new Date(s.completedAt).toLocaleTimeString(undefined, {
                    hour: "numeric",
                    minute: "2-digit",
                  })}{" "}
                  · {Math.round(s.durationSeconds / 60)}m{s.durationSeconds % 60}s
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="font-display font-bold text-2xl tabular text-primary">
                  {s.difficulty}
                  <span className="text-xs text-muted-foreground font-normal">
                    /5
                  </span>
                </div>
                <button
                  onClick={() => remove(s.id)}
                  className="p-2 text-muted-foreground active:text-destructive"
                  aria-label="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-card border border-border p-4 text-center">
      <div className="font-display font-bold text-3xl tabular">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">
        {label}
      </div>
    </div>
  );
}
