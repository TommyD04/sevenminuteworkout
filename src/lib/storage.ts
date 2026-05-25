export type SessionStatus = "completed" | "partial";

export type Session = {
  id: string;
  completedAt: number; // ms epoch
  durationSeconds: number;
  // Difficulty becomes nullable in V1 of the partial-save arc — partials
  // are saved without a rating, and completed-pending sessions (all
  // exercises done but the user closed before tapping Save on the
  // DoneScreen) are reconciled with `difficulty: null` too. Existing
  // rated sessions continue to be `number`; missing field reads as null.
  difficulty: number | null; // 1-5, or null for partials and reconciled-completeds
  note?: string;
  routineId?: string; // back-compat: missing = "classic"
  routineName?: string;
  // Added in V1 of the partial-save arc. All optional for back-compat —
  // missing `status` reads as `'completed'`.
  status?: SessionStatus;
  completedExercises?: number;
  totalExercises?: number;
  skippedCount?: number;
  // `sourceRunId` is the idempotency key for partial writes. When a
  // checkpoint is converted to a partial (either via the X-button Save
  // path or via reconciliation on app reopen), the partial Session
  // carries the checkpoint's `runId` so that subsequent writes for the
  // same run update the existing row instead of creating a duplicate.
  sourceRunId?: string;
};

// Shared predicate. Use this everywhere a read site needs to count
// only "real" finished workouts (today's count, the streak, the
// 7-day chart). A missing `status` field is treated as `'completed'`
// to keep old sessions counting.
export function isCompletedSession(s: Session): boolean {
  return s.status !== "partial";
}

const KEY = "seven-min-sessions-v1";

export function loadSessions(): Session[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Session[];
  } catch {
    return [];
  }
}

// `saveSession` is idempotent by `sourceRunId`: if a session with the
// same `sourceRunId` already exists, it's replaced in place rather
// than duplicated. This makes the X-button Save path and the
// app-reopen reconciliation path safe to race — both can write the
// same partial without producing two rows. Sessions without a
// `sourceRunId` (the existing completed-workout flow) are always
// prepended as new rows, matching prior behavior.
export function saveSession(s: Session) {
  if (typeof window === "undefined") return;
  const all = loadSessions();
  if (s.sourceRunId) {
    const idx = all.findIndex((x) => x.sourceRunId === s.sourceRunId);
    if (idx >= 0) {
      all[idx] = s;
      try {
        localStorage.setItem(KEY, JSON.stringify(all));
      } catch {
        /* noop */
      }
      return;
    }
  }
  all.unshift(s);
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* noop */
  }
}

export function deleteSession(id: string) {
  const all = loadSessions().filter((s) => s.id !== id);
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* noop */
  }
}

const ROUTINE_KEY = "seven-min-selected-routine-v1";

export function loadSelectedRoutine(fallback: string): string {
  if (typeof window === "undefined") return fallback;
  try {
    return localStorage.getItem(ROUTINE_KEY) || fallback;
  } catch {
    return fallback;
  }
}

export function saveSelectedRoutine(id: string) {
  try {
    localStorage.setItem(ROUTINE_KEY, id);
  } catch {
    /* noop */
  }
}

// ---------------------------------------------------------------------------
// Checkpoint store — V1 introduces the storage scaffolding for the
// partial-save arc. Writers and callers land in V3 (`saveCheckpoint`
// on every phase transition, `reconcileCheckpoint` on home mount) and
// V4 (Resume CTA reads via `loadCheckpoint`). The helpers below are
// fully functional but currently have no callers — that's
// intentional, per the slice plan in the shaping doc.
// ---------------------------------------------------------------------------

export type Checkpoint = {
  runId: string;
  routineId: string;
  routineName: string;
  exerciseIndex: number;
  completedExercises: number;
  totalExercises: number;
  skippedCount: number;
  startedAt: number; // ms epoch
  updatedAt: number; // ms epoch
  // Accumulated wall-clock time during phases when the workout was
  // actually active (not backgrounded). Source of truth for any
  // partial/completed Session's `durationSeconds`.
  elapsedActiveSeconds: number;
};

const CHECKPOINT_KEY = "seven-min-in-progress-v1";
const DEFAULT_FRESHNESS_MS = 10 * 60 * 1000; // 10 minutes
const DEFAULT_THRESHOLD = 1; // ≥1 work phase completed = "meaningful progress"

export function loadCheckpoint(): Checkpoint | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CHECKPOINT_KEY);
    if (!raw) return null;
    const cp = JSON.parse(raw) as Checkpoint;
    // Minimal shape validation — if the schema is wrong, treat as absent.
    if (
      typeof cp.runId !== "string" ||
      typeof cp.routineId !== "string" ||
      typeof cp.exerciseIndex !== "number" ||
      typeof cp.updatedAt !== "number"
    ) {
      return null;
    }
    return cp;
  } catch {
    return null;
  }
}

// `saveCheckpoint` is a no-op in test mode AND refuses to overwrite an
// existing real checkpoint when invoked in test mode. This guarantees
// that `?test=1` runs never disturb the user's real-workout state,
// per R1 + critique finding 5.
export function saveCheckpoint(
  c: Checkpoint,
  opts: { test?: boolean } = {},
): void {
  if (typeof window === "undefined") return;
  if (opts.test) return;
  try {
    const next = { ...c, updatedAt: Date.now() };
    localStorage.setItem(CHECKPOINT_KEY, JSON.stringify(next));
  } catch {
    /* noop */
  }
}

// `clearCheckpoint` is scoped to a `runId` when provided. This is the
// safety net: a stale handler racing with a fresh run can't blow away
// the new run's checkpoint, because the runIds won't match. Pass no
// `runId` to force-clear (used by reconciliation, which knows the
// checkpoint it's reconciling).
export function clearCheckpoint(opts: { runId?: string } = {}): void {
  if (typeof window === "undefined") return;
  try {
    if (opts.runId) {
      const cp = loadCheckpoint();
      if (cp && cp.runId !== opts.runId) return;
    }
    localStorage.removeItem(CHECKPOINT_KEY);
  } catch {
    /* noop */
  }
}

export type ReconcileResult =
  | { kind: "none" }
  | { kind: "fresh"; checkpoint: Checkpoint }
  | { kind: "reconciled-partial"; session: Session }
  | { kind: "reconciled-completed"; session: Session }
  | { kind: "discarded" };

export type ReconcileOptions = {
  freshnessMs?: number;
  thresholdExercises?: number;
  // Optional predicate for whether the routine referenced by the
  // checkpoint still exists. When `false`, the checkpoint is treated
  // as stale-past-threshold so the user's effort still gets credit
  // (with the last-known `routineName`). Defaults to always-valid;
  // V4 will pass a real check against the ROUTINES catalog.
  isRoutineValid?: (id: string) => boolean;
  now?: () => number;
};

// `reconcileCheckpoint` is called on home mount. It branches on the
// checkpoint's state:
//   - none           → no checkpoint to act on
//   - completed-pending (all exercises done but unsaved) → write a
//     completed Session with `difficulty: null` and clear
//   - fresh + routine valid → expose for Resume CTA (no write, no clear)
//   - stale or routine missing, above threshold → write a partial
//     Session and clear (idempotent via `sourceRunId`)
//   - stale or routine missing, below threshold → clear silently
export function reconcileCheckpoint(
  opts: ReconcileOptions = {},
): ReconcileResult {
  if (typeof window === "undefined") return { kind: "none" };
  const cp = loadCheckpoint();
  if (!cp) return { kind: "none" };

  const freshness = opts.freshnessMs ?? DEFAULT_FRESHNESS_MS;
  const threshold = opts.thresholdExercises ?? DEFAULT_THRESHOLD;
  const isRoutineValid = opts.isRoutineValid ?? (() => true);
  const now = (opts.now ?? Date.now)();

  const age = now - cp.updatedAt;
  const routineValid = isRoutineValid(cp.routineId);

  // Completed-pending — user finished every exercise but closed the
  // app before tapping Save on the DoneScreen.
  if (cp.totalExercises > 0 && cp.completedExercises >= cp.totalExercises) {
    const session: Session = {
      id: crypto.randomUUID(),
      completedAt: cp.updatedAt,
      durationSeconds: Math.max(0, Math.round(cp.elapsedActiveSeconds)),
      difficulty: null,
      routineId: cp.routineId,
      routineName: cp.routineName,
      status: "completed",
      completedExercises: cp.completedExercises,
      totalExercises: cp.totalExercises,
      skippedCount: cp.skippedCount,
      sourceRunId: cp.runId,
    };
    saveSession(session);
    clearCheckpoint();
    return { kind: "reconciled-completed", session };
  }

  if (age < freshness && routineValid) {
    return { kind: "fresh", checkpoint: cp };
  }

  if (cp.completedExercises >= threshold) {
    const session: Session = {
      id: crypto.randomUUID(),
      completedAt: cp.updatedAt,
      durationSeconds: Math.max(0, Math.round(cp.elapsedActiveSeconds)),
      difficulty: null,
      routineId: cp.routineId,
      routineName: cp.routineName,
      status: "partial",
      completedExercises: cp.completedExercises,
      totalExercises: cp.totalExercises,
      skippedCount: cp.skippedCount,
      sourceRunId: cp.runId,
    };
    saveSession(session);
    clearCheckpoint();
    return { kind: "reconciled-partial", session };
  }

  clearCheckpoint();
  return { kind: "discarded" };
}

// ---------------------------------------------------------------------------
// Read-side helpers. All three are filtered through `isCompletedSession`
// so partials never contribute to today's count, the streak, or the
// 7-day chart. Partials live only in the history list.
// ---------------------------------------------------------------------------

const dayKey = (ts: number) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

export function todayCount(sessions: Session[]): number {
  const k = dayKey(Date.now());
  return sessions.filter(
    (s) => isCompletedSession(s) && dayKey(s.completedAt) === k,
  ).length;
}

export function last7Days(sessions: Session[]): { date: Date; count: number }[] {
  const out: { date: Date; count: number }[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const completed = sessions.filter(isCompletedSession);
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const k = dayKey(d.getTime());
    out.push({
      date: d,
      count: completed.filter((s) => dayKey(s.completedAt) === k).length,
    });
  }
  return out;
}

export function currentStreak(sessions: Session[]): number {
  const completed = sessions.filter(isCompletedSession);
  if (completed.length === 0) return 0;
  const days = new Set(completed.map((s) => dayKey(s.completedAt)));
  let streak = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  // If today has none, start from yesterday so streak isn't broken until midnight tomorrow
  if (!days.has(dayKey(cursor.getTime()))) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while (days.has(dayKey(cursor.getTime()))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
