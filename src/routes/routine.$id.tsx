import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { ROUTINES, WORK_SECONDS, REST_SECONDS, type Exercise } from "@/lib/workout";

export const Route = createFileRoute("/routine/$id")({
  head: ({ params }) => {
    const r = ROUTINES.find((x) => x.id === params.id);
    const title = r ? `${r.name} — 7-Minute Workout` : "Routine";
    return {
      meta: [
        { title },
        { name: "description", content: "Full list of exercises in this routine, in order." },
      ],
    };
  },
  component: RoutineDetail,
  notFoundComponent: () => (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <p className="text-muted-foreground mb-4">Routine not found.</p>
      <Link to="/" className="text-primary underline">
        Back home
      </Link>
    </main>
  ),
  errorComponent: ({ error }) => (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <p className="text-muted-foreground mb-4">{error.message}</p>
      <Link to="/" className="text-primary underline">
        Back home
      </Link>
    </main>
  ),
  loader: ({ params }) => {
    const r = ROUTINES.find((x) => x.id === params.id);
    if (!r || r.locked) throw notFound();
    return r;
  },
});

function RoutineDetail() {
  const routine = Route.useLoaderData();

  return (
    <main className="min-h-screen flex flex-col px-6 pt-20 pb-8 max-w-md mx-auto">
      <Link
        to="/"
        className="inline-flex items-center gap-2 text-muted-foreground -ml-2 mb-6 py-2"
      >
        <ArrowLeft className="w-4 h-4" />
        <span className="text-sm">Back</span>
      </Link>

      <header className="mb-8">
        <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground font-mono">
          Routine
        </p>
        <h1 className="text-4xl font-display font-bold leading-[0.95] mt-2">
          {routine.name}
          <span className="text-primary">.</span>
        </h1>
        <p className="text-sm text-muted-foreground mt-3">
          {routine.exercises.length} exercises · {WORK_SECONDS}s work · {REST_SECONDS}s rest
        </p>
      </header>

      <ol className="space-y-1 mb-8">
        {routine.exercises.map((ex: Exercise, i: number) => {
          const Icon = ex.icon;
          return (
            <li
              key={ex.name}
              className="flex items-center gap-4 py-3 border-b border-border last:border-b-0"
            >
              <span className="text-sm font-mono tabular text-muted-foreground w-6">
                {String(i + 1).padStart(2, "0")}
              </span>
              <Icon className="w-5 h-5 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-medium">{ex.name}</div>
                <div className="text-xs text-muted-foreground truncate">{ex.tip}</div>
              </div>
            </li>
          );
        })}
      </ol>

      <Link
        to="/workout"
        className="mt-auto flex items-center justify-center gap-3 w-full rounded-2xl bg-primary text-primary-foreground py-5 font-display font-bold text-xl transition-transform active:scale-[0.98]"
      >
        Start workout
      </Link>
    </main>
  );
}
