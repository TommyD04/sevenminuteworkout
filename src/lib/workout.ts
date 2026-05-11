import {
  Activity,
  Anchor,
  Armchair,
  ArrowUpFromLine,
  ChevronsUp,
  Flame,
  Footprints,
  MoveDown,
  MoveUp,
  Repeat,
  StretchHorizontal,
  Triangle,
  Zap,
  type LucideIcon,
} from "lucide-react";

export type Exercise = {
  name: string;
  tip: string;
  icon: LucideIcon;
};

export const EXERCISES: Exercise[] = [
  { name: "Jumping Jacks", tip: "Stay light on your feet, full range of motion.", icon: Zap },
  { name: "Wall Sit", tip: "Thighs parallel to floor, back flat against wall.", icon: ChevronsUp },
  { name: "Push-ups", tip: "Body in a straight line, elbows ~45°.", icon: ArrowUpFromLine },
  { name: "Crunches", tip: "Lift shoulders, not your neck. Slow and controlled.", icon: MoveUp },
  { name: "Step-ups on Chair", tip: "Drive through the heel. Alternate legs.", icon: Armchair },
  { name: "Squats", tip: "Knees track over toes, chest up.", icon: MoveDown },
  { name: "Tricep Dips", tip: "Elbows back, not flared. Lower until 90°.", icon: Triangle },
  { name: "Plank", tip: "Straight line head to heels. Brace your core.", icon: Anchor },
  { name: "High Knees", tip: "Drive knees up to hip height. Pump your arms.", icon: Activity },
  { name: "Lunges", tip: "Both knees at 90°. Front knee over ankle.", icon: Footprints },
  { name: "Push-up + Rotation", tip: "Push-up, then open into a side plank.", icon: Repeat },
  { name: "Side Plank", tip: "30s each side. Hips lifted, body straight.", icon: StretchHorizontal },
];

export const WORK_SECONDS = 30;
export const REST_SECONDS = 10;
export const READY_SECONDS = 5;
export const TOTAL_SECONDS =
  EXERCISES.length * WORK_SECONDS + (EXERCISES.length - 1) * REST_SECONDS;

export type Phase = "ready" | "work" | "rest" | "done";

export const FlameIcon = Flame;

export type Routine = {
  id: string;
  name: string;
  locked: boolean;
};

export const ROUTINES: Routine[] = [
  { id: "classic", name: "The Classic 7", locked: false },
  { id: "soon-1", name: "Forthcoming", locked: true },
  { id: "soon-2", name: "Forthcoming", locked: true },
];

export const DEFAULT_ROUTINE_ID = "classic";

