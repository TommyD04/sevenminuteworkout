import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Pause, Play, SkipForward, X } from "lucide-react";
import {
  ROUTINES,
  DEFAULT_ROUTINE_ID,
  WORK_SECONDS,
  REST_SECONDS,
  READY_SECONDS,
  type Phase,
} from "@/lib/workout";
import { loadSelectedRoutine } from "@/lib/storage";
import { unlockAudio, tickBeep, startBeep, restBeep, finishBeep, speak } from "@/lib/audio";
import { startBuzz, restBuzz, finishBuzz } from "@/lib/haptics";
import { saveSession } from "@/lib/storage";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import { useWakeLock } from "@/hooks/use-wake-lock";

export const Route = createFileRoute("/workout")({
  validateSearch: (s: Record<string, unknown>) => ({
    test: s.test === "1" || s.test === 1 || s.test === true,
    routine: typeof s.routine === "string" ? s.routine : undefined,
  }),
  head: () => ({
    meta: [{ title: "Workout — 7 Minutes" }],
  }),
  component: WorkoutPage,
});

function phaseDuration(phase: Phase): number {
  if (phase === "work") return WORK_SECONDS;
  if (phase === "rest") return REST_SECONDS;
  return READY_SECONDS;
}

function WorkoutPage() {
  const navigate = useNavigate();
  const { test, routine: routineParam } = Route.useSearch();
  const [activeRoutine] = useState(() => {
    const id =
      routineParam ??
      (typeof window !== "undefined"
        ? loadSelectedRoutine(DEFAULT_ROUTINE_ID)
        : DEFAULT_ROUTINE_ID);
    return ROUTINES.find((r) => r.id === id && !r.locked) ?? ROUTINES[0];
  });
  const EXERCISES = activeRoutine.exercises;
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("ready");
  const [remaining, setRemaining] = useState(READY_SECONDS);
  const [progress, setProgress] = useState(0); // 0..1, smooth
  const [paused, setPaused] = useState(false);
  const [done, setDone] = useState(false);
  const [difficulty, setDifficulty] = useState<number | null>(null);
  const [quitOpen, setQuitOpen] = useState(false);
  const wasPausedBeforeQuitRef = useRef(false);

  // Hold the screen wake lock for the full workout, including the post-workout
  // difficulty rating screen. The hook re-acquires on visibilitychange so the
  // lock survives a tab switch / incoming call mid-set.
  useWakeLock(true);

  // Refs (don't trigger re-render)
  const startTimeRef = useRef<number>(Date.now());
  const phaseStartRef = useRef<number>(performance.now());
  const pauseOffsetRef = useRef<number>(0); // ms accumulated while paused not used; we shift phaseStart instead
  const pauseAtRef = useRef<number | null>(null);
  const lastRemainingRef = useRef<number>(READY_SECONDS);
  const phaseRef = useRef<Phase>("ready");
  const indexRef = useRef<number>(0);
  const doneRef = useRef<boolean>(false);
  const pausedRef = useRef<boolean>(false);

  // Keep refs in sync
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    indexRef.current = index;
  }, [index]);
  useEffect(() => {
    doneRef.current = done;
  }, [done]);

  // Audio unlock + initial cue. Runs in the same tick as the mount, so the
  // user-gesture from the preceding "Start" tap is still active.
  useEffect(() => {
    unlockAudio();
    speak(`Get ready. ${EXERCISES[0].name} in five.`);
  }, []);

  // Pause / resume: shift phaseStart so elapsed stays continuous
  useEffect(() => {
    pausedRef.current = paused;
    if (paused) {
      pauseAtRef.current = performance.now();
    } else if (pauseAtRef.current != null) {
      const pausedFor = performance.now() - pauseAtRef.current;
      phaseStartRef.current += pausedFor;
      pauseAtRef.current = null;
    }
  }, [paused]);

  function advancePhase() {
    const p = phaseRef.current;
    const i = indexRef.current;
    if (p === "ready") {
      setPhase("work");
      lastRemainingRef.current = WORK_SECONDS;
      setRemaining(WORK_SECONDS);
      setProgress(0);
      phaseStartRef.current = performance.now();
      startBeep();
      startBuzz();
      speak(`${EXERCISES[0].name}.`);
    } else if (p === "work") {
      const isLast = i === EXERCISES.length - 1;
      if (isLast) {
        finishBeep();
        finishBuzz();
        doneRef.current = true;
        setDone(true);
        return;
      }
      setPhase("rest");
      lastRemainingRef.current = REST_SECONDS;
      setRemaining(REST_SECONDS);
      setProgress(0);
      phaseStartRef.current = performance.now();
      restBeep();
      restBuzz();
      speak(`Rest. Next: ${EXERCISES[i + 1].name}.`);
    } else {
      // rest -> next work
      const nextIdx = i + 1;
      setIndex(nextIdx);
      setPhase("work");
      lastRemainingRef.current = WORK_SECONDS;
      setRemaining(WORK_SECONDS);
      setProgress(0);
      phaseStartRef.current = performance.now();
      startBeep();
      startBuzz();
      speak(`${EXERCISES[nextIdx].name}.`);
    }
  }

  // rAF-driven progress + remaining
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      if (!doneRef.current) {
        if (!pausedRef.current) {
          const totalMs = phaseDuration(phaseRef.current) * 1000;
          const elapsed = performance.now() - phaseStartRef.current;
          const clamped = Math.min(elapsed, totalMs);
          const prog = clamped / totalMs;
          setProgress(prog);
          const newRemaining = Math.max(0, Math.ceil((totalMs - clamped) / 1000));
          if (newRemaining !== lastRemainingRef.current) {
            lastRemainingRef.current = newRemaining;
            setRemaining(newRemaining);
            if (newRemaining > 0 && newRemaining <= 5) tickBeep();
          }
          if (elapsed >= totalMs) {
            advancePhase();
          }
        }
        raf = requestAnimationFrame(loop);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openQuitDialog() {
    wasPausedBeforeQuitRef.current = paused;
    if (!paused) setPaused(true);
    setQuitOpen(true);
  }

  function handleQuitOpenChange(open: boolean) {
    setQuitOpen(open);
    if (!open && !wasPausedBeforeQuitRef.current) {
      setPaused(false);
    }
  }

  function confirmQuit() {
    setQuitOpen(false);
    navigate({ to: "/" });
  }

  function skip() {
    // Force phase to end immediately
    phaseStartRef.current = performance.now() - phaseDuration(phaseRef.current) * 1000;
  }

  function saveAndExit() {
    if (test) {
      navigate({ to: "/" });
      return;
    }
    if (difficulty == null) return;
    saveSession({
      id: crypto.randomUUID(),
      completedAt: Date.now(),
      durationSeconds: Math.round((Date.now() - startTimeRef.current) / 1000),
      difficulty,
      routineId: activeRoutine.id,
      routineName: activeRoutine.name,
    });
    navigate({ to: "/" });
  }

  if (done) {
    return (
      <DoneScreen
        test={test}
        difficulty={difficulty}
        setDifficulty={setDifficulty}
        onSave={saveAndExit}
      />
    );
  }

  const current = EXERCISES[index];
  const next = EXERCISES[index + 1];
  // During rest, the screen previews the upcoming exercise — icon, name, and
  // tip all refer to the *next* exercise so the rest interval becomes mental
  // prep time. `next` is guaranteed defined here because the final work phase
  // transitions straight to `done`, never to rest (see advancePhase).
  const previewed = phase === "rest" ? (next ?? current) : current;
  const PreviewIcon = previewed.icon;
  const ringColor =
    phase === "work" ? "var(--primary)" : phase === "rest" ? "var(--rest)" : "var(--primary)";

  return (
    <main className="min-h-screen flex flex-col px-6 pt-16 pb-8 max-w-md mx-auto">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={openQuitDialog}
          aria-label="Quit workout"
          className="p-2 -ml-2 text-muted-foreground active:text-foreground"
        >
          <X className="w-6 h-6" />
        </button>
        <div className="font-mono text-xs uppercase tracking-wider text-muted-foreground tabular flex items-center gap-2">
          {test && (
            <span className="px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/40 tracking-widest">
              TEST
            </span>
          )}
          <span>
            {index + 1} / {EXERCISES.length}
          </span>
        </div>
        <button onClick={skip} className="p-2 -mr-2 text-muted-foreground active:text-foreground">
          <SkipForward className="w-6 h-6" />
        </button>
      </div>

      {/* Phase label */}
      <p
        className="text-center text-xs uppercase tracking-[0.3em] font-mono mb-4"
        style={{ color: ringColor }}
      >
        {phase === "work" ? "Work" : phase === "rest" ? "Rest" : "Get Ready"}
      </p>

      {/* Timer ring */}
      <div className="relative mx-auto w-64 h-64 my-2">
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
          <circle cx="50" cy="50" r="46" fill="none" stroke="var(--secondary)" strokeWidth="6" />
          <circle
            cx="50"
            cy="50"
            r="46"
            fill="none"
            stroke={ringColor}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 46}
            strokeDashoffset={2 * Math.PI * 46 * (1 - progress)}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display font-bold text-7xl tabular leading-none">
            {Math.max(0, remaining)}
          </span>
          <span className="text-xs uppercase tracking-wider text-muted-foreground mt-1 font-mono">
            seconds
          </span>
        </div>
      </div>

      {/* Current exercise */}
      <div className="text-center mt-6 px-4">
        <div className="flex items-center justify-center mb-3 text-primary">
          <PreviewIcon className="w-10 h-10" strokeWidth={1.5} />
        </div>
        <h2 className="font-display font-bold text-3xl leading-tight">
          {phase === "work"
            ? previewed.name
            : phase === "ready"
              ? `First up: ${previewed.name}`
              : `Up next: ${previewed.name}`}
        </h2>
        <p className="text-sm text-muted-foreground mt-2 min-h-[2.5rem]">{previewed.tip}</p>
      </div>

      {/* Pause */}
      <div className="mt-auto flex justify-center">
        <button
          onClick={() => setPaused((p) => !p)}
          className="flex items-center justify-center gap-2 rounded-full bg-secondary text-foreground w-20 h-20 active:scale-95 transition-transform"
          aria-label={paused ? "Resume" : "Pause"}
        >
          {paused ? (
            <Play className="w-8 h-8 fill-current" />
          ) : (
            <Pause className="w-8 h-8 fill-current" />
          )}
        </button>
      </div>

      <AlertDialog open={quitOpen} onOpenChange={handleQuitOpenChange}>
        <AlertDialogContent className="max-w-sm rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Quit this workout?</AlertDialogTitle>
            <AlertDialogDescription>Your progress won't be saved.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep going</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmQuit}
              className={buttonVariants({ variant: "destructive" })}
            >
              Quit workout
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

function DoneScreen({
  test,
  difficulty,
  setDifficulty,
  onSave,
}: {
  test: boolean;
  difficulty: number | null;
  setDifficulty: (n: number) => void;
  onSave: () => void;
}) {
  return (
    <main className="min-h-screen flex flex-col px-6 pt-12 pb-8 max-w-md mx-auto">
      <div className="text-center mb-10">
        <p className="text-xs uppercase tracking-[0.3em] font-mono text-primary">
          {test ? "Test complete" : "Complete"}
        </p>
        <h1 className="font-display font-bold text-6xl leading-[0.95] mt-3">
          Nice
          <br />
          work<span className="text-primary">.</span>
        </h1>
        <p className="text-muted-foreground mt-4">
          {test ? "Test run — nothing was saved." : "7 minutes well spent."}
        </p>
      </div>

      {!test && (
        <div className="rounded-3xl bg-card border border-border p-6 mb-6">
          <p className="text-sm text-muted-foreground uppercase tracking-wider mb-4 text-center">
            How hard was that?
          </p>
          <div className="flex justify-between gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => setDifficulty(n)}
                className="flex-1 aspect-square rounded-2xl border-2 font-display font-bold text-2xl tabular transition-all active:scale-95"
                style={{
                  borderColor: difficulty === n ? "var(--primary)" : "var(--border)",
                  backgroundColor: difficulty === n ? "var(--primary)" : "transparent",
                  color: difficulty === n ? "var(--primary-foreground)" : "var(--foreground)",
                }}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="flex justify-between text-[10px] uppercase tracking-wider text-muted-foreground mt-2 px-1">
            <span>Easy</span>
            <span>Brutal</span>
          </div>
        </div>
      )}

      <div className="mt-auto space-y-3">
        <button
          onClick={onSave}
          disabled={!test && difficulty == null}
          className="w-full rounded-2xl bg-primary text-primary-foreground py-5 font-display font-bold text-xl disabled:opacity-40 disabled:cursor-not-allowed transition-transform active:scale-[0.98]"
        >
          {test ? "Done" : "Save"}
        </button>
        {!test && (
          <Link to="/" className="block text-center text-sm text-muted-foreground py-2">
            Skip
          </Link>
        )}
      </div>
    </main>
  );
}
