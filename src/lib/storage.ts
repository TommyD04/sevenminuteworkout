export type Session = {
  id: string;
  completedAt: number; // ms epoch
  durationSeconds: number;
  difficulty: number; // 1-5
  note?: string;
  routineId?: string; // back-compat: missing = "classic"
  routineName?: string;
};

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

export function saveSession(s: Session) {
  const all = loadSessions();
  all.unshift(s);
  localStorage.setItem(KEY, JSON.stringify(all));
}

export function deleteSession(id: string) {
  const all = loadSessions().filter((s) => s.id !== id);
  localStorage.setItem(KEY, JSON.stringify(all));
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

const dayKey = (ts: number) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

export function todayCount(sessions: Session[]): number {
  const k = dayKey(Date.now());
  return sessions.filter((s) => dayKey(s.completedAt) === k).length;
}

export function last7Days(sessions: Session[]): { date: Date; count: number }[] {
  const out: { date: Date; count: number }[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const k = dayKey(d.getTime());
    out.push({
      date: d,
      count: sessions.filter((s) => dayKey(s.completedAt) === k).length,
    });
  }
  return out;
}

export function currentStreak(sessions: Session[]): number {
  if (sessions.length === 0) return 0;
  const days = new Set(sessions.map((s) => dayKey(s.completedAt)));
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
