import {
  Activity,
  Anchor,
  ArrowUpFromLine,
  ChevronsUp,
  Flame,
  Footprints,
  MoveDown,
  MoveUp,
  Repeat,
  StretchHorizontal,
  Triangle,
  TrendingUp,
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
  { name: "Step-ups on Chair", tip: "Drive through the heel. Alternate legs.", icon: TrendingUp },
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
  exercises: Exercise[];
};

const ADVANCED_EXERCISES: Exercise[] = [
  { name: "Burpees", tip: "Squat, kick back, push-up, jump up. Stay smooth.", icon: Zap },
  { name: "Mountain Climbers", tip: "Hips low, drive knees fast to chest.", icon: Activity },
  { name: "Jump Squats", tip: "Land soft, sink straight back into the next rep.", icon: MoveDown },
  { name: "Single-leg Deadlift", tip: "Hinge at the hip, back flat, balance.", icon: ChevronsUp },
  { name: "Push-up + Rotation", tip: "Push-up, then open into a side plank.", icon: Repeat },
  { name: "Walking Lunges", tip: "Long stride, both knees to 90°.", icon: Footprints },
  { name: "Side Plank w/ Leg Raise", tip: "30s each side. Lift the top leg slowly.", icon: StretchHorizontal },
  { name: "Tricep Dips", tip: "Elbows back, not flared. Lower until 90°.", icon: Triangle },
  { name: "Skater Jumps", tip: "Bound side to side, land on one foot.", icon: ArrowUpFromLine },
  { name: "Plank Up-downs", tip: "Forearm to hand, alternate lead arm.", icon: Anchor },
  { name: "V-ups", tip: "Reach hands to toes. Slow on the way down.", icon: MoveUp },
  { name: "Spiderman Push-up", tip: "Knee to elbow as you lower.", icon: TrendingUp },
];

const CORE_EXERCISES: Exercise[] = [
  { name: "Plank", tip: "Straight line head to heels. Brace your core.", icon: Anchor },
  { name: "Bicycle Crunches", tip: "Elbow to opposite knee. Slow and controlled.", icon: Repeat },
  { name: "Mountain Climbers", tip: "Hips low, drive knees fast to chest.", icon: Activity },
  { name: "Russian Twists", tip: "Lean back, rotate from the ribs not the arms.", icon: MoveUp },
  { name: "Leg Raises", tip: "Lower with control. Don't let the low back arch.", icon: MoveDown },
  { name: "Side Plank", tip: "30s each side. Hips lifted, body straight.", icon: StretchHorizontal },
  { name: "Reverse Crunch", tip: "Curl hips up toward ribs. Small range, all core.", icon: ChevronsUp },
  { name: "Flutter Kicks", tip: "Low and quick. Press low back into the floor.", icon: Zap },
  { name: "Hollow Hold", tip: "Lower back glued down. Arms and legs off the floor.", icon: TrendingUp },
  { name: "Toe Touches", tip: "Reach straight up to toes. Exhale at the top.", icon: ArrowUpFromLine },
  { name: "Boat Pose", tip: "Lift chest, balance on sit-bones, hold.", icon: Triangle },
  { name: "Plank Shoulder Taps", tip: "Hips still — don't let them rock.", icon: Footprints },
];

export const ROUTINES: Routine[] = [
  { id: "classic", name: "The Classic 7", locked: false, exercises: EXERCISES },
  { id: "advanced", name: "The Advanced 7", locked: false, exercises: ADVANCED_EXERCISES },
  { id: "core", name: "The Core 7", locked: false, exercises: CORE_EXERCISES },
];

export const DEFAULT_ROUTINE_ID = "classic";

